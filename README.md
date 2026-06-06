# Moneda

**Centralized Article Access POC — Onboard once. Tap once. Unlock anywhere.**

A user onboards once (identity + a saved payment method), then unlocks content
across any onboarded demo site with a single click. Different demo sites enforce
different paywall rules through one declarative access-control engine. Demo sites
and articles only — no real publisher integrations.

## Docs

- **[INIT.md](./INIT.md)** — setup, architecture overview, locked-in decisions, deploy.
- **[PLAN.md](./PLAN.md)** — phase-by-phase build plan with agent prompts, automated
  verification, and local manual tests for each phase.

## Stack

Next.js (App Router) · Supabase (Auth + Postgres) · Stripe (test mode) · Vercel Hobby.

## Quick start

```bash
nvm use 20            # Node >= 18.18 required
npm install
cp .env.example .env.local   # fill in Supabase + Stripe test keys
# apply supabase/migrations/0001_init.sql + supabase/seed.sql (see INIT.md §4)
npm run dev
```

## Layout

```
src/
  app/
    page.tsx                              demo site index
    login/                               auth (Phase 2)
    auth/callback/                       OAuth / magic-link callback
    onboarding/                          SetupIntent card save (Phase 5)
    sites/[siteSlug]/[articleSlug]/      server-gated article (Phases 4,6,8)
    api/unlock/                          off-session one-click charge (Phase 6)
    api/stripe/setup-intent/             onboarding card capture (Phase 5)
    api/stripe/webhook/                  payment reconciliation (Phase 7)
  lib/
    supabase/{client,server,service}.ts  RLS-bound + service-role clients
    stripe.ts                            Stripe server SDK
    access/{types,engine}.ts             the access-control engine (chokepoint)
  components/
    paywall-modal.tsx  unlock-button.tsx presentation (Phases 9)
supabase/
  migrations/0001_init.sql               schema + RLS
  seed.sql                               4 demo sites, 9 articles
tests/                                   unit + gating e2e
```

## Security invariant

`articles.protected_content` is read only by the service-role client, only after
`checkAccess()` returns `allowed`. It must never appear in a response to an
unauthorized user. RLS is enabled on every table as defense-in-depth. PLAN.md
Phase 10 verifies this directly.
