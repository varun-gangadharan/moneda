// Phase 1 verification against a live Supabase project, using the ANON client
// (i.e. exactly what an untrusted browser can see). Asserts the seed loaded and
// the security invariant holds. Run: npm run verify:db
//
// Mirrors the offline Postgres checks; this version proves it on real Supabase.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader so the script is runnable standalone.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* fall back to ambient env */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(2);
}

const db = createClient(url, anonKey);
let failed = false;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
};

async function main() {
  // (a) anon can read public site config — expect 4 seeded sites.
  const sites = await db.from("sites").select("slug");
  check("anon reads 4 sites", sites.data?.length === 4, `got ${sites.data?.length ?? "error"}`);

  // (b) anon reads previews via the view — expect 9 articles, no protected col.
  const pub = await db.from("articles_public").select("*");
  check("anon reads 9 article previews", pub.data?.length === 9, `got ${pub.data?.length ?? "error"}`);
  check(
    "articles_public hides protected_content",
    !!pub.data && pub.data.length > 0 && !("protected_content" in pub.data[0])
  );

  // (c) anon CANNOT read articles.protected_content — RLS/grants must block it.
  const leak = await db.from("articles").select("protected_content");
  const blocked = !!leak.error || (leak.data?.length ?? 0) === 0;
  check("anon blocked from articles.protected_content", blocked, leak.error?.message ?? "no rows");

  console.log(failed ? "\nverify:db FAILED" : "\nverify:db OK");
  process.exit(failed ? 1 : 0);
}

main();
