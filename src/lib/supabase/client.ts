import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Browser-safe client — anon key only, respects Row Level Security.
 * Stores the session in cookies (not just localStorage) via @supabase/ssr
 * so the server (Server Components, Route Handlers, proxy.ts) can read the
 * same session. This is the only Supabase client that should ever be
 * imported from client components.
 *
 * Returns null until NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * are set — callers should fall back to local storage (see
 * src/lib/storage.ts) when this is null.
 *
 * For server-only operations (service role, or reading the session in a
 * Server Component/Route Handler) see src/lib/supabase/server.ts and
 * src/lib/supabase/admin.ts instead — never use those from client code.
 * This export must never be imported from a Server Component or Route
 * Handler — see storage.server.ts, which owns every server-side data
 * access path instead (backed by the session-aware server client, not
 * this one).
 */
export const supabase = supabaseConfigured ? createBrowserClient(url!, anonKey!) : null;
