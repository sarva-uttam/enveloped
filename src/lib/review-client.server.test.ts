import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const mockServerClient = { rpc: (...args: unknown[]) => rpc(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

import { getReviewContext, markReviewOpened, submitApproval, submitChangeRequest } from "./review-client.server";
import { PREVIEW_TOKEN_LENGTH } from "./preview-tokens.server";

const VALID_TOKEN = "a".repeat(PREVIEW_TOKEN_LENGTH);

const VALID_COMPOSITION = {
  schemaVersion: 1,
  templateId: null,
  designPackId: "neutral-classic",
  eventCategory: "wedding-other",
  weddingContext: null,
  locale: "en",
  dir: "ltr",
  themeTokens: { paletteId: "neutral-classic" },
  featureConfig: { motion: true, ambientMotif: "none", openingBurst: false },
  sections: [{ id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Hi" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
});

describe("getReviewContext", () => {
  it("returns null for a malformed token, without calling the database", async () => {
    const result = await getReviewContext("too-short");
    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a valid RPC row to the sanitized context shape", async () => {
    rpc.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: { invite_id: "i1", review_round_id: "r1", round_number: 2, status: "awaiting_client", is_current: true }, error: null }) });
    const result = await getReviewContext(VALID_TOKEN);
    expect(result).toEqual({ inviteId: "i1", reviewRoundId: "r1", roundNumber: 2, status: "awaiting_client", isCurrent: true });
  });

  it("returns null when the RPC errors or returns nothing", async () => {
    rpc.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    expect(await getReviewContext(VALID_TOKEN)).toBeNull();
  });
});

describe("markReviewOpened", () => {
  it("does not call the database for a malformed token", async () => {
    await markReviewOpened("bad");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls mark_review_round_opened for a well-formed token", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await markReviewOpened(VALID_TOKEN);
    expect(rpc).toHaveBeenCalledWith("mark_review_round_opened", { p_token: VALID_TOKEN });
  });
});

describe("submitApproval", () => {
  it("rejects a malformed token without calling the database", async () => {
    const result = await submitApproval("bad-token");
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects HTML-like content in the display name before calling the database", async () => {
    const result = await submitApproval(VALID_TOKEN, "<script>alert(1)</script>");
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("submits successfully with a normalized display name", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    const result = await submitApproval(VALID_TOKEN, "  Priya  ");
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("submit_review_approval", { p_token: VALID_TOKEN, p_display_name: "Priya" });
  });

  it("maps a non-'ok' RPC result to the generic 'unavailable' reason", async () => {
    rpc.mockResolvedValue({ data: "unavailable", error: null });
    const result = await submitApproval(VALID_TOKEN);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("submitChangeRequest", () => {
  it("rejects an empty items array", async () => {
    const result = await submitChangeRequest(VALID_TOKEN, { items: [] }, VALID_COMPOSITION);
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects HTML/script-like content in a feedback message", async () => {
    const result = await submitChangeRequest(VALID_TOKEN, { items: [{ message: "<script>alert(1)</script>" }] }, VALID_COMPOSITION);
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a message over the length limit", async () => {
    const result = await submitChangeRequest(VALID_TOKEN, { items: [{ message: "x".repeat(2001) }] }, VALID_COMPOSITION);
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
  });

  it("rejects a sectionId that doesn't exist in the invitation's own composition", async () => {
    const result = await submitChangeRequest(VALID_TOKEN, { items: [{ message: "Fix this.", sectionId: "not-a-real-section" }] }, VALID_COMPOSITION);
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a sectionId that DOES exist in the composition", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    const result = await submitChangeRequest(VALID_TOKEN, { items: [{ message: "Fix the headline.", sectionId: "opening" }] }, VALID_COMPOSITION);
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "submit_review_changes",
      expect.objectContaining({ p_token: VALID_TOKEN, p_items: [{ category: null, sectionId: "opening", message: "Fix the headline." }] })
    );
  });

  it("normalizes whitespace in the message", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    await submitChangeRequest(VALID_TOKEN, { items: [{ message: "Fix   the\n\nheadline." }] }, VALID_COMPOSITION);
    expect(rpc).toHaveBeenCalledWith("submit_review_changes", expect.objectContaining({ p_items: [expect.objectContaining({ message: "Fix the headline." })] }));
  });

  it("more than 10 items is rejected before calling the database", async () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ message: `item ${i}` }));
    const result = await submitChangeRequest(VALID_TOKEN, { items }, VALID_COMPOSITION);
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats an invalid/unparseable composition as having no valid section ids", async () => {
    const result = await submitChangeRequest(VALID_TOKEN, { items: [{ message: "Fix this.", sectionId: "opening" }] }, { garbage: true });
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
  });
});
