// Initial Onboarding — collect + save a card via Stripe SetupIntent (embedded
// Stripe Elements PaymentElement). No charge here; saves a reusable payment
// method for later off-session unlocks. Marks onboarding_status = complete.
// TODO(Phase 4): mount <Elements> with PaymentElement, confirm the SetupIntent,
// then call the server to persist payment_method_id + onboarding_status.
"use client";

export default function OnboardingPage() {
  return (
    <main>
      <h1>Onboarding</h1>
      <p style={{ color: "var(--muted)" }}>
        TODO(Phase 4): embedded Stripe Elements card capture via SetupIntent →
        save payment method → mark onboarding complete. One time only.
      </p>
    </main>
  );
}
