import { supabase, supabaseConfigured } from "./supabase/client";
import { fetchInvite, fetchGuestEntry, fetchPublicInvite, type StoredInvite, type PublicInvite } from "./storage-queries";

export type { StoredInvite, PublicInvite };

/**
 * Browser-only data access — every function here is safe to call from
 * client components ("use client") because it goes through the anon-key
 * browser client (src/lib/supabase/client.ts), never a server/service-role
 * one. Server Components and Route Handlers must use
 * src/lib/storage.server.ts instead — see its module doc for why.
 */

export class NotAuthenticatedError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

const INDEX_KEY = "enveloped:invites";

function inviteKey(id: string) {
  return `enveloped:invite:${id}`;
}

function saveLocalCache(invite: StoredInvite) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(inviteKey(invite.id), JSON.stringify(invite));
}

function getLocalCache(id: string): StoredInvite | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(inviteKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredInvite;
  } catch {
    return null;
  }
}

function addToLocalIndex(id: string) {
  if (typeof window === "undefined") return;
  const index = getInviteIndex();
  if (!index.includes(id)) {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify([id, ...index]));
  }
}

export function getInviteIndex(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Persists a new invite, owned by the currently signed-in host.
 *
 * Requires both an authenticated session and Supabase to be configured —
 * invite creation is no longer a local-only/offline operation, because an
 * invite with no real owner can't be protected by anything. Throws
 * NotAuthenticatedError (surface this in the UI) rather than silently
 * falling back to an ownerless local copy.
 *
 * owner_id is intentionally NOT sent from the client — the invites table
 * defaults it to auth.uid() server-side, so a client can never claim
 * ownership on someone else's behalf even if this code had a bug.
 */
export async function saveInvite(
  invite: Omit<StoredInvite, "ownerId" | "internalId">
): Promise<void> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Invites require a configured Supabase backend — none is set up.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new NotAuthenticatedError();

  const { data: inviteRow, error } = await supabase
    .from("invites")
    .insert({
      slug: invite.id,
      category: invite.answers.category,
      tier: invite.answers.tier,
      answers: invite.answers,
      content: invite.content,
    })
    .select()
    .single();

  if (error || !inviteRow) {
    throw new Error(error?.message ?? "Could not save this invite. Please try again.");
  }

  if (invite.guestList.length > 0) {
    const rows = invite.guestList.map((g) => ({
      invite_id: inviteRow.id,
      name: g.name,
      slug: g.slug,
      click_teaser: g.clickTeaser,
    }));
    const { error: guestErr } = await supabase.from("invite_guests").insert(rows);
    if (guestErr) console.error("Supabase saveInvite guests failed", guestErr);
  }

  const resolved: StoredInvite = { ...invite, internalId: inviteRow.id, ownerId: user.id };
  addToLocalIndex(resolved.id);
  saveLocalCache(resolved);
}

/**
 * Looks up an invite by slug for VIEWING, from a client component — for
 * a Server Component or Route Handler, use getInviteServer() in
 * storage.server.ts instead, not this function. See fetchInvite() in
 * storage-queries.ts for exactly what this does and doesn't return.
 */
export async function getInvite(id: string): Promise<StoredInvite | null> {
  if (supabaseConfigured && supabase) {
    const result = await fetchInvite(supabase, id);
    if (result) {
      saveLocalCache(result);
      return result;
    }
  }

  return getLocalCache(id);
}

/**
 * Resolves ONE guest's public-safe fields (name + click teaser), from a
 * client component — for server-side use, see getGuestEntryServer() in
 * storage.server.ts instead. See fetchGuestEntry() in storage-queries.ts.
 */
export async function getGuestEntry(
  inviteSlug: string,
  guestSlug: string
): Promise<{ id: string; name: string; clickTeaser: string } | null> {
  if (!supabaseConfigured || !supabase) return null;
  return fetchGuestEntry(supabase, inviteSlug, guestSlug);
}

/**
 * The guest/anonymous-visitor read path, from a client component — for
 * server-side use (generateMetadata), see getPublicInviteServer() in
 * storage.server.ts instead. Never returns answers, owner_id, or
 * paypal_order_id — see PublicInvite / fetchPublicInvite() in
 * storage-queries.ts for exactly what it does return.
 */
export async function getPublicInvite(slug: string): Promise<PublicInvite | null> {
  if (!supabaseConfigured || !supabase) return null;
  return fetchPublicInvite(supabase, slug);
}

/**
 * Lists every invite owned by the currently signed-in host — the
 * dashboard's data source. Returns [] (never someone else's invites) when
 * signed out; RLS also enforces this independently at the database layer.
 */
export async function getMyInvites(): Promise<StoredInvite[]> {
  if (!supabaseConfigured || !supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows, error } = await supabase
    .from("invites")
    .select("*, invite_guests(*)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !rows) return [];

  return rows.map((row) => ({
    id: row.slug,
    internalId: row.id,
    answers: row.answers,
    content: row.content,
    guestList: (row.invite_guests || []).map(
      (g: { id: string; name: string; slug: string; viewed_at: string | null; click_teaser: string }) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        viewed: Boolean(g.viewed_at),
        clickTeaser: g.click_teaser,
      })
    ),
    createdAt: row.created_at,
    paid: Boolean(row.paid),
    ownerId: row.owner_id ?? null,
  }));
}

/**
 * Permanently deletes an invite the caller owns. RLS restricts this to
 * the invite's actual owner — safe to expose directly to the client.
 */
export async function deleteOwnInvite(id: string): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return false;
  const { error } = await supabase.from("invites").delete().eq("slug", id);
  return !error;
}

/** @deprecated legacy device-local index — kept only as an offline cache; getMyInvites() is the dashboard's real source now. */
export function getAllInvites(): StoredInvite[] {
  return getInviteIndex()
    .map((id) => getLocalCache(id))
    .filter((i): i is StoredInvite => i !== null);
}

export function forgetInvite(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(inviteKey(id));
  const index = getInviteIndex().filter((x) => x !== id);
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * Looks up the invite by slug via the sanitized public read (not the raw
 * `invites` table, which is owner-only now — a guest submitting an RSVP
 * has no session and would get nothing from a direct table read) to
 * resolve the internal id RSVPs need as a foreign key, then inserts.
 * Also refuses to submit against an unpublished invite — the RSVP form
 * shouldn't even be reachable there, but this makes it impossible
 * regardless of what the client sends.
 */
export async function submitRsvp(
  inviteSlug: string,
  guestId: string | null,
  name: string,
  status: "yes" | "no"
): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return false;

  const invite = await fetchPublicInvite(supabase, inviteSlug);
  if (!invite || !invite.paid) return false;

  const { error } = await supabase.from("invite_rsvps").insert({
    invite_id: invite.invitesRowId,
    guest_id: guestId,
    name,
    status,
  });

  return !error;
}
