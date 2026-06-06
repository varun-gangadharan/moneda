# INIT.md — Moneda Bootstrap

Centralized Article Access POC. **Onboard once. Tap once. Unlock anywhere.**

This file gets a fresh machine (or a fresh agent) from zero to a running dev
environment. For the phase-by-phase build, see **[PLAN.md](./PLAN.md)**.

---

## 0. Architecture in one screen

One Next.js (App Router) app on Vercel. Supabase for Auth + Postgres. Stripe
test mode for payments. Five modules map to code:

| Module        | Where                              | Job |
|---------------|------------------------------------|-----|
| Identity      | `src/lib/supabase/*`, `profiles`   | Auth, profile, Stripe-customer link, onboarding status |
| Entitlement   | `entitlements`, access engine      | Store + check unlocks (article-level for MVP) |
| Metering      | `meter_events`                     | Count free views (permanent, no reset) |
| Payment       | `src/lib/stripe.ts`, `api/*`       | Save card (SetupIntent), off-session charge, webhook |
| Presentation  | `src/components/*`, article page   | Paywall modal, one-click CTA, state machine |

**Locked-in decisions:**
- Paid unlock = save card via **SetupIntent** at onboarding → later
  **off-session PaymentIntent** (`confirm: true`) = true one click, with a 3DS
  `requires_action` fallback.
- Payment truth = **synchronous PaymentIntent result is primary**, webhook
  reconciles. Both writes idempotent on `stripe_payment_intent_id`.
- Sites = **one app, route-based** `/sites/[siteSlug]/[articleSlug]`.
- Entitlements = **article-level only**.
- Meter = **permanent count**. Popup = **on reaching locked content**.
- DB security = **server-only writes (service role) + RLS on** everywhere.

**The one security invariant:** `articles.protected_content` is read only by the
service-role client, only after `checkAccess()` passes. It must never appear in a
response to an unauthorized user. Phase 10 tests this directly.

---

## 1. Prerequisites

- **Node ≥ 18.18** (this machine has 18.8 — upgrade first, e.g. `nvm install 20 && nvm use 20`).
- **npm** (ships with Node).
- A **Supabase** account (free tier) — https://supabase.com
- A **Stripe** account in **test mode** — https://stripe.com
- **Supabase CLI** — `npm i -g supabase` (for local db reset/seed).
- **Stripe CLI** — https://stripe.com/docs/stripe-cli (for webhook forwarding).

---

## 2. Install

```bash
npm install
```

## 3. Environment

```bash
cp .env.example .env.local
```

Fill `.env.local`:
- **Supabase** → Dashboard → Project Settings → API: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Stripe** (toggle to **Test mode**) → Developers → API keys:
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`.
- `STRIPE_WEBHOOK_SECRET` comes from step 5 (`stripe listen`).

> `SUPABASE_SERVICE_ROLE_KEY` has **no** `NEXT_PUBLIC_` prefix on purpose. It must
> never reach the browser. Only `src/lib/supabase/service.ts` may use it.

## 4. Database

Apply schema + seed the four demo sites. Either via the Supabase SQL editor
(paste both files) or the CLI against a linked project:

```bash
# CLI route (linked remote project)
supabase link --project-ref <ref>
supabase db push                       # applies supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/seed.sql

# or local stack
supabase start
supabase db reset                      # runs migrations + seed.sql automatically
```

Verify: `sites` has 4 rows (site-a..d), `articles` has 9 rows.

## 5. Stripe webhook (separate terminal)

```bash
npm run stripe:listen
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET in .env.local
```

## 6. Run

```bash
npm run dev          # http://localhost:3000
```

You should see the demo site index listing The Daily Ledger, Meter Times, Open
Register, and Premium Vault.

---

## 7. Quick health checks

```bash
npm run typecheck    # types compile
npm run test         # access-engine unit tests
npm run lint
```

Manual smoke test: open `/`, click a site, open an article — the paywall modal
should appear (full build of the unlock flow is delivered across PLAN.md phases).

---

## 8. Demo test cards (Stripe test mode)

| Card                  | Behavior |
|-----------------------|----------|
| `4242 4242 4242 4242` | Succeeds, **no** 3DS — use for the one-click happy path |
| `4000 0027 6000 3184` | Requires **3DS** — use to demo the `requires_action` fallback |
| `4000 0000 0000 9995` | Declined (insufficient funds) — use for the error state |

Any future expiry, any CVC, any ZIP.

---

## 9. Deploy (Vercel Hobby)

```bash
vercel               # link + deploy preview
vercel --prod        # production
```

Set all `.env.local` vars in the Vercel project (Settings → Environment
Variables). Add a **Stripe webhook endpoint** pointing at
`https://<deployment>/api/stripe/webhook` and put its signing secret in
`STRIPE_WEBHOOK_SECRET`. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL.
