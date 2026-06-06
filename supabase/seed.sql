-- ============================================================================
-- Seed: the four demo sites (A–D) that exercise the access-control engine.
-- Run after 0001_init.sql. Idempotent via fixed slugs + ON CONFLICT.
-- ============================================================================

-- ─── Sites ───────────────────────────────────────────────────────────────────
-- Site A — Hard paywall, one-time unlock ($1.00, article-level)
-- Site B — Metered paywall (2 free views, then $0.99)
-- Site C — Registration wall (free, requires auth)
-- Site D — Custom: requires completed onboarding + $2.50 payment
insert into sites (slug, name, paywall_type, default_price, currency, auth_required, meter_limit)
values
  ('site-a', 'The Daily Ledger', 'hard',         100, 'usd', true, null),
  ('site-b', 'Meter Times',      'metered',        99, 'usd', true, 2),
  ('site-c', 'Open Register',    'registration',    0, 'usd', true, null),
  ('site-d', 'Premium Vault',    'custom',        250, 'usd', true, null)
on conflict (slug) do update set
  name          = excluded.name,
  paywall_type  = excluded.paywall_type,
  default_price = excluded.default_price,
  currency      = excluded.currency,
  auth_required = excluded.auth_required,
  meter_limit   = excluded.meter_limit;

-- ─── Articles ────────────────────────────────────────────────────────────────
insert into articles (site_id, slug, title, preview_content, protected_content, price, currency, access_rule)
select s.id, v.slug, v.title, v.preview, v.protected, v.price, 'usd', v.rule::access_rule
from (values
  -- Site A (hard)
  ('site-a','quantum-markets','Quantum Markets Explained',
   'Markets are moving in ways classical models cannot predict. We set up the puzzle here...',
   'FULL A1: protected analysis of quantum-influenced market behavior, only entitled readers see this.',
   100,'hard'),
  ('site-a','the-second-story','The Second Story',
   'A teaser for the second hard-paywalled article on Site A...',
   'FULL A2: complete protected text for the second Site A article.',
   100,'hard'),
  -- Site B (metered)
  ('site-b','free-read-one','Free Read One',
   'Opening of a metered article — under the meter you read the whole thing free...',
   'FULL B1: complete metered content. Visible under the free-view limit; gated after.',
   99,'metered'),
  ('site-b','free-read-two','Free Read Two',
   'Opening of the second metered article...',
   'FULL B2: complete metered content for the second article.',
   99,'metered'),
  ('site-b','over-the-limit','Over The Limit',
   'Opening of a third metered article — likely the one that trips the paywall...',
   'FULL B3: complete metered content; appears only once entitled or under limit.',
   99,'metered'),
  -- Site C (registration)
  ('site-c','members-preview','Members Preview',
   'Anyone reads this preview. The rest is for registered members — no payment...',
   'FULL C1: complete content unlocked simply by being signed in.',
   0,'registration'),
  ('site-c','sign-in-to-read','Sign In To Read',
   'Preview of the second registration-wall article...',
   'FULL C2: complete content; free once authenticated.',
   0,'registration'),
  -- Site D (custom)
  ('site-d','the-vault','The Vault',
   'Preview of premium content. Requires completed onboarding and a $2.50 unlock...',
   'FULL D1: complete premium content, gated behind onboarding + payment.',
   250,'custom'),
  ('site-d','deep-dive','Deep Dive',
   'Preview of the second premium article...',
   'FULL D2: complete premium content for the second Site D article.',
   250,'custom')
) as v(site_slug, slug, title, preview, protected, price, rule)
join sites s on s.slug = v.site_slug
on conflict (site_id, slug) do update set
  title             = excluded.title,
  preview_content   = excluded.preview_content,
  protected_content = excluded.protected_content,
  price             = excluded.price,
  access_rule       = excluded.access_rule;
