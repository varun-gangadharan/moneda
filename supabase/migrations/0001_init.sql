-- ============================================================================
-- Moneda — Centralized Article Access POC
-- Migration 0001: schema + RLS
--
-- Security model (see PLAN.md Phase 2):
--   * All sensitive writes go through Next.js server routes using the
--     service-role key, which bypasses RLS.
--   * RLS is enabled on every table as defense-in-depth: even with a leaked
--     anon key, a client can only read its OWN profile/entitlements/meter
--     events, and can NEVER read articles.protected_content.
--   * Reads of protected content happen exclusively server-side after
--     checkAccess() passes.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ─── enums ──────────────────────────────────────────────────────────────────
create type paywall_type   as enum ('hard', 'metered', 'registration', 'custom');
create type access_rule     as enum ('hard', 'metered', 'registration', 'custom');
create type entitlement_type as enum ('paid', 'registration', 'metered_grant');
create type entitlement_status as enum ('active', 'expired', 'revoked');
create type unlock_status   as enum ('pending', 'succeeded', 'requires_action', 'failed', 'canceled');

-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per Supabase auth user. Links identity <-> Stripe customer.
create table profiles (
  id                 uuid primary key default uuid_generate_v4(),
  supabase_user_id   uuid not null unique references auth.users(id) on delete cascade,
  email              text not null,
  stripe_customer_id text unique,
  payment_method_id  text,                       -- saved PM for off-session charges
  onboarding_status  text not null default 'pending', -- pending | complete
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── sites ──────────────────────────────────────────────────────────────────
-- Declarative config for each demo site. Adding a site = inserting a row.
create table sites (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  name          text not null,
  paywall_type  paywall_type not null,
  default_price integer not null default 0,      -- cents
  currency      text not null default 'usd',
  auth_required boolean not null default false,
  meter_limit   integer,                          -- free views before paywall (metered only)
  created_at    timestamptz not null default now()
);

-- ─── articles ───────────────────────────────────────────────────────────────
create table articles (
  id                uuid primary key default uuid_generate_v4(),
  site_id           uuid not null references sites(id) on delete cascade,
  slug              text not null,
  title             text not null,
  preview_content   text not null,                -- always safe to ship to client
  protected_content text not null,                -- NEVER ship unless checkAccess passes
  price             integer,                       -- cents; null => use site.default_price
  currency          text not null default 'usd',
  access_rule       access_rule not null,
  created_at        timestamptz not null default now(),
  unique (site_id, slug)
);

-- ─── entitlements ───────────────────────────────────────────────────────────
-- A successful unlock. Article-level for MVP (article_id always set).
create table entitlements (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references profiles(id) on delete cascade,
  site_id                  uuid not null references sites(id) on delete cascade,
  article_id               uuid references articles(id) on delete cascade,
  entitlement_type         entitlement_type not null,
  status                   entitlement_status not null default 'active',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  starts_at                timestamptz not null default now(),
  expires_at               timestamptz,
  created_at               timestamptz not null default now()
);

-- Idempotency: the synchronous unlock path and the webhook reconciliation path
-- both try to write the same entitlement. This unique index makes the second a
-- harmless no-op (ON CONFLICT DO NOTHING). See PLAN.md Phase 5.
create unique index entitlements_payment_intent_uniq
  on entitlements (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index entitlements_user_article_idx on entitlements (user_id, article_id);

-- ─── meter_events ───────────────────────────────────────────────────────────
-- One row per free view. Permanent for the POC (no reset).
create table meter_events (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  site_id    uuid not null references sites(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  event_type text not null default 'view',
  created_at timestamptz not null default now()
);

create index meter_events_user_site_idx on meter_events (user_id, site_id);

-- ─── unlock_attempts ────────────────────────────────────────────────────────
-- Audit trail of unlock CTA clicks and their outcome.
create table unlock_attempts (
  id                         uuid primary key default uuid_generate_v4(),
  user_id                    uuid not null references profiles(id) on delete cascade,
  site_id                    uuid not null references sites(id) on delete cascade,
  article_id                 uuid references articles(id) on delete cascade,
  status                     unlock_status not null default 'pending',
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles        enable row level security;
alter table sites           enable row level security;
alter table articles        enable row level security;
alter table entitlements    enable row level security;
alter table meter_events    enable row level security;
alter table unlock_attempts enable row level security;

-- profiles: a user can read/update only their own row.
create policy "own profile read"   on profiles for select
  using (supabase_user_id = auth.uid());
create policy "own profile update" on profiles for update
  using (supabase_user_id = auth.uid());

-- sites: public config, anyone (even anon) may read.
create policy "sites readable" on sites for select using (true);

-- articles: clients may read NON-sensitive columns only. RLS cannot restrict
-- columns, so we forbid all client SELECT here and expose preview via a view
-- (below). protected_content is therefore unreachable with the anon key.
-- (No SELECT policy => no client reads. Server uses service role.)

-- entitlements: a user may read only their own.
create policy "own entitlements read" on entitlements for select
  using (user_id in (select id from profiles where supabase_user_id = auth.uid()));

-- meter_events: a user may read only their own.
create policy "own meter read" on meter_events for select
  using (user_id in (select id from profiles where supabase_user_id = auth.uid()));

-- unlock_attempts: a user may read only their own.
create policy "own attempts read" on unlock_attempts for select
  using (user_id in (select id from profiles where supabase_user_id = auth.uid()));

-- NOTE: No INSERT/UPDATE/DELETE policies on entitlements/meter_events/
-- unlock_attempts/articles for clients. All writes happen server-side with the
-- service-role key, which bypasses RLS. This is the chokepoint that keeps
-- gating honest.

-- ─── public preview view ─────────────────────────────────────────────────────
-- Safe, client-readable projection of articles WITHOUT protected_content.
create view articles_public as
  select id, site_id, slug, title, preview_content, price, currency, access_rule, created_at
  from articles;

grant select on articles_public to anon, authenticated;

-- ─── auto-create profile on signup ───────────────────────────────────────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (supabase_user_id, email)
  values (new.id, new.email)
  on conflict (supabase_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
