// Demo Site Index — lists the four demo sites/variants for testers.
// See PLAN.md Phase 4.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/identity";

const BLURB: Record<string, string> = {
  hard: "Hard paywall — pay once to unlock each article.",
  metered: "Metered — a few free reads, then pay.",
  registration: "Registration wall — free once you sign in.",
  custom: "Custom — requires completed onboarding + payment.",
};

export default async function HomePage() {
  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("sites")
    .select("slug, name, paywall_type")
    .order("slug");
  const profile = await getCurrentProfile();

  return (
    <main>
      <h1>Moneda</h1>
      <p style={{ color: "var(--muted)" }}>Onboard once. Tap once. Unlock anywhere.</p>

      <p style={{ fontSize: 14 }}>
        {profile ? (
          <>Signed in as <strong>{profile.email}</strong> · onboarding:{" "}
            <code>{profile.onboarding_status}</code> ·{" "}
            <Link href="/onboarding">Onboarding</Link></>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </p>

      <h2>Demo sites</h2>
      <ul>
        {sites?.map((s) => (
          <li key={s.slug} style={{ marginBottom: 8 }}>
            <Link href={`/sites/${s.slug}`}>{s.name}</Link>{" "}
            <code>{s.paywall_type}</code>
            <br />
            <span style={{ color: "var(--muted)", fontSize: 13 }}>{BLURB[s.paywall_type]}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
