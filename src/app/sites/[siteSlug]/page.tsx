// A demo site's article index. See PLAN.md Phase 8.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, name, paywall_type")
    .eq("slug", siteSlug)
    .maybeSingle();
  if (!site) notFound();

  const { data: articles } = await supabase
    .from("articles_public")
    .select("slug, title")
    .eq("site_id", site.id)
    .order("slug");

  return (
    <main>
      <p><Link href="/">← All sites</Link></p>
      <h1>{site.name}</h1>
      <p style={{ color: "var(--muted)" }}>Paywall type: <code>{site.paywall_type}</code></p>
      <ul>
        {articles?.map((a) => (
          <li key={a.slug}>
            <Link href={`/sites/${siteSlug}/${a.slug}`}>{a.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
