// Unit tests for the access engine's decision logic.
// Run: npm test
//
// checkAccess() reads from Supabase via the service client, so full coverage
// mocks that client. This scaffold asserts the gate shape for the no-DB paths
// (auth required) and documents the cases each phase should fill in.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      }),
    }),
  }),
}));

import { checkAccess } from "@/lib/access/engine";
import type { Article, Site } from "@/lib/access/types";

const site = (over: Partial<Site> = {}): Site => ({
  id: "s1", slug: "site-a", name: "A", paywall_type: "hard",
  default_price: 100, currency: "usd", auth_required: true, meter_limit: null, ...over,
});
const article = (over: Partial<Article> = {}): Article => ({
  id: "a1", site_id: "s1", slug: "x", title: "X",
  price: null, currency: "usd", access_rule: "hard", ...over,
});

describe("checkAccess", () => {
  it("requires auth when signed out on an auth-required site", async () => {
    const d = await checkAccess(site(), article(), { userId: null, onboardingComplete: false });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("auth");
  });

  // TODO(Phase 6): hard -> payment gate at default_price when signed in, no entitlement.
  // TODO(Phase 6): registration -> allowed once authenticated.
  // TODO(Phase 7): metered -> allowed under limit; payment gate at/over limit.
  // TODO(Phase 6): custom -> onboarding gate first, then payment gate.
  // TODO(Phase 6): existing active entitlement -> allowed regardless of rule.
});
