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
  /** The invites table's real primary key (uuid) — distinct from `id`
   *  above, which is the slug. Needed as a foreign key by anything that
   *  references this invitation server-side (e.g. payments.invitation_id
   *  — see src/lib/payments.server.ts). Not sensitive on its own, same
   *  reasoning as PublicInvite.invitesRowId below. */
  internalId: string;
  answers: SurveyAnswers;
  content: GeneratedInviteContent;
  guestList: GuestEntry[];
  createdAt: string;
  paid: boolean;
  /** ISO timestamp, or null if not yet published. THE gate for public
   *  visibility as of Stage 3 (supabase/migrations/
   *  20260909150000_publication_payment_split.sql) — `paid` records
   *  payment status only and no longer implies anything about whether
   *  guests can see this invite. See src/lib/ownership.ts, which reads
   *  this (not `paid`) to decide owner-published vs owner-unpublished. */
  publishedAt: string | null;
  /** The host who created this invite, or null for legacy invites created
   *  before auth existed. Compare against the signed-in user's id to
   *  determine ownership — see src/lib/ownership.ts. Never inferred from
   *  the presence/absence of a `?guest=` query param. */
  ownerId: string | null;
  /** Stage 6 (see PROJECT_STATUS.md's Stage 6 section): the validated
   *  composition document, or null for every invitation that predates
   *  Stage 6 (or was never given one) — see
   *  src/lib/composition/resolve.ts, which falls back to
   *  src/lib/composition/legacy-adapter.ts when this is null. Raw,
   *  UNVALIDATED jsonb — the owner-only read has no reason to validate
   *  it before handing it to the same resolveComposition() every other
   *  surface uses, which validates it itself. */
  composition: unknown | null;
}

/**
 * Looks up the FULL invite row by slug — OWNER-ONLY. Under RLS (see
 * supabase/migrations/20260901114159_auth_ownership.sql), a non-owner
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
    internalId: inviteRow.id,
    answers: inviteRow.answers,
    content: inviteRow.content,
    guestList,
    createdAt: inviteRow.created_at,
    paid: Boolean(inviteRow.paid),
    publishedAt: inviteRow.published_at ?? null,
    ownerId: inviteRow.owner_id ?? null,
    composition: inviteRow.composition ?? null,
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
 * city, colorMood, extraDetails), the full guest list, owner_id,
 * paypal_order_id, private payment records, preview tokens, or
 * administrator information. `tier`/`content`/`eventDate`/`song` are
 * null unless `publishedAt` is non-null — as of Stage 3
 * (supabase/migrations/20260909150000_publication_payment_split.sql),
 * `publishedAt` is the SOLE gate; `paid` is returned for informational
 * purposes only and no longer implies anything about visibility.
 * `invitesRowId`/`slug`/`paid`/`publishedAt` are always present so the
 * app can distinguish "doesn't exist" from "exists but not published
 * yet" without a second, more permissive query.
 */
export interface PublicInvite {
  /** Internal invite row id — needed only to submit an RSVP (a real FK,
   *  not the slug); not sensitive on its own. */
  invitesRowId: string;
  slug: string;
  /** Payment status only — informational. Does NOT gate visibility; see
   *  publishedAt below for that. */
  paid: boolean;
  /** ISO timestamp, or null if not yet published. THE public-access
   *  gate — see src/lib/ownership.ts, which reads this (not `paid`) to
   *  decide guest-published vs guest-unpublished. */
  publishedAt: string | null;
  tier: TierId | null;
  content: GeneratedInviteContent | null;
  eventDate: string | null;
  song: string | null;
  /** Stage 6 (see PROJECT_STATUS.md's Stage 6 section) — raw,
   *  UNVALIDATED jsonb, null unless publishedAt is set (gated by
   *  get_published_invite() itself, same as tier/content/eventDate/
   *  song). Never rendered directly — always passed through
   *  src/lib/composition/resolve.ts first. */
  composition: unknown | null;
}

/**
 * The ONLY way a non-owner reads invite data — everything it returns is
 * safe to hand to a guest or anonymous visitor. Backed by the
 * get_published_invite() SECURITY DEFINER function, which does its own
 * `published_at` check internally (bypassing RLS deliberately, the same
 * pattern as fetchGuestEntry/resolve_invite_guest above) rather than
 * relying on a table-level policy — see that function's SQL comment for
 * why a table-level policy alone isn't safe here (RLS is row-level, and
 * `answers` needed column-level protection instead).
 *
 * Stage 3 note (2026-09-09, see PROJECT_STATUS.md): fixed the
 * payment/publication coupling defect flagged in Stage 0 —
 * `get_published_invite()` now gates every generator-aware column on
 * `published_at is not null` alone; `paid`/`generator_kind` no longer
 * participate in the visibility decision at all. `generator_kind`,
 * `generator_content`, and `composition` remain unmapped here (see
 * InviteGeneratorFields in src/lib/types.ts) — wiring them through is
 * still a separate, later application-behavior change, unrelated to the
 * access-rule correction this stage makes.
 */
export async function fetchPublicInvite(client: SupabaseClient, slug: string): Promise<PublicInvite | null> {
  const { data, error } = await client.rpc("get_published_invite", { p_slug: slug }).maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    slug: string;
    paid: boolean;
    published_at: string | null;
    tier: string | null;
    content: GeneratedInviteContent | null;
    event_date: string | null;
    song: string | null;
    composition: unknown | null;
  };

  return {
    invitesRowId: row.id,
    slug: row.slug,
    paid: Boolean(row.paid),
    publishedAt: row.published_at ?? null,
    tier: (row.tier as TierId | null) ?? null,
    content: row.content,
    eventDate: row.event_date,
    song: row.song,
    composition: row.composition ?? null,
  };
}

/**
 * The sanitized payload a valid, unrevoked PRIVATE PREVIEW TOKEN unlocks
 * — Stage 5 (2026-09-10, see PROJECT_STATUS.md). Structurally the same
 * shape of restraint as PublicInvite (no answers/owner_id/
 * paypal_order_id/token hashes), with one deliberate difference:
 * tier/content/eventDate/song are ALWAYS populated here, never withheld
 * behind a publishedAt check — token possession is the authorization for
 * a preview, independent of whether the invitation has actually been
 * published yet (that's the entire point of a preview link). `paid`/
 * `publishedAt` are still returned, informationally, so the preview page
 * can show a "not necessarily published" indicator honestly.
 */
export interface PreviewInvite {
  invitesRowId: string;
  slug: string;
  paid: boolean;
  publishedAt: string | null;
  tier: TierId;
  content: GeneratedInviteContent;
  eventDate: string | null;
  song: string | null;
  /** Stage 6 (see PROJECT_STATUS.md's Stage 6 section) — raw,
   *  UNVALIDATED jsonb, returned UNCONDITIONALLY here (unlike
   *  PublicInvite's, this is never gated on publishedAt — token
   *  possession is the authorization for a preview regardless of
   *  publication state, the same reasoning get_invite_preview() already
   *  applies to tier/content/eventDate/song). Never rendered directly —
   *  always passed through src/lib/composition/resolve.ts first. */
  composition: unknown | null;
}

/**
 * The ONLY way a raw preview token is ever redeemed for invitation data.
 * Backed by get_invite_preview() (supabase/migrations/
 * 20260910120000_private_preview_links.sql), which hashes `token`
 * INSIDE itself (SECURITY DEFINER, trusted boundary) and compares
 * against invite_previews.token_hash — this function never sees, stores,
 * or needs to know the stored hash, only the raw token a caller supplies
 * and whatever sanitized row (or nothing) comes back. An invalid,
 * malformed, rotated, or revoked token all produce the identical `null`
 * here — resolve_invite_guest()'s "no distinguishing why" pattern,
 * carried over deliberately (see invite-view-model.ts's
 * buildPreviewInviteViewModel()).
 */
export async function fetchInvitePreview(client: SupabaseClient, token: string): Promise<PreviewInvite | null> {
  const { data, error } = await client.rpc("get_invite_preview", { p_token: token }).maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    slug: string;
    paid: boolean;
    published_at: string | null;
    tier: string;
    content: GeneratedInviteContent;
    event_date: string | null;
    song: string | null;
    composition: unknown | null;
  };

  return {
    invitesRowId: row.id,
    slug: row.slug,
    paid: Boolean(row.paid),
    publishedAt: row.published_at ?? null,
    tier: (row.tier as TierId) ?? "bronze",
    content: row.content,
    eventDate: row.event_date,
    song: row.song,
    composition: row.composition ?? null,
  };
}
