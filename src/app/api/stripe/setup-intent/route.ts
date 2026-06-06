// POST /api/stripe/setup-intent — onboarding card capture.
// Creates (or reuses) the Stripe customer for the user and returns a
// SetupIntent client_secret for the embedded PaymentElement to confirm.
// See PLAN.md Phase 4.
import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  // TODO(Phase 4): authenticate user; get/create stripe customer; persist
  // stripe_customer_id; create SetupIntent; return { clientSecret }.
  return NextResponse.json(
    { error: "setup-intent not implemented (PLAN.md Phase 4)" },
    { status: 501 }
  );
}
