import type { EventCategory, TierId } from "./types";

/**
 * The consultation-led request workflow — Stage 8 (see
 * PROJECT_STATUS.md's Stage 8 section, Part B). Client-safe (no
 * `server-only`, no database access): pure types, labels, and the
 * transition graph, shared between server code (requests-admin.server.ts)
 * and client components (the status control, the request list filter).
 *
 * `REQUEST_STATUSES` is the single TypeScript source of truth for the
 * vocabulary stored in `requests.status` — kept in sync with
 * `supabase/migrations/20260912100000_concierge_admin_generator.sql`'s
 * CHECK constraint by convention and by
 * tests/integration/concierge-admin.test.ts, which exercises every id
 * against the real database. The database stores ONLY these stable
 * machine identifiers, never a human label — `REQUEST_STATUS_LABELS`
 * below is presentation only, safe to reword without a migration.
 *
 * `REQUEST_STATUS_TRANSITIONS` mirrors
 * `is_valid_request_status_transition()` from that same migration —
 * duplicated deliberately, not to trust instead of the database check,
 * but so the admin UI can disable an invalid next-status choice before
 * ever sending it, giving instant feedback rather than a round-trip
 * error. The DATABASE trigger remains the actual enforcement; this is
 * UX only, and drift between the two would only ever make the UI overly
 * permissive (a rejected request the trigger still catches), never the
 * reverse.
 */

export const REQUEST_STATUSES = [
  "new",
  "contacted",
  "consultation",
  "accepted",
  "in_production",
  "preview_sent",
  "completed",
  "declined",
  "archived",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  contacted: "Contacted",
  consultation: "In consultation",
  accepted: "Accepted",
  in_production: "In production",
  preview_sent: "Preview sent",
  completed: "Completed",
  declined: "Declined",
  archived: "Archived",
};

/** Mirrors `is_valid_request_status_transition()` exactly — see that
 *  function's own comment (in the migration) for the full rationale of
 *  this exact graph. `archived` is terminal: no key exists for it. */
export const REQUEST_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  new: ["contacted", "declined"],
  contacted: ["consultation", "declined"],
  consultation: ["accepted", "declined"],
  accepted: ["in_production", "declined"],
  in_production: ["preview_sent", "declined"],
  preview_sent: ["in_production", "completed", "declined"],
  completed: ["archived"],
  declined: ["archived"],
  archived: [],
};

export function isValidRequestStatusTransition(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_STATUS_TRANSITIONS[from].includes(to);
}

export interface RequestSummary {
  id: string;
  referenceCode: string;
  status: RequestStatus;
  name: string;
  email: string | null;
  phone: string | null;
  preferredChannel: "whatsapp" | "email" | "instagram";
  category: EventCategory;
  eventDate: string | null;
  tierInterest: TierId | null;
  createdAt: string;
  statusChangedAt: string;
  /** The uuid of the invitation this request is already connected to, if
   *  any — a request page uses this to redirect to (rather than offer to
   *  create a second) invitation. Null means "no invitation yet." */
  invitationId: string | null;
}

export interface RequestDetail extends RequestSummary {
  requestedOccasions: string[];
  notes: string | null;
  internalNotes: string | null;
  agreedPrice: number | null;
  agreedCurrency: string;
  updatedAt: string;
}
