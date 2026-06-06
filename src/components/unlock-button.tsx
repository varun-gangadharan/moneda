// The single unlock CTA. Routes by gate kind:
//   auth       -> redirect to /login
//   onboarding -> redirect to /onboarding
//   payment    -> POST /api/unlock (off-session charge); on requires_action,
//                 confirm 3DS client-side with the returned client_secret.
// TODO(Phase 9): wire the payment path + 3DS fallback + success refresh.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccessGate } from "@/lib/access/types";

export function UnlockButton({
  articleId,
  gate,
  label,
  onError,
}: {
  articleId: string;
  gate: AccessGate;
  label: string;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    onError(null);
    if (gate.kind === "auth") return router.push("/login");
    if (gate.kind === "onboarding") return router.push("/onboarding");

    setLoading(true);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      const data = await res.json();

      if (data.status === "succeeded") {
        router.refresh(); // server re-renders with protected content
        return;
      }
      if (data.status === "requires_action") {
        // TODO(Phase 9): stripe.confirmCardPayment(data.clientSecret) then refresh.
        onError("Additional authentication required (3DS) — wire in Phase 9.");
        return;
      }
      onError(data.error ?? "Unlock failed.");
    } catch {
      onError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button data-testid="unlock-cta" onClick={handleClick} disabled={loading}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none",
                     background: "var(--accent)", color: "white", cursor: "pointer",
                     fontSize: 16, fontWeight: 600 }}>
      {loading ? "Unlocking…" : label}
    </button>
  );
}
