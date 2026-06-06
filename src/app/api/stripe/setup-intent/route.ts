// POST /api/stripe/setup-intent — onboarding card capture.
// Authenticates the user, gets-or-creates their Stripe customer (persisting
// stripe_customer_id on the profile), and returns a SetupIntent client_secret
// for the embedded PaymentElement to confirm. No charge happens here — the
// SetupIntent saves a reusable payment method for later off-session unlocks
// (Phase 6). See PLAN.md Phase 5.
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCurrentProfile } from "@/lib/identity";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createServiceClient();

  // Get-or-create the Stripe customer, persisting the id so we only ever make one.
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { profile_id: profile.id, supabase_user_id: profile.supabase_user_id },
    });
    customerId = customer.id;
    const { error } = await db
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", profile.id);
    if (error) {
      return NextResponse.json({ error: "Failed to persist customer" }, { status: 500 });
    }
  }

  // usage: "off_session" so the saved card can be charged later without the user
  // present. Restricting to "card" keeps the PaymentElement deterministic for the
  // POC (no dashboard payment-method config needed).
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    payment_method_types: ["card"],
  });

  return NextResponse.json({ clientSecret: setupIntent.client_secret });
}
