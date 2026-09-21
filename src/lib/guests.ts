/**
 * Guest management, personalized guest links, and RSVP — Stage 10.
 * Client-safe (no `server-only`, no database access): pure types, labels,
 * and limits shared between server code (guest-admin.server.ts,
 * guest-client.server.ts) and client components (the admin guest-
 * management UI, the guest RSVP form), the same role src/lib/review.ts
 * plays for the client review workflow.
 *
 * Every numeric/length limit here mirrors a real CHECK constraint in
 * supabase/migrations/20260914090000_guest_management.sql — the database
 * is the actual backstop; these are for client-side and trusted-server
 * Zod validation so a rejection is instant, not a round trip.
 */

import type { GeneratedInviteContent, TierId } from "@/lib/types";

export const RSVP_STATUSES = ["pending", "attending", "declined"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export function isRsvpStatus(value: string): value is RsvpStatus {
  return (RSVP_STATUSES as readonly string[]).includes(value);
}

export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = {
  pending: "Pending",
  attending: "Attending",
  declined: "Declined",
};

export const GUEST_NAME_MAX_LENGTH = 160;
export const HOUSEHOLD_NAME_MAX_LENGTH = 120;
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const CONTACT_PHONE_MAX_LENGTH = 30;
export const INTERNAL_NOTES_MAX_LENGTH = 2000;
export const DIETARY_NOTES_MAX_LENGTH = 500;
export const PLUS_ONE_NAME_MAX_LENGTH = 120;
export const MIN_PERMITTED_ATTENDEES = 1;
export const MAX_PERMITTED_ATTENDEES = 10;
export const MAX_EVENT_ATTENDANCE_ENTRIES = 12;

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 500_000;

/** One event-level attendance answer — `scheduleEntryId` must match a
 *  real `id` from the invitation's own composition `schedule` section
 *  (re-validated server-side by submit_guest_rsvp(), never trusted from
 *  the client alone). */
export interface EventAttendanceEntry {
  scheduleEntryId: string;
  attending: boolean;
}

/** The admin guest-list read model — mirrors admin_list_invite_guests()'s
 *  return shape exactly, camelCased. Defined here (client-safe) rather
 *  than in guest-admin.server.ts so admin UI Client Components can import
 *  the type without pulling in a `server-only` module. */
export interface AdminGuestRow {
  id: string;
  name: string;
  slug: string;
  householdId: string | null;
  householdName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  permittedAttendees: number;
  allowPlusOne: boolean;
  internalNotes: string | null;
  isActive: boolean;
  rsvpStatus: RsvpStatus;
  attendeeCount: number;
  plusOneName: string | null;
  dietaryNotes: string | null;
  eventAttendance: EventAttendanceEntry[];
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasLink: boolean;
  linkRevoked: boolean;
}

export interface AdminGuestHousehold {
  id: string;
  name: string;
  createdAt: string;
}

/** Exact counts only — mirrors admin_guest_dashboard_summary()'s return
 *  shape. "Use exact counts rather than decorative fake analytics." */
export interface AdminGuestDashboardSummary {
  totalInvited: number;
  responded: number;
  attending: number;
  declined: number;
  pending: number;
  totalExpectedAttendees: number;
  plusOneCount: number;
  withDietaryNotes: number;
}

/** The sanitized, guest-facing view of their own invitation — mirrors
 *  get_guest_invite()'s return shape. Never carries owner/admin/payment/
 *  internal-note/contact fields — those columns are not even in this
 *  function's `returns table (...)` shape, so there is no code path that
 *  could include them. */
export interface GuestInviteView {
  inviteId: string;
  slug: string;
  tier: TierId;
  content: GeneratedInviteContent;
  composition: unknown;
  guestId: string;
  guestName: string;
  permittedAttendees: number;
  allowPlusOne: boolean;
  rsvpStatus: RsvpStatus;
  attendeeCount: number;
  plusOneName: string | null;
  dietaryNotes: string | null;
  eventAttendance: EventAttendanceEntry[];
}

export interface GuestCsvImportRow {
  name: string;
  householdName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  permittedAttendees?: number | null;
  allowPlusOne?: boolean | null;
  internalNotes?: string | null;
}

export interface GuestCsvImportRowResult {
  row: number;
  status: "inserted" | "skipped" | "error";
  reason?: string;
  guestId?: string;
}
