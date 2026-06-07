// The single unlock CTA. Routes by gate kind:
//   auth       -> redirect to /login
//   onboarding -> redirect to /onboarding
//   payment    -> POST /api/unlock (off-session charge). The happy path (no
//                 3DS) is ONE CLICK. If the saved card needs authentication the
//                 route returns { status: "requires_action", clientSecret } and
//                 we confirm 3DS client-side, then refresh. See PLAN.md Phase 9.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccessGate } from "@/lib/access/types";

export type UnlockStatus = "idle" | "loading" | "authenticating" | "success" | "error";

// 3DS-confirmed charges are granted the entitlement by the webhook (Phase 7),
// which lands a beat after Stripe reports success. Give it time to reconcile
// before re-rendering the server component so the article shows on first refresh.
const WEBHOOK_SETTLE_MS = 1500;

export function UnlockButton({
  articleId,
  gate,
  label,
  onError,
  onStatus,
}: {
  articleId: string;
  gate: AccessGate;
  label: string;
  onError: (msg: string | null) => void;
  onStatus?: (status: UnlockStatus) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<UnlockStatus>("idle");

  function update(next: UnlockStatus) {
    setStatus(next);
    onStatus?.(next);
  }

  function fail(message: string) {
    update("error");
    onError(message);
  }

  async function confirm3DS(clientSecret: string) {
    const { loadStripe } = await import("@stripe/stripe-js");
    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
    if (!stripe) return fail("Could not load the payment SDK.");

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret);
    if (error) return fail(error.message ?? "Card authentication failed.");
    if (paymentIntent?.status === "succeeded") {
      update("success");
      setTimeout(() => router.refresh(), WEBHOOK_SETTLE_MS);
      return;
    }
    fail(`Payment ${paymentIntent?.status ?? "incomplete"}.`);
  }

  async function handleClick() {
    onError(null);
    if (gate.kind === "auth") return router.push("/login");
    if (gate.kind === "onboarding") return router.push("/onboarding");

    update("loading");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      const data = await res.json();

      if (data.status === "succeeded") {
        update("success");
        router.refresh(); // entitlement already written server-side; show content now
        return;
      }
      if (data.status === "requires_action" && data.clientSecret) {
        update("authenticating");
        await confirm3DS(data.clientSecret);
        return;
      }
      fail(data.error ?? "Unlock failed.");
    } catch {
      fail("Network error — please try again.");
    }
  }

  const busy = status === "loading" || status === "authenticating" || status === "success";
  const text =
    status === "loading"
      ? "Unlocking…"
      : status === "authenticating"
        ? "Confirming…"
        : status === "success"
          ? "Unlocked ✓"
          : label;

  return (
    <button data-testid="unlock-cta" onClick={handleClick} disabled={busy} aria-busy={busy}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none",
                     background: status === "success" ? "#1f7a3d" : "var(--accent)",
                     color: "white", cursor: busy ? "default" : "pointer",
                     opacity: busy && status !== "success" ? 0.85 : 1,
                     fontSize: 16, fontWeight: 600 }}>
      {text}
    </button>
  );
}
