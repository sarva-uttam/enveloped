import { supabase, supabaseConfigured } from "./supabase/client";
import type { GeneratedInviteContent, GuestEntry, SurveyAnswers } from "./types";

export interface StoredInvite {
  id: string; // = slug, used in /invite/[id]
  answers: SurveyAnswers;
  content: GeneratedInviteContent;
  guestList: GuestEntry[];
  createdAt: string;
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
 * Persists an invite. When Supabase is configured this is the source of
 * truth (so links resolve on any device); a local cache + per-device index
 * is always kept too, both as an offline fallback and to power the
 * (unauthenticated, device-scoped) dashboard listing.
 */
export async function saveInvite(invite: StoredInvite): Promise<void> {
  addToLocalIndex(invite.id);
  saveLocalCache(invite);

  if (!supabaseConfigured || !supabase) return;

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
    console.error("Supabase saveInvite failed, keeping local copy only", error);
    return;
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
}

/** Looks up an invite by slug — Supabase first (works cross-device), local cache as fallback. */
export async function getInvite(id: string): Promise<StoredInvite | null> {
  if (supabaseConfigured && supabase) {
    const { data: inviteRow } = await supabase
      .from("invites")
      .select("*")
      .eq("slug", id)
      .maybeSingle();

    if (inviteRow) {
      const { data: guestRows } = await supabase
        .from("invite_guests")
        .select("*")
        .eq("invite_id", inviteRow.id);

      const guestList: GuestEntry[] = (guestRows || []).map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        viewed: Boolean(g.viewed_at),
        clickTeaser: g.click_teaser,
      }));

      const resolved: StoredInvite = {
        id: inviteRow.slug,
        answers: inviteRow.answers,
        content: inviteRow.content,
        guestList,
        createdAt: inviteRow.created_at,
      };
      saveLocalCache(resolved);
      return resolved;
    }
  }

  return getLocalCache(id);
}

export function getAllInvites(): StoredInvite[] {
  return getInviteIndex()
    .map((id) => getLocalCache(id))
    .filter((i): i is StoredInvite => i !== null);
}

/** Removes an invite from this device's dashboard list only — does not delete the shared record. */
export function forgetInvite(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(inviteKey(id));
  const index = getInviteIndex().filter((x) => x !== id);
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export async function submitRsvp(
  inviteSlug: string,
  guestId: string | null,
  name: string,
  status: "yes" | "no"
): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return false;

  const { data: inviteRow } = await supabase
    .from("invites")
    .select("id")
    .eq("slug", inviteSlug)
    .maybeSingle();

  if (!inviteRow) return false;

  const { error } = await supabase.from("invite_rsvps").insert({
    invite_id: inviteRow.id,
    guest_id: guestId,
    name,
    status,
  });

  return !error;
}
