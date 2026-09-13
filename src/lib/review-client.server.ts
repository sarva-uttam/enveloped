import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidPreviewTokenFormat } from "@/lib/preview-tokens.server";
import { InvitationCompositionSchema } from "@/lib/composition/schema";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_ITEM_MAX_COUNT,
  FEEDBACK_ITEM_MIN_COUNT,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  type ReviewRoundStatus,
} from "@/lib/review";

/**
 * Server-only, TOKEN-gated client review actions — Stage 9 (see
 * PROJECT_STATUS.md's Stage 9 section, Part C). This is the untrusted,
 * anonymous-reachable side of the review workflow: every function here
 * accepts a RAW preview token (never a hash, never an invitation id) and
 * hands it straight to a SECURITY DEFINER function that hashes and
 * verifies it internally — the same trust shape as
 * src/lib/storage.server.ts's getInvitePreviewServer(). Nothing here
 * ever logs, stores, or echoes the raw token; only the database function
 * ever sees it, for the single query that needs it.
 *
 * Every result is deliberately generic on failure — Part C: "do not
 * reveal whether another invitation or review round exists." A bad
 * token, a wrong-status round, a stale revision, and a lost race all
 * produce the identical outward shape from this layer; only the
 * TypeScript reason codes below exist to let the UI pick a WORDING
 * (never a specific fact) to show — "not currently open for review" vs
 * a generic submission failure, not "this token doesn't exist" vs "this
 * round was already decided."
 */

export interface ReviewContext {
  inviteId: string;
  reviewRoundId: string | null;
  roundNumber: number | null;
  status: ReviewRoundStatus | null;
  isCurrent: boolean;
}

/** Loads the sanitized review context for a token — null for an
 *  invalid/malformed/rotated/revoked token, or one whose invitation has
 *  no review round at all yet (status/roundNumber/reviewRoundId are then
 *  all null, but inviteId is still real — "no round yet" is a valid,
 *  distinct state from "no such token"). */
export async function getReviewContext(token: string): Promise<ReviewContext | null> {
  if (!isValidPreviewTokenFormat(token)) return null;

  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc("get_invite_review_context", { p_token: token }).maybeSingle();
  if (error || !data) return null;

  const row = data as { invite_id: string; review_round_id: string | null; round_number: number | null; status: string | null; is_current: boolean | null };
  return {
    inviteId: row.invite_id,
    reviewRoundId: row.review_round_id,
    roundNumber: row.round_number,
    status: (row.status as ReviewRoundStatus | null) ?? null,
    isCurrent: Boolean(row.is_current),
  };
}

/** Best-effort "opened" tracking — safe to call unconditionally on every
 *  render of a page that reaches an active round; the database function
 *  itself is the only place that decides whether there's anything to
 *  record. Never throws, never surfaces a result the caller needs to
 *  branch on — an opened-tracking failure must never block rendering
 *  the preview itself. */
export async function markReviewOpened(token: string): Promise<void> {
  if (!isValidPreviewTokenFormat(token)) return;
  const client = await createServerSupabaseClient();
  if (!client) return;
  await client.rpc("mark_review_round_opened", { p_token: token });
}

const DisplayNameSchema = z
  .string()
  .trim()
  .max(DISPLAY_NAME_MAX_LENGTH)
  .refine((v) => !/[<>]/.test(v), { message: "must not contain HTML-like characters" })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .nullable()
  .optional();

export type SubmitDecisionResult = { ok: true } | { ok: false; reason: "unavailable" | "invalid-input" };

/** Submits an approval decision for whatever round is currently
 *  awaiting_client AND still bound to the invitation's current
 *  composition revision — see submit_review_approval()'s own comment
 *  for the full transactional/authorization shape. `unavailable` covers
 *  every failure reason identically, by design. */
export async function submitApproval(token: string, displayName?: string | null): Promise<SubmitDecisionResult> {
  if (!isValidPreviewTokenFormat(token)) return { ok: false, reason: "unavailable" };

  const parsedName = DisplayNameSchema.safeParse(displayName ?? null);
  if (!parsedName.success) return { ok: false, reason: "invalid-input" };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "unavailable" };

  const { data, error } = await client.rpc("submit_review_approval", { p_token: token, p_display_name: parsedName.data ?? null });
  if (error || data !== "ok") return { ok: false, reason: "unavailable" };
  return { ok: true };
}

const FeedbackItemInputSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).nullable().optional(),
  sectionId: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .nullable()
    .optional(),
  message: z
    .string()
    .trim()
    .min(1)
    .max(FEEDBACK_MESSAGE_MAX_LENGTH)
    .refine((v) => !/[<>]/.test(v), { message: "must not contain HTML-like characters" })
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .refine((v) => v.length > 0, { message: "must not be empty after normalization" }),
});

const SubmitChangesInputSchema = z.object({
  items: z.array(FeedbackItemInputSchema).min(FEEDBACK_ITEM_MIN_COUNT).max(FEEDBACK_ITEM_MAX_COUNT),
  displayName: DisplayNameSchema,
});

/** Every enabled-or-disabled section id present in a raw, unvalidated
 *  composition value — used so a feedback item's optional sectionId can
 *  be checked against the invitation's OWN real sections, never an
 *  arbitrary string. Returns an empty set for a composition that
 *  doesn't even pass schema validation (matching how the rest of this
 *  project treats an invalid composition as equivalent to none at all). */
function extractSectionIds(rawComposition: unknown): Set<string> {
  const parsed = InvitationCompositionSchema.safeParse(rawComposition);
  if (!parsed.success) return new Set();
  return new Set(parsed.data.sections.map((s) => s.id));
}

/**
 * Submits a structured "request changes" decision. `rawComposition` is
 * the SAME composition value the caller already fetched via
 * getInvitePreviewServer() for rendering — passed in here rather than
 * re-fetched, so this function never needs its own database round trip
 * beyond the RPC call itself, and there is exactly one place
 * (storage.server.ts's existing preview fetch) that ever reads
 * composition through a token.
 */
export async function submitChangeRequest(
  token: string,
  input: { items: unknown; displayName?: string | null },
  rawComposition: unknown
): Promise<SubmitDecisionResult> {
  if (!isValidPreviewTokenFormat(token)) return { ok: false, reason: "unavailable" };

  const parsed = SubmitChangesInputSchema.safeParse({ items: input.items, displayName: input.displayName ?? null });
  if (!parsed.success) return { ok: false, reason: "invalid-input" };

  const validSectionIds = extractSectionIds(rawComposition);
  for (const item of parsed.data.items) {
    if (item.sectionId && !validSectionIds.has(item.sectionId)) {
      return { ok: false, reason: "invalid-input" };
    }
  }

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, reason: "unavailable" };

  const { data, error } = await client.rpc("submit_review_changes", {
    p_token: token,
    p_items: parsed.data.items.map((i) => ({ category: i.category ?? null, sectionId: i.sectionId ?? null, message: i.message })),
    p_display_name: parsed.data.displayName ?? null,
  });

  if (error || data !== "ok") return { ok: false, reason: "unavailable" };
  return { ok: true };
}
