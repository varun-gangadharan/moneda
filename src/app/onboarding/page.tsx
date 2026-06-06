// Initial Onboarding — collect + save a card via Stripe SetupIntent (embedded
// Stripe Elements PaymentElement). No charge here; saves a reusable payment
// method for later off-session unlocks. Marks onboarding_status = complete.
// See PLAN.md Phase 5. Test card: 4242 4242 4242 4242, any future expiry/CVC.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { createClient } from "@/lib/supabase/client";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Phase = "loading" | "unauth" | "done" | "ready" | "error";

function CardForm({ onComplete }: { onComplete: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);

    // redirect: "if_required" keeps the happy path (non-3DS cards like 4242)
    // entirely inline. The return_url is only used if a card needs a redirect
    // (handled in Phase 9).
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: `${window.location.origin}/onboarding` },
      redirect: "if_required",
    });

    if (error) {
      setErr(error.message ?? "Card setup failed.");
      setBusy(false);
      return;
    }

    if (setupIntent?.status === "succeeded") {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      if (!res.ok) {
        setErr("Card saved with Stripe, but finalizing onboarding failed. Try again.");
        setBusy(false);
        return;
      }
      onComplete();
      return;
    }

    setErr(`Unexpected setup status: ${setupIntent?.status ?? "unknown"}.`);
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit" disabled={!stripe || busy} style={btn}>
        {busy ? "Saving…" : "Save card"}
      </button>
      {err && <p style={{ color: "#ff6b6b" }}>{err}</p>}
    </form>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Run once: confirm the user is signed in and not already onboarded, then
  // create a SetupIntent. (createClient() returns a fresh instance, so we make
  // it inside the effect with an empty dep array to avoid re-running.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setPhase("unauth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_status")
        .eq("supabase_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.onboarding_status === "complete") {
        setPhase("done");
        return;
      }

      const res = await fetch("/api/stripe/setup-intent", { method: "POST" });
      if (cancelled) return;
      if (!res.ok) {
        setErr("Could not start onboarding. Check your Stripe configuration.");
        setPhase("error");
        return;
      }
      const { clientSecret } = await res.json();
      setClientSecret(clientSecret);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "loading") {
    return (
      <main>
        <h1>Onboarding</h1>
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </main>
    );
  }

  if (phase === "unauth") {
    return (
      <main>
        <h1>Onboarding</h1>
        <p style={{ color: "var(--muted)" }}>Please sign in first.</p>
        <button onClick={() => router.push("/login")} style={btn}>Go to sign in</button>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main>
        <h1>You&apos;re all set</h1>
        <p style={{ color: "var(--muted)" }}>
          Onboarding is complete — your card is saved for one-tap unlocks.
        </p>
        <button onClick={() => router.push("/")} style={btn}>Browse sites</button>
      </main>
    );
  }

  if (phase === "error" || !clientSecret) {
    return (
      <main>
        <h1>Onboarding</h1>
        <p style={{ color: "#ff6b6b" }}>{err ?? "Something went wrong."}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Save a card</h1>
      <p style={{ color: "var(--muted)" }}>
        We won&apos;t charge you now. This saves a card so you can unlock articles
        with one tap. Use test card <code>4242 4242 4242 4242</code>.
      </p>
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
        <CardForm
          onComplete={() => {
            router.push("/");
            router.refresh();
          }}
        />
      </Elements>
    </main>
  );
}

const btn: React.CSSProperties = {
  marginTop: 16, padding: "10px 18px", borderRadius: 8, border: "none",
  background: "var(--accent)", color: "white", cursor: "pointer", fontWeight: 600,
};
