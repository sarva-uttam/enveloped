import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";

/**
 * Supabase's magic-link email points here with a `code` param (PKCE flow).
 * Exchanging it sets the session cookies via the server client's cookie
 * adapter, then we redirect on to wherever the user was headed.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // next is attacker-controlled (round-tripped from the magic-link email,
  // itself seeded from /login?next=... — a URL anyone can craft and send
  // to anyone). Redirecting to `${origin}${next}` without validating next
  // first is a classic open redirect — see sanitizeRedirectPath's doc
  // comment for the specific "@evil.com" trick that defeats naive origin
  // prefixing.
  const next = sanitizeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
