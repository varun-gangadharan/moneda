// Demo Site Index — lists the four demo sites/variants for testers.
// See PLAN.md Phase 8.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("sites")
    .select("slug, name, paywall_type")
    .order("slug");

  return (
    <main>
      <h1>Moneda</h1>
      <p style={{ color: "var(--muted)" }}>Onboard once. Tap once. Unlock anywhere.</p>

      <h2>Demo sites</h2>
      <ul>
        {sites?.map((s) => (
          <li key={s.slug}>
            <Link href={`/sites/${s.slug}`}>{s.name}</Link> — <code>{s.paywall_type}</code>
          </li>
        ))}
      </ul>

      <p>
        <Link href="/login">Sign in</Link> · <Link href="/onboarding">Onboarding</Link>
      </p>
    </main>
  );
}
