/**
 * Client review workflow — Stage 9 (see PROJECT_STATUS.md's Stage 9
 * section, Part B). Client-safe (no `server-only`, no database access):
 * pure types, labels, and limits shared between server code
 * (review-admin.server.ts, review-client.server.ts) and client
 * components (the admin ReviewPanel, the public preview's decision UI),
 * the same role src/lib/requests.ts plays for the request pipeline.
 *
 * `ROUND_STATUSES` mirrors the CHECK constraint on `review_rounds.status`
 * in supabase/migrations/20260913120000_client_review_workflow.sql — the
 * database is the actual source of truth; this is presentation and
 * client-side UX only.
 *
 * A decision "display name" anywhere in this module — and everywhere it
 * flows through the app — is a label the visitor typed into a form, not
 * a verified identity. Every human-facing string built from it must say
 * so, or at minimum never imply otherwise.
 */

export const ROUND_STATUSES = [
  "draft",
  "ready_to_send",
  "awaiting_client",
  "changes_requested",
  "client_approved",
  "resolved",
  "superseded",
  "cancelled",
] as const;

export type ReviewRoundStatus = (typeof ROUND_STATUSES)[number];

export function isReviewRoundStatus(value: string): value is ReviewRoundStatus {
  return (ROUND_STATUSES as readonly string[]).includes(value);
}

export const ROUND_STATUS_LABELS: Record<ReviewRoundStatus, string> = {
  draft: "Draft",
  ready_to_send: "Ready to send",
  awaiting_client: "Awaiting client",
  changes_requested: "Changes requested",
  client_approved: "Approved by client",
  resolved: "Resolved",
  superseded: "Superseded",
  cancelled: "Cancelled",
};

/** Statuses a round can be in that still count as "the active round" for
 *  an invitation — mirrors review_rounds_one_active_idx exactly (the
 *  partial unique index that makes this structural, not conventional). */
export const ACTIVE_ROUND_STATUSES: readonly ReviewRoundStatus[] = [
  "draft",
  "ready_to_send",
  "awaiting_client",
  "changes_requested",
  "client_approved",
];

export const FEEDBACK_CATEGORIES = [
  "wording",
  "names",
  "dateTime",
  "venue",
  "schedule",
  "imagery",
  "style",
  "music",
  "rsvp",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  wording: "Wording",
  names: "Names",
  dateTime: "Date / time",
  venue: "Venue",
  schedule: "Event schedule",
  imagery: "Imagery",
  style: "Colours / style",
  music: "Music",
  rsvp: "RSVP",
  other: "Other",
};

/** Mirrors review_feedback_items' CHECK constraints exactly — the
 *  database is the real backstop; these are used for client-side and
 *  trusted-server Zod validation so a rejection is instant, not a
 *  round-trip. */
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;
export const FEEDBACK_ITEM_MIN_COUNT = 1;
export const FEEDBACK_ITEM_MAX_COUNT = 10;
export const DISPLAY_NAME_MAX_LENGTH = 100;

/** The fixed, honest wording used everywhere a client decision is
 *  attributed — Part E/G: "the interface and audit trail must say a
 *  decision was submitted through the private preview link, not falsely
 *  claim a legally verified identity." Centralized here so no other
 *  file has to independently get the wording right. */
export const UNVERIFIED_IDENTITY_NOTE = "Submitted through the private preview link — not a verified identity.";

/**
 * The admin review-history read model — defined here (client-safe)
 * rather than in review-admin.server.ts (which is `import "server-only"`
 * and therefore cannot be imported, even for its types, from
 * InvitationEditor.tsx — a Client Component). review-admin.server.ts
 * imports these back for its own return type.
 */
export interface AdminReviewFeedbackItem {
  id: string;
  category: FeedbackCategory | null;
  sectionId: string | null;
  message: string;
  displayName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminReviewRound {
  id: string;
  roundNumber: number;
  status: ReviewRoundStatus;
  compositionRevision: number;
  createdAt: string;
  sentAt: string | null;
  openedAt: string | null;
  decidedAt: string | null;
  decisionDisplayName: string | null;
  resolvedAt: string | null;
  supersededAt: string | null;
  cancelledAt: string | null;
  feedbackItems: AdminReviewFeedbackItem[];
}
