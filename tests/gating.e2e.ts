// ============================================================================
// Phase 10 — server-side gating verification (security).
//
// Proves the core POC property end-to-end: locked protected_content is NEVER
// sent to an unauthorized client. Drives a RUNNING dev server over HTTP (no
// browser deps) and inspects the actual response bodies.
//
//   Run:  npm run test:gating          (needs `npm run dev` already running)
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY (to mint + clean up an ephemeral signed-in user).
// All Supabase calls go through the REST/Auth APIs via fetch — no supabase-js,
// so there is no realtime/WebSocket dependency (runs on Node 18/20/22+).
//
// Scenarios (every FULL marker is the protected body; the preview must always
// be present so we know the page actually rendered and didn't just error):
//   • Signed OUT  → A, B(over-limit), C, D    : preview yes, FULL no  (gated)
//   • Signed IN, unentitled, not onboarded:
//        A  → payment gate    : FULL no
//        B  → meter exhausted (we pre-insert 2 events) → payment gate : FULL no
//        D  → onboarding gate  : FULL no
//   • Signed IN positive sanity:
//        C  → registration satisfied : FULL YES (guards against false passes)
// ============================================================================
import { readFileSync } from "node:fs";

// ── Minimal .env.local loader (matches scripts/verify-db.ts) ────────────────
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* fall back to ambient env */
}

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(2);
}

// ── tiny assert harness ─────────────────────────────────────────────────────
let failed = false;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
};

// ── Supabase REST/Auth helper (service key by default; bypasses RLS) ────────
async function sb(path: string, init: RequestInit = {}, key: string = serviceKey!): Promise<Response> {
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

type Target = { path: string; marker: string; preview: string };

const TARGETS: Record<"A" | "B" | "C" | "D", Target> = {
  A: { path: "/sites/site-a/quantum-markets", marker: "FULL A1", preview: "Markets are moving" },
  B: { path: "/sites/site-b/over-the-limit", marker: "FULL B3", preview: "Opening of a third metered" },
  C: { path: "/sites/site-c/members-preview", marker: "FULL C1", preview: "Anyone reads this preview" },
  D: { path: "/sites/site-d/the-vault", marker: "FULL D1", preview: "Preview of premium content" },
};

async function getBody(path: string, cookie?: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return res.text();
}

// ── Forge the @supabase/ssr auth cookie from a real session ─────────────────
// Format (v0.5.x, default base64url encoding): cookie name `sb-<ref>-auth-token`,
// value `base64-<base64url(JSON.stringify(session))>`, chunked at 3180 chars
// into `<name>.0`, `<name>.1`, … when large. base64url + the prefix are pure
// ASCII, so encodeURIComponent is identity and chunking is a plain slice.
const MAX_CHUNK = 3180;

function projectRef(supabaseUrl: string): string {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

function buildCookieHeader(session: unknown): string {
  const key = `sb-${projectRef(url!)}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const pairs: string[] = [];
  if (value.length <= MAX_CHUNK) {
    pairs.push(`${key}=${value}`);
  } else {
    for (let i = 0, pos = 0; pos < value.length; pos += MAX_CHUNK, i++) {
      pairs.push(`${key}.${i}=${value.slice(pos, pos + MAX_CHUNK)}`);
    }
  }
  return pairs.join("; ");
}

async function main() {
  console.log(`Gating e2e against ${BASE_URL}\n`);

  // ── 1. Signed-out: nothing should leak for any site type ──────────────────
  for (const k of ["A", "B", "C", "D"] as const) {
    const t = TARGETS[k];
    const body = await getBody(t.path);
    check(`signed-out ${k}: preview present`, body.includes(t.preview), t.path);
    check(`signed-out ${k}: NO protected marker`, !body.includes(t.marker), t.marker);
  }

  // ── 2. Mint an ephemeral signed-in user (Auth Admin API) ──────────────────
  const email = `gating+${Date.now()}@example.com`;
  const password = `Gating!${Math.random().toString(36).slice(2)}`;

  const created = await sb("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createdUser = (await created.json()) as { id?: string; msg?: string };
  if (!created.ok || !createdUser.id) {
    check("create ephemeral test user", false, createdUser.msg ?? `HTTP ${created.status}`);
    console.log("\ntest:gating FAILED");
    process.exit(1);
  }
  const authUserId = createdUser.id;

  try {
    // profile is created by the on_auth_user_created trigger.
    const prRes = await sb(`/rest/v1/profiles?supabase_user_id=eq.${authUserId}&select=id,onboarding_status`);
    const profiles = (await prRes.json()) as { id: string; onboarding_status: string }[];
    const profile = profiles[0];
    check("auto-profile created (pending)", !!profile && profile.onboarding_status !== "complete");

    // Exhaust Site B's meter so the over-limit article hits the payment gate.
    const siteB = ((await (await sb(`/rest/v1/sites?slug=eq.site-b&select=id,meter_limit`)).json()) as
      { id: string; meter_limit: number }[])[0];
    const anyB = ((await (await sb(`/rest/v1/articles?site_id=eq.${siteB.id}&select=id&limit=1`)).json()) as
      { id: string }[])[0];
    const limit = siteB?.meter_limit ?? 2;
    const events = Array.from({ length: limit }, () => ({
      user_id: profile!.id,
      site_id: siteB!.id,
      article_id: anyB!.id,
    }));
    const meterIns = await sb("/rest/v1/meter_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(events),
    });
    check(`pre-seed ${limit} meter events (exhaust Site B)`, meterIns.ok, meterIns.ok ? "" : `HTTP ${meterIns.status}`);

    // Sign in (password grant) → the token response IS the session shape we
    // need to forge the SSR cookie.
    const tokRes = await sb(
      "/auth/v1/token?grant_type=password",
      { method: "POST", body: JSON.stringify({ email, password }) },
      anonKey!
    );
    const session = (await tokRes.json()) as { access_token?: string };
    if (!tokRes.ok || !session.access_token) {
      check("sign in ephemeral user", false, `HTTP ${tokRes.status}`);
      throw new Error("sign-in failed");
    }
    const cookie = buildCookieHeader(session);

    // ── 3. Signed-in but unentitled: A / B(over-limit) / D must stay gated ──
    for (const k of ["A", "B", "D"] as const) {
      const t = TARGETS[k];
      const body = await getBody(t.path, cookie);
      check(`signed-in ${k}: preview present`, body.includes(t.preview), t.path);
      check(`signed-in ${k}: NO protected marker`, !body.includes(t.marker), t.marker);
    }

    // ── 4. Positive sanity: Site C IS readable once authenticated ───────────
    // (Guards against a false pass where the page errors and never emits FULL.)
    const cBody = await getBody(TARGETS.C.path, cookie);
    check("signed-in C: protected marker PRESENT (registration free)", cBody.includes(TARGETS.C.marker), TARGETS.C.marker);
  } finally {
    // Clean up — cascades to profile / meter_events / entitlements.
    await sb(`/auth/v1/admin/users/${authUserId}`, { method: "DELETE" });
    console.log(`\nCleaned up ephemeral user ${email}`);
  }

  console.log(failed ? "\ntest:gating FAILED" : "\ntest:gating OK — no protected content leaked to unauthorized clients");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
