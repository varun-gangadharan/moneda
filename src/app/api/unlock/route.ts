// ============================================================================
// POST /api/unlock — the one-click paid unlock.
//
// Flow (PLAN.md Phase 5):
//   1. Authenticate the user; resolve profile + stripe_customer_id + PM.
//   2. Re-run checkAccess server-side — NEVER trust the client about price/need.
//   3. Create + confirm an off-session PaymentIntent for the amount the engine
//      says is owed.
//   4. On "succeeded": write the entitlement (idempotent on payment_intent_id)
//      and return { status: "succeeded" }.
//   5. On "requires_action": return { status, clientSecret } for 3DS.
//   6. Record an unlock_attempt row throughout for audit.
//
// The webhook (api/stripe/webhook) reconciles if step 4 is interrupted.
// ============================================================================
import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  // TODO(Phase 5): implement per the steps above. Stub returns 501 so the
  // wiring is obvious and tests can assert "not yet implemented".
  return NextResponse.json(
    { status: "error", error: "unlock not implemented (PLAN.md Phase 5)" },
    { status: 501 }
  );
}
