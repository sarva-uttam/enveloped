// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { AdminReviewRound } from "@/lib/review";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { ReviewPanel } from "./ReviewPanel";

/**
 * Stage 9 Part L — the admin review panel: renders history safely,
 * visually distinguishes a current-revision approval from a historical
 * one, labels the client display name as unverified, and dispatches
 * each action button to its own route.
 */

function round(overrides: Partial<AdminReviewRound> = {}): AdminReviewRound {
  return {
    id: "round-1",
    roundNumber: 1,
    status: "awaiting_client",
    compositionRevision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    sentAt: null,
    openedAt: null,
    decidedAt: null,
    decisionDisplayName: null,
    resolvedAt: null,
    supersededAt: null,
    cancelledAt: null,
    feedbackItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("empty state", () => {
  it("shows a 'no review round' message and a start button when there is no history", () => {
    render(<ReviewPanel invitationId="inv-1" currentRevision={0} history={[]} />);
    expect(screen.getByText(/no review round has been started/i)).toBeTruthy();
    expect(screen.getByText(/start a review round/i)).toBeTruthy();
  });
});

describe("current vs historical approval — visually distinguishable", () => {
  it("labels a client_approved round for the CURRENT revision as current", () => {
    render(<ReviewPanel invitationId="inv-1" currentRevision={2} history={[round({ status: "client_approved", compositionRevision: 2 })]} />);
    expect(screen.queryByText(/this invitation has since been edited/i)).toBeNull();
  });

  it("flags a client_approved round whose revision is behind the CURRENT one as out of date", () => {
    render(<ReviewPanel invitationId="inv-1" currentRevision={3} history={[round({ status: "client_approved", compositionRevision: 2 })]} />);
    expect(screen.getByText(/this invitation has since been edited/i)).toBeTruthy();
  });

  it("renders older rounds in a separate collapsed history section", () => {
    render(
      <ReviewPanel
        invitationId="inv-1"
        currentRevision={2}
        history={[round({ id: "round-2", roundNumber: 2, compositionRevision: 2 }), round({ id: "round-1", roundNumber: 1, compositionRevision: 1, status: "superseded" })]}
      />
    );
    expect(screen.getByText(/1 earlier round/i)).toBeTruthy();
  });
});

describe("unverified identity labelling", () => {
  it("labels a client's decision display name as not a verified identity", () => {
    render(<ReviewPanel invitationId="inv-1" currentRevision={1} history={[round({ status: "client_approved", decidedAt: "2026-01-02T00:00:00Z", decisionDisplayName: "Priya" })]} />);
    expect(screen.getByText(/priya/i)).toBeTruthy();
    expect(screen.getByText(/not a verified identity/i)).toBeTruthy();
  });

  it("labels a feedback item's display name the same way", () => {
    render(
      <ReviewPanel
        invitationId="inv-1"
        currentRevision={1}
        history={[
          round({
            status: "changes_requested",
            feedbackItems: [{ id: "item-1", category: "wording", sectionId: "opening", message: "Fix the headline.", displayName: "Arjun", createdAt: "t", resolvedAt: null }],
          }),
        ]}
      />
    );
    expect(screen.getByText(/fix the headline/i)).toBeTruthy();
    expect(screen.getByText(/arjun/i)).toBeTruthy();
    expect(screen.getAllByText(/not a verified identity/i).length).toBeGreaterThan(0);
  });

  it("renders feedback message as plain text (React's default escaping) — never via dangerouslySetInnerHTML", () => {
    render(
      <ReviewPanel
        invitationId="inv-1"
        currentRevision={1}
        history={[
          round({
            status: "changes_requested",
            feedbackItems: [{ id: "item-1", category: null, sectionId: null, message: "Plain feedback text", createdAt: "t", resolvedAt: null, displayName: null }],
          }),
        ]}
      />
    );
    expect(document.querySelector("[dangerously-set-inner-html]")).toBeNull();
    expect(screen.getByText("Plain feedback text")).toBeTruthy();
  });
});

describe("admin actions dispatch to the correct routes", () => {
  it("'Mark ready' posts to /api/admin/reviews/[roundId] with action: ready", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ReviewPanel invitationId="inv-1" currentRevision={1} history={[round({ status: "draft" })]} />);
    fireEvent.click(screen.getByText(/mark ready/i));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/reviews/round-1", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "ready" }) })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("'Start a review round' posts to the invitation's review endpoint", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ reviewRoundId: "new-round" }) });
    render(<ReviewPanel invitationId="inv-1" currentRevision={0} history={[]} />);
    fireEvent.click(screen.getByText(/start a review round/i));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/invitations/inv-1/review", expect.objectContaining({ method: "POST" })));
  });

  it("resolving a feedback item posts to the feedback resolve route", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(
      <ReviewPanel
        invitationId="inv-1"
        currentRevision={1}
        history={[round({ status: "changes_requested", feedbackItems: [{ id: "item-9", category: null, sectionId: null, message: "Fix this.", createdAt: "t", resolvedAt: null, displayName: null }] })]}
      />
    );
    fireEvent.click(screen.getByText(/^resolve$/i));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/reviews/feedback/item-9", expect.objectContaining({ method: "POST" })));
  });
});

describe("Stage 9 accessibility correction — centralized keyboard focus", () => {
  it("round-lifecycle action buttons carry the centralized .focus-ring class, not a one-off Tailwind ring utility", () => {
    render(<ReviewPanel invitationId="inv-1" currentRevision={1} history={[round({ status: "draft" })]} />);
    const markReady = screen.getByText(/mark ready/i);
    expect(markReady.className).toContain("focus-ring");
    expect(markReady.className).not.toMatch(/focus-visible:ring-\d|focus:ring-\d/);
  });

  it("the 'start a review round' button is a real, focusable <button>", () => {
    render(<ReviewPanel invitationId="inv-1" currentRevision={0} history={[]} />);
    const start = screen.getByText(/start a review round/i) as HTMLButtonElement;
    expect(start.tagName).toBe("BUTTON");
    expect(start.className).toContain("focus-ring");
    start.focus();
    expect(document.activeElement).toBe(start);
  });

  it("the review-history <summary> toggle carries .focus-ring — a native, keyboard-operable disclosure control, not a styled div", () => {
    render(
      <ReviewPanel
        invitationId="inv-1"
        currentRevision={2}
        history={[round({ id: "round-2", roundNumber: 2, compositionRevision: 2 }), round({ id: "round-1", roundNumber: 1, compositionRevision: 1, status: "superseded" })]}
      />
    );
    const summary = screen.getByText(/1 earlier round/i);
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.className).toContain("focus-ring");
  });

  it("per-item feedback 'Resolve' buttons carry .focus-ring", () => {
    render(
      <ReviewPanel
        invitationId="inv-1"
        currentRevision={1}
        history={[round({ status: "changes_requested", feedbackItems: [{ id: "item-9", category: null, sectionId: null, message: "Fix this.", createdAt: "t", resolvedAt: null, displayName: null }] })]}
      />
    );
    expect(screen.getByText(/^resolve$/i).className).toContain("focus-ring");
  });
});
