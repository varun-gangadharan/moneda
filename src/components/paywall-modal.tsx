// Paywall popup — the primary conversion surface. States: locked → loading →
// (requires_action / 3DS) → success → error. After onboarding the paid path is
// ONE CLICK (off-session PaymentIntent). See PLAN.md Phases 5 & 9.
"use client";

import { useState } from "react";
import type { AccessGate } from "@/lib/access/types";
import { UnlockButton, type UnlockStatus } from "./unlock-button";

export function PaywallModal({
  site,
  article,
  gate,
}: {
  site: { name: string; slug: string };
  article: { id: string; slug: string; title: string };
  gate: AccessGate;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UnlockStatus>("idle");

  const cta =
    gate.kind === "auth"
      ? "Sign in to continue"
      : gate.kind === "onboarding"
        ? "Finish setup to unlock"
        : `Unlock for $${(gate.amount / 100).toFixed(2)}`;

  // The blurb under the title adapts to where we are in the unlock flow.
  const blurb =
    status === "authenticating"
      ? "Confirming with your bank…"
      : status === "success"
        ? "✓ Payment confirmed — loading your article…"
        : gate.kind === "payment"
          ? "Unlock this article to keep reading."
          : gate.kind === "onboarding"
            ? "Complete onboarding once, then unlock with a tap."
            : "Sign in to read the full article.";

  const blurbColor = status === "success" ? "var(--accent)" : "var(--muted)";

  return (
    <div role="dialog" aria-modal="true" data-testid="paywall-modal"
         style={{ border: "1px solid #2a2a33", borderRadius: 12, padding: 20, marginTop: 16 }}>
      <strong>{site.name}</strong>
      <p aria-live="polite" style={{ color: blurbColor, margin: "8px 0 16px" }}>
        {blurb}
      </p>
      <UnlockButton
        articleId={article.id}
        gate={gate}
        label={cta}
        onError={setError}
        onStatus={(s) => {
          setStatus(s);
          if (s !== "error") setError(null);
        }}
      />
      {status === "error" && error && (
        <p role="alert" data-testid="unlock-error" style={{ color: "#ff6b6b", marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
