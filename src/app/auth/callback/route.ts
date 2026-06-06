// OAuth / magic-link callback. Exchanges the code for a session, then routes the
// user to onboarding (if incomplete) or home. See PLAN.md Phase 2.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, postAuthRedirect } from "@/lib/identity";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const profile = await getCurrentProfile();
      return NextResponse.redirect(`${origin}${postAuthRedirect(profile)}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
