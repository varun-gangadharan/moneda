// ============================================================================
// POST /api/stripe/webhook — payment reconciliation backstop.
//
// The synchronous unlock path is primary; this verifies the Stripe signature
// and, on payment_intent.succeeded, writes the entitlement idempotently (same
// ON CONFLICT (stripe_payment_intent_id) DO NOTHING as the sync path). This
// catches the case where the server died after charging but before granting.
// See PLAN.md Phase 5.
//
// Requires the raw request body for signature verification — do not parse JSON
// before verifying.
// ============================================================================
import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  // TODO(Phase 5): read raw body; stripe.webhooks.constructEvent with
  // STRIPE_WEBHOOK_SECRET; on payment_intent.succeeded -> upsert entitlement.
  return NextResponse.json(
    { error: "webhook not implemented (PLAN.md Phase 5)" },
    { status: 501 }
  );
}
