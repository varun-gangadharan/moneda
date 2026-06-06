// Unit tests for the access engine's decision logic — every branch covered.
// Run: npm test
//
// checkAccess() reads entitlements + meter state via the service client, so we
// mock that client with controllable state (an entitlement row and a meter
// count) and assert the decision for each access_rule and precheck.
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted above imports, so the mock's mutable state and client
// factory must live inside vi.hoisted to be referenceable from the factory.
const mock = vi.hoisted(() => {
  const state: { entitlement: unknown; meterCount: number; meterError: unknown } = {
    entitlement: null,
    meterCount: 0,
    meterError: null,
  };

  // A chainable query stub. The entitlements query ends in .maybeSingle();
  // the meter query is awaited directly, so the builder is also thenable and
  // resolves to { count, error }.
  const makeClient = () => ({
    from(_table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.entitlement, error: null }),
        then: (resolve: (v: { count: number; error: unknown }) => unknown) =>
          resolve({ count: state.meterCount, error: state.meterError }),
      };
      return builder;
    },
  });

  return { state, makeClient };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mock.makeClient(),
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

const signedOut = { userId: null, onboardingComplete: false };
const signedIn = { userId: "u1", onboardingComplete: false };
const onboarded = { userId: "u1", onboardingComplete: true };

beforeEach(() => {
  mock.state.entitlement = null;
  mock.state.meterCount = 0;
  mock.state.meterError = null;
});

describe("checkAccess — auth precheck", () => {
  it("requires auth when signed out on an auth-required site", async () => {
    const d = await checkAccess(site(), article(), signedOut);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("auth");
  });
});

describe("checkAccess — entitlement precheck", () => {
  it("grants access when an active entitlement exists, regardless of rule", async () => {
    mock.state.entitlement = { id: "e1" };
    for (const rule of ["hard", "metered", "registration", "custom"] as const) {
      const d = await checkAccess(site({ paywall_type: rule }), article({ access_rule: rule }), signedIn);
      expect(d.allowed).toBe(true);
      if (d.allowed) expect(d.reason).toBe("entitled");
    }
  });

  it("does not consult entitlements for signed-out users (auth gate wins)", async () => {
    mock.state.entitlement = { id: "e1" };
    const d = await checkAccess(site(), article(), signedOut);
    expect(d.allowed).toBe(false); // auth precheck returns before entitlement lookup
  });
});

describe("checkAccess — hard", () => {
  it("returns a payment gate at site.default_price when no article price", async () => {
    const d = await checkAccess(site({ default_price: 100 }), article({ price: null, access_rule: "hard" }), signedIn);
    expect(d.allowed).toBe(false);
    if (!d.allowed && d.gate.kind === "payment") expect(d.gate.amount).toBe(100);
  });

  it("prefers article.price over site.default_price", async () => {
    const d = await checkAccess(site({ default_price: 100 }), article({ price: 250, access_rule: "hard" }), signedIn);
    expect(d.allowed).toBe(false);
    if (!d.allowed && d.gate.kind === "payment") expect(d.gate.amount).toBe(250);
  });
});

describe("checkAccess — registration", () => {
  it("is free once authenticated", async () => {
    const d = await checkAccess(site({ paywall_type: "registration" }), article({ access_rule: "registration" }), signedIn);
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.reason).toBe("free_registration");
  });

  it("gates with auth when signed out (auth precheck)", async () => {
    const d = await checkAccess(site({ paywall_type: "registration" }), article({ access_rule: "registration" }), signedOut);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("auth");
  });
});

describe("checkAccess — metered", () => {
  const meteredSite = (over: Partial<Site> = {}) =>
    site({ paywall_type: "metered", meter_limit: 2, default_price: 99, ...over });
  const meteredArticle = () => article({ access_rule: "metered", price: 99 });

  it("allows a free read while under the limit", async () => {
    mock.state.meterCount = 0;
    const d = await checkAccess(meteredSite(), meteredArticle(), signedIn);
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.reason).toBe("under_meter");
  });

  it("allows the read at count = limit - 1 (last free view)", async () => {
    mock.state.meterCount = 1;
    const d = await checkAccess(meteredSite(), meteredArticle(), signedIn);
    expect(d.allowed).toBe(true);
  });

  it("gates with payment once the count reaches the limit", async () => {
    mock.state.meterCount = 2;
    const d = await checkAccess(meteredSite(), meteredArticle(), signedIn);
    expect(d.allowed).toBe(false);
    if (!d.allowed && d.gate.kind === "payment") expect(d.gate.amount).toBe(99);
  });

  it("gates with payment when over the limit", async () => {
    mock.state.meterCount = 5;
    const d = await checkAccess(meteredSite(), meteredArticle(), signedIn);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("payment");
  });

  it("fails closed (payment gate) when the meter read errors", async () => {
    mock.state.meterCount = 0;
    mock.state.meterError = { message: "db down" };
    const d = await checkAccess(meteredSite(), meteredArticle(), signedIn);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("payment");
  });

  it("returns an auth gate for a metered site that doesn't require auth but has no user", async () => {
    const d = await checkAccess(
      meteredSite({ auth_required: false }),
      meteredArticle(),
      signedOut
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("auth");
  });
});

describe("checkAccess — custom", () => {
  const customSite = () => site({ paywall_type: "custom", default_price: 250 });
  const customArticle = () => article({ access_rule: "custom", price: 250 });

  it("gates on onboarding first when onboarding is incomplete", async () => {
    const d = await checkAccess(customSite(), customArticle(), signedIn); // onboardingComplete: false
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.gate.kind).toBe("onboarding");
  });

  it("gates on payment once onboarding is complete", async () => {
    const d = await checkAccess(customSite(), customArticle(), onboarded);
    expect(d.allowed).toBe(false);
    if (!d.allowed && d.gate.kind === "payment") expect(d.gate.amount).toBe(250);
  });

  it("an entitlement bypasses both gates", async () => {
    mock.state.entitlement = { id: "e1" };
    const d = await checkAccess(customSite(), customArticle(), signedIn);
    expect(d.allowed).toBe(true);
  });
});
