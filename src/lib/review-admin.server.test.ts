import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

function makeSelectQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.eq = vi.fn(chain);
  query.in = vi.fn(chain);
  query.order = vi.fn(() => Promise.resolve(result));
  return query;
}

const fromMock = vi.fn();
const rpcMock = vi.fn();
const mockClient = { from: (...args: unknown[]) => fromMock(...args), rpc: (...args: unknown[]) => rpcMock(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

import {
  createReviewRound,
  markReviewRoundReady,
  sendReviewRound,
  cancelReviewRound,
  resolveReviewRound,
  resolveReviewFeedbackItem,
  getInvitationReviewHistory,
} from "./review-admin.server";

const ADMIN = { user: { id: "admin-1" }, isAdmin: true };
const NON_ADMIN = { user: { id: "user-1" }, isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockClient);
});

describe("createReviewRound", () => {
  it("rejects a non-admin caller before touching the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await createReviewRound("invite-1");
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns the new round id on success", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: "round-1", error: null });
    const result = await createReviewRound("invite-1");
    expect(result).toEqual({ ok: true, reviewRoundId: "round-1" });
    expect(rpcMock).toHaveBeenCalledWith("admin_create_review_round", { p_invite_id: "invite-1" });
  });

  it("maps 'already exists' to reason 'already-active'", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: null, error: { message: "an active review round already exists for this invitation" } });
    const result = await createReviewRound("invite-1");
    expect(result).toEqual({ ok: false, reason: "already-active" });
  });
});

describe("round lifecycle actions", () => {
  it("markReviewRoundReady rejects a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await markReviewRoundReady("round-1");
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("markReviewRoundReady returns not-found for a false RPC result", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: false, error: null });
    const result = await markReviewRoundReady("round-1");
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("sendReviewRound calls admin_send_review_round", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: true, error: null });
    const result = await sendReviewRound("round-1");
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("admin_send_review_round", { p_review_round_id: "round-1" });
  });

  it("cancelReviewRound calls admin_cancel_review_round", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: true, error: null });
    await cancelReviewRound("round-1");
    expect(rpcMock).toHaveBeenCalledWith("admin_cancel_review_round", { p_review_round_id: "round-1" });
  });

  it("resolveReviewRound calls admin_resolve_review_round", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: true, error: null });
    await resolveReviewRound("round-1");
    expect(rpcMock).toHaveBeenCalledWith("admin_resolve_review_round", { p_review_round_id: "round-1" });
  });

  it("resolveReviewFeedbackItem rejects a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await resolveReviewFeedbackItem("item-1");
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("resolveReviewFeedbackItem calls admin_resolve_review_feedback_item", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: true, error: null });
    const result = await resolveReviewFeedbackItem("item-1");
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("admin_resolve_review_feedback_item", { p_feedback_item_id: "item-1" });
  });
});

describe("getInvitationReviewHistory", () => {
  it("returns an empty array for a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await getInvitationReviewHistory("invite-1");
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns an empty array when there are no rounds yet", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock.mockReturnValueOnce(makeSelectQuery({ data: [], error: null }));
    const result = await getInvitationReviewHistory("invite-1");
    expect(result).toEqual([]);
  });

  it("groups feedback items under their own round, newest round first", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock
      .mockReturnValueOnce(
        makeSelectQuery({
          data: [
            { id: "round-2", round_number: 2, status: "awaiting_client", composition_revision: 2, created_at: "t2", sent_at: null, opened_at: null, decided_at: null, decision_display_name: null, resolved_at: null, superseded_at: null, cancelled_at: null },
            { id: "round-1", round_number: 1, status: "superseded", composition_revision: 1, created_at: "t1", sent_at: null, opened_at: null, decided_at: null, decision_display_name: null, resolved_at: null, superseded_at: "t1b", cancelled_at: null },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeSelectQuery({
          data: [{ id: "item-1", review_round_id: "round-1", category: "wording", section_id: "opening", message: "Fix this.", display_name: "Arjun", created_at: "t1c", resolved_at: null }],
          error: null,
        })
      );

    const result = await getInvitationReviewHistory("invite-1");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("round-2");
    expect(result[0].feedbackItems).toEqual([]);
    expect(result[1].id).toBe("round-1");
    expect(result[1].feedbackItems).toEqual([
      { id: "item-1", category: "wording", sectionId: "opening", message: "Fix this.", displayName: "Arjun", createdAt: "t1c", resolvedAt: null },
    ]);
  });
});
