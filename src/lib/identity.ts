// Identity module helpers (server-side). See PLAN.md Phase 2.
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  supabase_user_id: string;
  email: string;
  onboarding_status: string;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
};

// The signed-in user's profile row (RLS-scoped to their own), or null.
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, supabase_user_id, email, onboarding_status, stripe_customer_id, payment_method_id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

// Where a freshly-authenticated user should land.
export function postAuthRedirect(profile: Profile | null): string {
  if (!profile) return "/login";
  return profile.onboarding_status === "complete" ? "/" : "/onboarding";
}
