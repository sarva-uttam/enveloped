import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedInviteContent, GuestEntry, SurveyAnswers, TierId } from "./types";

/**
 * Client-agnostic read logic, shared by storage.ts (browser client) and
 * storage.server.ts (server client). Takes an injected Supabase client
 * rather than importing one itself — this file has no "use client" or
 * "server-only" restriction because it doesn't decide WHICH client to
 * use, only WHAT to query. That decision belongs to the caller:
 * client components must inject the browser client (src/lib/supabase/
 * client.ts), Server Components and Route Handlers must inject the
 * session-aware server client (src/lib/supabase/server.ts). Never import
 * a Supabase client instance directly into this file.
 */

export interface StoredInvite {
  id: string; // = slug, used in /invite/[id]
  answers: SurveyAnswers;
  content: GeneratedInviteContent;
  guestList: GuestEntry[];
  createdAt: string;
  paid: boolean;
  /** The host who created this invite, or null for legacy invites created
   *  before auth existed. Compare against the signed-in user's id to
   *  determine ownership — see src/lib/ownership.ts. Never inferred from
   *  the presence/absence of a `?guest=` query param. */
  ownerId: string | null;
}

/**
 * Looks up the FULL invite row by slug — OWNER-ONLY. Under RLS (see
 * supabase/migrations/20260828000000_auth_ownership.sql), a non-owner
 * caller (anonymous or a different authenticated user) always gets null
 * back here, regardless of paid status — the raw table, including
 * `answers` (raw survey input — partner names, venue, city, and
 * critically `guestNames`, the host's plain-text guest list), has no
 * public read path at all. For anyone who isn't the owner, use
 * fetchPublicInvite() instead, which returns a hand-picked safe subset —
 * never call this function for a guest-facing render.
 */
export async function fetchInvite(client: SupabaseClient, id: string): Promise<StoredInvite | null> {
  const { data: inviteRow } = await client.from("invites").select("*").eq("slug", id).maybeSingle();

  if (!inviteRow) return null;

  const { data: guestRows } = await client
    .from("invite_guests")
    .select("*")
    .eq("invite_id", inviteRow.id);

  const guestList: GuestEntry[] = (guestRows || []).map(
    (g: { id: string; name: string; slug: string; viewed_at: string | null; click_teaser: string }) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      viewed: Boolean(g.viewed_at),
      clickTeaser: g.click_teaser,
    })
  );

  return {
    id: inviteRow.slug,
    answers: inviteRow.answers,
    content: inviteRow.content,
    guestList,
    createdAt: inviteRow.created_at,
    paid: Boolean(inviteRow.paid),
    ownerId: inviteRow.owner_id ?? null,
  };
}

/**
 * Resolves ONE guest's public-safe fields (name + click teaser) by exact
 * (invite slug, guest slug) match, via the resolve_invite_guest()
 * SECURITY DEFINER function — never the full guest list.
 */
export async function fetchGuestEntry(
  client: SupabaseClient,
  inviteSlug: string,
  guestSlug: string
): Promise<{ id: string; name: string; clickTeaser: string } | null> {
  const { data, error } = await client
    .rpc("resolve_invite_guest", { p_invite_slug: inviteSlug, p_guest_slug: guestSlug })
    .maybeSingle();

  if (error || !data) return null;
  // Untyped client (no supabase gen typegen in this project) — the shape
  // is guaranteed by resolve_invite_guest()'s SQL `returns table (...)`.
  const row = data as { id: string; name: string; click_teaser: string };
  return { id: row.id, name: row.name, clickTeaser: row.click_teaser };
}

/**
 * The sanitized, minimal payload a non-owner (guest or anonymous
 * visitor) is allowed to see for an invite. Deliberately does NOT
 * include: answers (raw survey input — guestNames, partnerNames, venue,
 * city, colorMood, extraDetails), the full guest list, owner_id, or
 * paypal_order_id. `tier`/`content`/`eventDate`/`song` are null unless
 * `paid` is true; `invitesRowId`/`slug`/`paid` are always present so the
 * app can distinguish "doesn't exist" from "exists but not published
 * yet" without a second, more permissive query.
 */
export interface PublicInvite {
  /** Internal invite row id — needed only to submit an RSVP (a real FK,
   *  not the slug); not sensitive on its own. */
  invitesRowId: string;
  slug: string;
  paid: boolean;
  tier: TierId | null;
  content: GeneratedInviteContent | null;
  eventDate: string | null;
  song: string | null;
}

/**
 * The ONLY way a non-owner reads invite data — everything it returns is
 * safe to hand to a guest or anonymous visitor. Backed by the
 * get_published_invite() SECURITY DEFINER function, which does its own
 * `paid` check internally (bypassing RLS deliberately, the same pattern
 * as fetchGuestEntry/resolve_invite_guest above) rather than relying on
 * a table-level policy — see that function's SQL comment for why a
 * table-level "paid = true" policy alone isn't safe here (RLS is
 * row-level, and `answers` needed column-level protection instead).
 */
export async function fetchPublicInvite(client: SupabaseClient, slug: string): Promise<PublicInvite | null> {
  const { data, error } = await client.rpc("get_published_invite", { p_slug: slug }).maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    slug: string;
    paid: boolean;
    tier: string | null;
    content: GeneratedInviteContent | null;
    event_date: string | null;
    song: string | null;
  };

  return {
    invitesRowId: row.id,
    slug: row.slug,
    paid: Boolean(row.paid),
    tier: (row.tier as TierId | null) ?? null,
    content: row.content,
    eventDate: row.event_date,
    song: row.song,
  };
}
