// Service-role Supabase client — SERVER ONLY. Bypasses RLS.
//
// SECURITY: only import this from trusted server code (Route Handlers, Server
// Actions, the webhook). Never from a client component. This is the only client
// permitted to read articles.protected_content and to write entitlements /
// meter_events / unlock_attempts. See PLAN.md Phase 2.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
