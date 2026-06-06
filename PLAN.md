# PLAN.md — Moneda Phased Build

Phase-by-phase plan an agent (Claude Code or Codex) can execute one phase at a
time. Read **[INIT.md](./INIT.md)** first for setup and the locked-in
architecture decisions.

## How to use this document

Each phase has four parts:

1. **Goal** — what "done" means for this phase.
2. **Agent prompt** — copy-paste this to the agent to execute the phase.
3. **Automated verification** — commands the agent runs to prove the work
   compiles and passes tests (the agent's self-check).
4. **Local manual test** — exact steps *you* run in a browser/terminal to
   confirm the phase works end-to-end before moving on.

**Rules for the agent (include in every prompt):**
- Do not start a phase until the previous phase's verification passes.
- Honor the security invariant: `articles.protected_content` is read only by the
  service-role client, only after `checkAccess()` returns `allowed`.
- Service-role key is server-only; never import `src/lib/supabase/service.ts`
  into a client component.
- Keep comments sparse — only for non-obvious logic.
- After implementing, run the phase's automated verification and report results.

**Status legend:** ☐ not started · ◐ in progress · ☑ done

---

## Phase 0 — Scaffold & boot ☑ (delivered)

**Goal:** repo structure exists, dependencies install, dev server boots, the
demo index renders the four seeded sites.

> Already generated. Just verify before building on it.

**Automated verification**
```bash
npm install
npm run typecheck
npm run test
```

**Local manual test**
1. Complete INIT.md §3–§4 (env + database).
2. `npm run dev` → open http://localhost:3000.
3. You see four sites listed (The Daily Ledger, Meter Times, Open Register,
   Premium Vault). Clicking one lists its articles.

---

## Phase 1 — Database: schema, RLS & seed ☑

**Goal:** schema applied, RLS enforced, four demo sites + nine articles seeded.

> **Done (2026-06-06).** `verify:db` script + `npm run verify:db` added; explicit
> table-level grants added to the migration so the security model no longer
> relies on Supabase's implicit default privileges. Verified offline against a
> real Postgres 16 cluster (Supabase `auth` schema shimmed): 10/10 assertions
> pass — 4 sites, 9 articles, site-b meter_limit=2, `articles_public` hides
> `protected_content`, anon reads sites + previews, anon AND authenticated both
> blocked from `articles.protected_content`, and the auto-profile trigger fires
> with own-row RLS enforced. Run `npm run verify:db` once real Supabase creds
> exist to confirm the same on the hosted project.

**Agent prompt**
> Apply `supabase/migrations/0001_init.sql` and `supabase/seed.sql` to the
> Supabase project (see INIT.md §4). Then add a script `scripts/verify-db.ts`
> that, using the **anon** client, asserts: (a) `sites` returns 4 rows; (b)
> `articles_public` returns 9 rows and has NO `protected_content` column; (c) a
> direct `select protected_content from articles` via the anon client returns no
> rows / is blocked by RLS. Wire it as `npm run verify:db`.

**Automated verification**
```bash
npm run verify:db     # all assertions pass
```

**Local manual test**
1. In the Supabase SQL editor run: `select slug, paywall_type, meter_limit from sites order by slug;`
   → 4 rows, site-b has `meter_limit = 2`.
2. Run `select count(*) from articles;` → 9.
3. In the SQL editor's "API" or via `curl` with the **anon** key, attempt to read
   `articles.protected_content` → blocked/empty. With the **service-role** key →
   returns the text. This proves RLS.

---

## Phase 2 — Auth & sessions ☐

**Goal:** users can sign up / sign in (email+password, magic link, OAuth
Google/GitHub); session persists across requests; a `profiles` row exists per
user; signed-in state is readable in Server Components.

**Agent prompt**
> Implement Supabase Auth in `src/app/login/page.tsx`: email+password (sign up +
> sign in), magic link, and OAuth (Google, GitHub) using the browser client from
> `src/lib/supabase/client.ts`. Handle the OAuth/magic-link redirect in the
> existing `src/app/auth/callback/route.ts`. After auth, redirect to
> `/onboarding` if `profiles.onboarding_status !== 'complete'`, else to `/`.
> Confirm `src/middleware.ts` refreshes sessions. Add a small server-side
> `getCurrentProfile()` helper in `src/lib/identity.ts` that returns the user's
> profile row (id, onboarding_status) or null. The `profiles` row is created
> automatically by the `on_auth_user_created` trigger — verify it fires.

**Automated verification**
```bash
npm run typecheck
npm run lint
```

**Local manual test**
1. `npm run dev`, go to `/login`, sign up with email+password.
2. In Supabase → Authentication → Users, your user exists; in Table editor →
   `profiles`, a matching row exists with `onboarding_status = pending`.
3. Refresh `/` — you remain signed in (session persists).
4. (If OAuth configured) sign in with Google/GitHub succeeds and returns to app.

---

## Phase 3 — Access engine completion ☐

**Goal:** `checkAccess()` correctly decides all four rules + the entitlement
precheck, fully unit-tested. No payments yet.

**Agent prompt**
> Complete and harden `src/lib/access/engine.ts` for all branches: `hard` →
> payment gate at `article.price ?? site.default_price`; `registration` → allowed
> once authenticated; `custom` → onboarding gate first, then payment gate;
> `metered` → allowed while `meter_events` count for (user, site) < `meter_limit`,
> else payment gate; and the universal precheck that an `active` entitlement for
> the article grants access regardless of rule. Then fill in the TODO cases in
> `tests/access-engine.test.ts` by mocking the service client to return
> controlled entitlement/meter data. Cover every branch.

**Automated verification**
```bash
npm run test          # every checkAccess branch covered and green
npm run typecheck
```

**Local manual test**
- Engine is pure logic; rely on unit tests here. End-to-end behavior is verified
  in Phases 4, 6, 7, 8.

---

## Phase 4 — Demo pages & server-side gating ☐

**Goal:** site index, per-site article list, and the article page render
correctly; locked articles ship preview only; entitled/free articles render
protected content — all decided server-side.

**Agent prompt**
> Polish `src/app/page.tsx`, `src/app/sites/[siteSlug]/page.tsx`, and
> `src/app/sites/[siteSlug]/[articleSlug]/page.tsx`. The article page must: load
> the user's profile, call `checkAccess()`, and fetch `protected_content` ONLY
> when `decision.allowed`. When denied, render `<PaywallModal>` with the gate and
> ensure `protected_content` is absent from the response. Style the pages
> minimally. Do not implement payment yet — the unlock button can route auth/
> onboarding gates; the payment gate button may remain a stub.

**Automated verification**
```bash
npm run typecheck
npm run build         # pages compile and prerender where possible
```

**Local manual test**
1. Signed OUT, open a Site A article → preview + paywall modal; **View Source**
   (Cmd-U) and search for "FULL A1" → not present.
2. Open a Site C (registration) article signed OUT → modal says "Sign in".
3. Sign in (Phase 2), open the Site C article → full content renders (free).
4. Site A article still shows the paywall (payment gate) when signed in.

---

## Phase 5 — Onboarding: save card via SetupIntent ☐

**Goal:** during onboarding the user saves a card (no charge); the app stores
`stripe_customer_id` + `payment_method_id` and marks onboarding complete.

**Agent prompt**
> Implement `src/app/api/stripe/setup-intent/route.ts`: authenticate the user,
> get-or-create their Stripe customer (persist `stripe_customer_id` on the
> profile via the service client), create a `SetupIntent` for that customer, and
> return `{ clientSecret }`. Implement `src/app/onboarding/page.tsx` with embedded
> Stripe Elements (`<Elements>` + `<PaymentElement>`) using
> `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, confirm the SetupIntent client-side, then
> POST to a new `src/app/api/onboarding/complete/route.ts` that saves the
> resulting `payment_method_id` and sets `onboarding_status = 'complete'`. Use
> test card `4242 4242 4242 4242`.

**Automated verification**
```bash
npm run typecheck
npm run build
```

**Local manual test**
1. Sign in, go to `/onboarding`, enter `4242 4242 4242 4242`, submit.
2. In Stripe Dashboard (test) → Customers, your customer exists with a saved
   payment method.
3. In `profiles`, your row has `stripe_customer_id`, `payment_method_id`, and
   `onboarding_status = complete`.
4. Revisit `/onboarding` — it recognizes completion (no re-entry needed).

---

## Phase 6 — Paid unlock: off-session charge (sync path) ☐

**Goal:** one click on a payment paywall charges the saved card off-session and
grants an article-level entitlement synchronously; content renders immediately.

**Agent prompt**
> Implement `src/app/api/unlock/route.ts` per its header comment: authenticate;
> load profile (must be onboarded with a `payment_method_id`); load site+article;
> **re-run `checkAccess()` server-side** and read the owed amount from the
> returned payment gate (never trust the client); record an `unlock_attempt`;
> create+confirm a PaymentIntent with `customer`, `payment_method`,
> `off_session: true`, `confirm: true`. On `succeeded`, insert an `entitlement`
> with `ON CONFLICT (stripe_payment_intent_id) DO NOTHING` and return
> `{ status: "succeeded" }`. On `requires_action`, return
> `{ status: "requires_action", clientSecret }`. Update the unlock_attempt status
> throughout. Wire the payment path in `src/components/unlock-button.tsx` to
> `router.refresh()` on success.

**Automated verification**
```bash
npm run typecheck
npm run build
```

**Local manual test**
1. Onboarded user, open a Site A article → click **Unlock for $1.00**.
2. Within ~1s the modal disappears and full content ("FULL A1") renders — no
   redirect.
3. Stripe Dashboard → Payments shows a $1.00 succeeded test charge.
4. `entitlements` has a new row for (user, article) with the payment_intent id.
5. Reload the page → content renders immediately (entitlement precheck).

---

## Phase 7 — Webhook reconciliation & idempotency ☐

**Goal:** if the sync path is interrupted after charging, the webhook still
grants the entitlement; double-writes are no-ops.

**Agent prompt**
> Implement `src/app/api/stripe/webhook/route.ts`: read the raw body, verify the
> signature with `STRIPE_WEBHOOK_SECRET`, and on `payment_intent.succeeded`
> upsert the same entitlement using `ON CONFLICT (stripe_payment_intent_id) DO
> NOTHING`, deriving user/site/article from PaymentIntent metadata (set that
> metadata in the Phase 6 unlock route). Ensure this route uses the Node runtime
> and does not pre-parse JSON.

**Automated verification**
```bash
npm run typecheck
npm run build
# with `npm run stripe:listen` running:
stripe trigger payment_intent.succeeded   # webhook handler returns 200
```

**Local manual test**
1. Run `npm run stripe:listen` (forwards to the webhook).
2. In `src/app/api/unlock/route.ts`, temporarily `throw` right *after* the
   PaymentIntent confirm but *before* the entitlement insert; restart dev.
3. Unlock a fresh Site D article ($2.50) — the click errors, but Stripe charged.
4. Within seconds the webhook fires and the `entitlements` row appears anyway.
5. Reload the article → content renders. Remove the temporary `throw`.
6. Trigger the same payment twice → only one entitlement row (idempotent).

---

## Phase 8 — Metering (Site B) ☐

**Goal:** Site B grants free reads under the limit (logging a meter event each
time) and shows the paywall once the limit is exceeded.

**Agent prompt**
> In `src/app/sites/[siteSlug]/[articleSlug]/page.tsx`, when `checkAccess()`
> returns `allowed` with reason `under_meter`, insert a `meter_events` row (user,
> site, article) via the service client — exactly once per view, and never for
> entitled or non-metered access. Confirm the engine's metered branch counts
> events per (user, site) against `site.meter_limit` (= 2). Permanent count, no
> reset.

**Automated verification**
```bash
npm run test          # metered branch tests still green
npm run typecheck
```

**Local manual test**
1. Onboarded user. Open Site B article #1 → full content (free), 1 meter event.
2. Open Site B article #2 → full content (free), 2 meter events.
3. Open Site B article #3 → paywall ("Unlock for $0.99"); `meter_events` count
   for the site is 2 (no event logged for the gated view).
4. Pay $0.99 → article #3 unlocks via entitlement.

---

## Phase 9 — Presentation polish & 3DS fallback ☐

**Goal:** the paywall modal has clean locked/loading/success/error states, and
the one-click charge degrades gracefully to a 3DS confirmation when required.

**Agent prompt**
> Finish `src/components/paywall-modal.tsx` and
> `src/components/unlock-button.tsx`: render distinct loading, success, and error
> states. On `{ status: "requires_action", clientSecret }` from `/api/unlock`,
> load `@stripe/stripe-js` and call `stripe.confirmCardPayment(clientSecret)`;
> on success, `router.refresh()`. Keep the happy path a single click. Ensure CTA
> labels match the gate ("Unlock for $X.XX", "Sign in to continue", "Finish
> setup to unlock").

**Automated verification**
```bash
npm run typecheck
npm run build
```

**Local manual test**
1. Add the 3DS test card `4000 0027 6000 3184` during onboarding (or as the PM).
2. Unlock a paid article → a 3DS modal appears; confirm it → content renders.
3. With `4242…` the unlock stays one click (no 3DS).
4. With `4000 0000 0000 9995` (declined) → clean error message, no entitlement.

---

## Phase 10 — Server-side gating verification (security) ☐

**Goal:** prove locked protected content is never sent to unauthorized clients,
across all four site types.

**Agent prompt**
> Add an automated check `tests/gating.e2e.ts` (Playwright, MCP browser, or a
> fetch-based test against a running dev server) that, for a signed-out user and
> a signed-in-but-unentitled user, requests one article of each type (A/B-over-
> limit/C-signed-out/D) and asserts the response body contains the preview but
> NOT the `FULL …` protected marker. Add `npm run test:gating`. Document running
> it in this file.

**Automated verification**
```bash
npm run test:gating   # no protected markers leak for unauthorized users
```

**Local manual test**
1. For each of Site A, B (over limit), C (signed out), D: open the article while
   unauthorized, **View Source**, search for the `FULL` marker → absent.
2. Open DevTools → Network → the document/RSC responses → search for the marker
   → absent. After unlocking, it appears.

---

## Phase 11 — Deploy (Vercel Hobby) ☐

**Goal:** the POC runs on a public Vercel URL with a live Stripe test webhook.

**Agent prompt**
> Deploy to Vercel (see INIT.md §9). Set all env vars in the Vercel project. Add
> a Stripe webhook endpoint for `https://<deployment>/api/stripe/webhook` and set
> `STRIPE_WEBHOOK_SECRET`. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL.
> Re-run the Phase 10 gating test against the deployed URL.

**Automated verification**
```bash
vercel --prod
npm run test:gating   # against the deployed URL
```

**Local manual test (against prod URL)**
1. Sign up → onboard with `4242…` → unlock one article on each of Sites A–D.
2. Confirm entitlements appear in Supabase and charges in Stripe (test).
3. Sign out / back in → previously unlocked articles render without re-paying.

---

## Definition of Done (whole POC)

An onboarded test user visits Sites A–D, sees the correct paywall behavior for
each, clicks one CTA to unlock (paying via Stripe test mode where required),
immediately reads server-gated content, and finds entitlements persisted in
Supabase — all on free-tier infra, with `protected_content` never leaked to
unauthorized clients (Phase 10 green).
