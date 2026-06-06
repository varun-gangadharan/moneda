// POST /api/onboarding/complete — finalize onboarding after the client confirms
// the SetupIntent. Re-fetches the SetupIntent from Stripe (never trusting the
// client for the payment-method id), verifies it belongs to this user's
// customer and succeeded, then saves payment_method_id + marks onboarding
// complete via the service client. See PLAN.md Phase 5.
import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { getCurrentProfile } from "@/lib/identity";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ setupIntentId: z.string().min(1) });

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const si = await stripe.setupIntents.retrieve(parsed.data.setupIntentId);

  // The SetupIntent must belong to this user's Stripe customer.
  const siCustomer = typeof si.customer === "string" ? si.customer : si.customer?.id ?? null;
  if (!profile.stripe_customer_id || siCustomer !== profile.stripe_customer_id) {
    return NextResponse.json({ error: "SetupIntent does not belong to this user" }, { status: 403 });
  }

  if (si.status !== "succeeded" || !si.payment_method) {
    return NextResponse.json({ error: "SetupIntent not completed" }, { status: 409 });
  }

  const paymentMethodId =
    typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;

  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .update({ payment_method_id: paymentMethodId, onboarding_status: "complete" })
    .eq("id", profile.id);
  if (error) {
    return NextResponse.json({ error: "Failed to finalize onboarding" }, { status: 500 });
  }

  return NextResponse.json({ status: "complete" });
}
