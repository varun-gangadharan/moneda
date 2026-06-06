// ============================================================================
// POST /api/unlock — the one-click paid unlock (synchronous path).
//
// Flow (PLAN.md Phase 6):
//   1. Authenticate the user; resolve profile + stripe_customer_id + PM.
//   2. Re-run checkAccess() server-side — NEVER trust the client about price/need.
//   3. Create + confirm an off-session PaymentIntent for the amount the engine
//      says is owed.
//   4. On "succeeded": write the entitlement (idempotent on payment_intent_id)
//      and return { status: "succeeded" }.
//   5. On "requires_action": return { status, clientSecret } for 3DS (Phase 9).
//   6. Record an unlock_attempt row throughout for audit.
//
// The webhook (api/stripe/webhook, Phase 7) reconciles if step 4 is interrupted;
// the PaymentIntent metadata set here is what lets it derive (user, site,
// article).
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getCurrentProfile } from "@/lib/identity";
import { createServiceClient } from "@/lib/supabase/service";
import { checkAccess } from "@/lib/access/engine";

const Body = z.object({ articleId: z.string().uuid() });

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ status: "error", error: "Not authenticated" }, { status: 401 });
  }
  if (profile.onboarding_status !== "complete" || !profile.stripe_customer_id || !profile.payment_method_id) {
    return NextResponse.json(
      { status: "error", error: "Onboarding incomplete — no saved card to charge." },
      { status: 409 }
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ status: "error", error: "Invalid body" }, { status: 400 });
  }

  const db = createServiceClient();

  // Load article + its site (service client; we only read non-protected columns).
  const { data: article } = await db
    .from("articles")
    .select("id, site_id, slug, title, price, currency, access_rule")
    .eq("id", parsed.data.articleId)
    .maybeSingle();
  if (!article) {
    return NextResponse.json({ status: "error", error: "Article not found" }, { status: 404 });
  }
  const { data: site } = await db.from("sites").select("*").eq("id", article.site_id).maybeSingle();
  if (!site) {
    return NextResponse.json({ status: "error", error: "Site not found" }, { status: 404 });
  }

  // Re-run the engine server-side. The owed amount comes from the engine's
  // payment gate, never from the client.
  const decision = await checkAccess(site, article, {
    userId: profile.id,
    onboardingComplete: true,
  });

  // Already entitled (or otherwise allowed) — nothing to charge.
  if (decision.allowed) {
    return NextResponse.json({ status: "succeeded" });
  }
  if (decision.gate.kind !== "payment") {
    return NextResponse.json(
      { status: "error", error: `Not a payment gate (${decision.gate.kind}).` },
      { status: 400 }
    );
  }
  const { amount, currency } = decision.gate;

  // Audit: open an unlock_attempt (pending) before touching Stripe.
  const { data: attempt } = await db
    .from("unlock_attempts")
    .insert({ user_id: profile.id, site_id: site.id, article_id: article.id, status: "pending" })
    .select("id")
    .single();
  const attemptId = attempt?.id ?? null;

  const setAttempt = async (
    status: "succeeded" | "requires_action" | "failed",
    paymentIntentId?: string | null
  ) => {
    if (!attemptId) return;
    await db
      .from("unlock_attempts")
      .update({
        status,
        stripe_payment_intent_id: paymentIntentId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId);
  };

  // Create + confirm the off-session charge in one step. When the saved card
  // needs 3DS, Stripe throws a StripeCardError carrying the PaymentIntent in
  // requires_action — we surface its client_secret rather than failing.
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: profile.stripe_customer_id,
      payment_method: profile.payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        profile_id: profile.id,
        site_id: site.id,
        article_id: article.id,
        unlock_attempt_id: attemptId ?? "",
      },
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError && err.payment_intent) {
      pi = err.payment_intent as Stripe.PaymentIntent;
    } else {
      await setAttempt("failed");
      const message = err instanceof Stripe.errors.StripeError ? err.message : "Charge failed.";
      return NextResponse.json({ status: "error", error: message }, { status: 402 });
    }
  }

  if (pi.status === "requires_action") {
    await setAttempt("requires_action", pi.id);
    return NextResponse.json({ status: "requires_action", clientSecret: pi.client_secret });
  }

  if (pi.status !== "succeeded") {
    await setAttempt("failed", pi.id);
    return NextResponse.json(
      { status: "error", error: `Payment ${pi.status}.` },
      { status: 402 }
    );
  }

  // Grant the entitlement. Idempotent on stripe_payment_intent_id (the partial
  // unique index): a duplicate (e.g. the webhook beat us) is a no-op success.
  const { error: entErr } = await db.from("entitlements").insert({
    user_id: profile.id,
    site_id: site.id,
    article_id: article.id,
    entitlement_type: "paid",
    status: "active",
    stripe_payment_intent_id: pi.id,
  });
  if (entErr && entErr.code !== "23505") {
    // Charged but failed to record — the webhook will reconcile. Report success
    // to the client (they paid and will get access on reload).
    await setAttempt("succeeded", pi.id);
    return NextResponse.json({ status: "succeeded" });
  }

  await setAttempt("succeeded", pi.id);
  return NextResponse.json({ status: "succeeded" });
}
