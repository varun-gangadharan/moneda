// Browser Supabase client (anon key + user session). Safe for client components.
// Subject to RLS — can only ever read the signed-in user's own rows and public
// config. See PLAN.md Phase 1.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
