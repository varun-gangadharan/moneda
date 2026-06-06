// ============================================================================
// The access-control engine — the single server-side chokepoint.
//
// EVERY protected resource render and EVERY unlock attempt must route through
// checkAccess(). It is a pure-ish switch over the article's declarative
// access_rule, so adding a new site/access model = a new row (+ at most a new
// case here), never a UI or flow rewrite. See PLAN.md Phase 6.
//
// This module is SERVER ONLY (it uses the service-role client to read
// entitlements + meter state). Never import from a client component.
// ============================================================================
import { createServiceClient } from "@/lib/supabase/service";
import type { AccessContext, AccessDecision, Article, Site } from "./types";

function priceOf(site: Site, article: Article): number {
  return article.price ?? site.default_price;
}

export async function checkAccess(
  site: Site,
  article: Article,
  ctx: AccessContext
): Promise<AccessDecision> {
  const db = createServiceClient();

  // Universal precheck: auth.
  if (site.auth_required && !ctx.userId) {
    return { allowed: false, gate: { kind: "auth" }, reason: "auth required" };
  }

  // Universal precheck: an existing active entitlement always grants access,
  // regardless of rule. (Article-level for MVP.)
  if (ctx.userId) {
    const { data: ent } = await db
      .from("entitlements")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("article_id", article.id)
      .eq("status", "active")
      .maybeSingle();
    if (ent) return { allowed: true, reason: "entitled" };
  }

  switch (article.access_rule) {
    case "registration": {
      // Free once authenticated.
      if (ctx.userId) return { allowed: true, reason: "free_registration" };
      return { allowed: false, gate: { kind: "auth" }, reason: "registration required" };
    }

    case "metered": {
      // Metering is per-user; without a user we can't track free views, so the
      // auth precheck must have run. Guard in case a metered site ever sets
      // auth_required = false.
      if (!ctx.userId) {
        return { allowed: false, gate: { kind: "auth" }, reason: "auth required" };
      }
      const limit = site.meter_limit ?? 0;
      const { count, error } = await db
        .from("meter_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId)
        .eq("site_id", site.id);
      // Fail closed: if we can't read the meter, gate rather than give a free read.
      if (!error && (count ?? 0) < limit) {
        return { allowed: true, reason: "under_meter" };
      }
      return {
        allowed: false,
        gate: { kind: "payment", amount: priceOf(site, article), currency: article.currency },
        reason: "meter exhausted",
      };
    }

    case "custom": {
      // Requires completed onboarding AND payment.
      if (!ctx.onboardingComplete) {
        return { allowed: false, gate: { kind: "onboarding" }, reason: "onboarding required" };
      }
      return {
        allowed: false,
        gate: { kind: "payment", amount: priceOf(site, article), currency: article.currency },
        reason: "payment required",
      };
    }

    case "hard":
    default: {
      return {
        allowed: false,
        gate: { kind: "payment", amount: priceOf(site, article), currency: article.currency },
        reason: "payment required",
      };
    }
  }
}
