// Paywall popup — the primary conversion surface. States: locked → loading →
// (requires_action / 3DS) → success → error. After onboarding the paid path is
// ONE CLICK (off-session PaymentIntent). See PLAN.md Phases 5 & 9.
"use client";

import { useState } from "react";
import type { AccessGate } from "@/lib/access/types";
import { UnlockButton } from "./unlock-button";

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

  const cta =
    gate.kind === "auth"
      ? "Sign in to continue"
      : gate.kind === "onboarding"
        ? "Finish setup to unlock"
        : `Unlock for $${(gate.amount / 100).toFixed(2)}`;

  return (
    <div role="dialog" aria-modal="true" data-testid="paywall-modal"
         style={{ border: "1px solid #2a2a33", borderRadius: 12, padding: 20, marginTop: 16 }}>
      <strong>{site.name}</strong>
      <p style={{ color: "var(--muted)", margin: "8px 0 16px" }}>
        {gate.kind === "payment"
          ? "Unlock this article to keep reading."
          : gate.kind === "onboarding"
            ? "Complete onboarding once, then unlock with a tap."
            : "Sign in to read the full article."}
      </p>
      <UnlockButton articleId={article.id} gate={gate} label={cta} onError={setError} />
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
    </div>
  );
}
