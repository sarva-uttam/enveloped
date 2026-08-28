import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next.js 16 renamed Middleware to Proxy (same file convention, same
// purpose) — see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
// This is an OPTIMISTIC check only (reads the session cookie, no DB round
// trip) — the real security boundary is Postgres RLS via owner_id, plus
// the auth check each protected page/query performs itself. See the Next.js
// authentication guide's own caution: proxy/middleware "should not be your
// only line of defense."

const PROTECTED_PREFIXES = ["/dashboard", "/survey"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );
  if (!isProtected) return NextResponse.next();

  // Supabase isn't configured at all — there's no way to be authenticated,
  // so let the request through; the page/query layer will show a clear
  // "sign-in required" state rather than silently allowing local-only
  // creation (see storage.ts's saveInvite).
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/survey/:path*"],
};
