import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Server-only client that reads the CALLER's session from cookies and
 * still respects Row Level Security (it is NOT a service-role/admin
 * client — see supabase/admin.ts for that). Use this in Server Components
 * and Route Handlers when you need to know who's making the request, e.g.
 * "does the signed-in user own this invite?"
 *
 * Must be created fresh per request (it reads the request's cookie jar),
 * so this returns a factory, not a singleton.
 */
export async function createServerSupabaseClient() {
  if (!supabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render, where cookies() is
          // read-only — safe to ignore as long as proxy.ts also refreshes
          // the session, per @supabase/ssr's documented pattern.
        }
      },
    },
  });
}
