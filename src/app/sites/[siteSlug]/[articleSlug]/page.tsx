// ============================================================================
// Demo Article Page — SERVER-SIDE GATED.
//
// SECURITY (the core property of this POC): protected_content is fetched with
// the service-role client ONLY after checkAccess() returns allowed. When access
// is denied, the protected text never enters the HTML/RSC payload — the client
// receives only the preview + a gate descriptor for the paywall modal.
// See PLAN.md Phases 6, 8 & 9.
// ============================================================================
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile } from "@/lib/identity";
import { checkAccess } from "@/lib/access/engine";
import { PaywallModal } from "@/components/paywall-modal";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ siteSlug: string; articleSlug: string }>;
}) {
  const { siteSlug, articleSlug } = await params;
  const db = createServiceClient();

  const profile = await getCurrentProfile();
  const ctx = {
    userId: profile?.id ?? null,
    onboardingComplete: profile?.onboarding_status === "complete",
  };

  // Load site + article config (NOT protected_content yet).
  const { data: site } = await db.from("sites").select("*").eq("slug", siteSlug).maybeSingle();
  if (!site) notFound();
  const { data: article } = await db
    .from("articles")
    .select("id, site_id, slug, title, preview_content, price, currency, access_rule")
    .eq("site_id", site.id)
    .eq("slug", articleSlug)
    .maybeSingle();
  if (!article) notFound();

  const decision = await checkAccess(site, article, ctx);

  // Only NOW, and only if allowed, do we read the protected body.
  let protectedContent: string | null = null;
  if (decision.allowed) {
    const { data } = await db
      .from("articles")
      .select("protected_content")
      .eq("id", article.id)
      .maybeSingle();
    protectedContent = data?.protected_content ?? null;

    // Metering: log exactly one event per free (under-limit) view, and ONLY for
    // "under_meter" — never for entitled, registration, or any non-metered
    // access. The engine counts these per (user, site) against site.meter_limit,
    // so this insert is what eventually trips the paywall. Permanent, no reset.
    // (under_meter is only ever returned for an authenticated user, so userId is
    // set; the guard satisfies the type and is defensive.)
    if (decision.reason === "under_meter" && ctx.userId) {
      await db.from("meter_events").insert({
        user_id: ctx.userId,
        site_id: site.id,
        article_id: article.id,
      });
    }
  }

  return (
    <main>
      <p><Link href={`/sites/${siteSlug}`}>← {site.name}</Link></p>
      <h1>{article.title}</h1>
      <p style={{ color: "var(--muted)" }}>{article.preview_content}</p>

      {decision.allowed ? (
        <>
          <p style={{ fontSize: 13, color: "var(--accent)" }} data-testid="access-granted">
            ✓ Access granted{decision.reason === "under_meter" ? " (free read)" : ""}
          </p>
          <article data-testid="protected-content"
                   style={{ borderTop: "1px solid #2a2a33", paddingTop: 16 }}>
            {protectedContent}
          </article>
        </>
      ) : (
        <PaywallModal
          site={{ name: site.name, slug: site.slug }}
          article={{ id: article.id, slug: article.slug, title: article.title }}
          gate={decision.gate}
        />
      )}
    </main>
  );
}
