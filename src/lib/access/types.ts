// Shared types for the access-control engine. See PLAN.md Phase 6.

export type AccessRule = "hard" | "metered" | "registration" | "custom";

export interface Site {
  id: string;
  slug: string;
  name: string;
  paywall_type: AccessRule;
  default_price: number; // cents
  currency: string;
  auth_required: boolean;
  meter_limit: number | null;
}

export interface Article {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  price: number | null; // cents; null => site.default_price
  currency: string;
  access_rule: AccessRule;
}

export interface AccessContext {
  userId: string | null;       // profiles.id, or null if signed out
  onboardingComplete: boolean;
}

// What the caller must do when access is NOT granted.
export type AccessGate =
  | { kind: "auth" }                               // must sign in / register
  | { kind: "onboarding" }                         // signed in but must finish onboarding
  | { kind: "payment"; amount: number; currency: string }; // must pay to unlock

export type AccessDecision =
  | { allowed: true; reason: "entitled" | "under_meter" | "free_registration" }
  | { allowed: false; gate: AccessGate; reason: string };
