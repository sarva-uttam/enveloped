/**
 * The narrow, owner-management-only view model for
 * src/app/dashboard/invite/[id]/OwnerManagementBar.tsx — Stage 5
 * (2026-09-10, see PROJECT_STATUS.md's Stage 5 section). Distinct from
 * InviteViewModel (src/lib/invite-view-model.ts), which is about
 * rendering an invitation's CONTENT and is shared across the public,
 * preview, and owner-management routes: this one is about the
 * MANAGEMENT chrome around that content (paywall status, share links)
 * and is only ever built from the owner's own full StoredInvite,
 * server-side, after real ownership has already been verified.
 *
 * Deliberately does NOT carry `answers` (the raw survey blob —
 * partnerNames/venue/city/colorMood/extraDetails/guestNames free text),
 * `content`, `createdAt`, or `internalId` — OwnerManagementBar never
 * needs any of them, so they're never sent to it at all: "avoid sending
 * raw private records to unnecessary client components."
 * `guestList` IS included — the owner's own per-guest links, which the
 * share panel displays and always has, including before this stage.
 */

import type { StoredInvite } from "./storage-queries";
import type { TierId } from "./types";

export interface OwnerGuestLink {
  id: string;
  name: string;
  slug: string;
  clickTeaser: string;
}

export interface OwnerInviteViewModel {
  inviteId: string;
  tier: TierId;
  paid: boolean;
  publishedAt: string | null;
  guestList: OwnerGuestLink[];
}

export function buildOwnerManagementViewModel(stored: StoredInvite): OwnerInviteViewModel {
  return {
    inviteId: stored.id,
    tier: stored.answers.tier || "bronze",
    paid: stored.paid,
    publishedAt: stored.publishedAt,
    guestList: stored.guestList.map((g) => ({ id: g.id, name: g.name, slug: g.slug, clickTeaser: g.clickTeaser })),
  };
}
