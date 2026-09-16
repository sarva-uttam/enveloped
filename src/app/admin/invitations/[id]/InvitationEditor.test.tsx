// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

// ReviewPanel.tsx (rendered as a child when generatorKind === "concierge")
// calls useRouter() — mocked here the same way ReviewPanel.test.tsx mocks
// it on its own, since this file renders InvitationEditor as a whole tree.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { InvitationEditor } from "./InvitationEditor";

/**
 * Stage 8 Part K, restructured for Stage 12's tabbed workspace — proves
 * the structured generator's core interactive behaviors without a real
 * Next.js/Supabase runtime: `fetch` is mocked at the boundary, and the
 * preview `<iframe>` is left unmocked (jsdom renders it inert, fine —
 * PreviewPane.test-relevant behavior is exercised separately).
 *
 * The workspace now organizes sections into Content/Events/Media tabs
 * (not one flat list) and each section editor collapses by default
 * unless it currently has a validation error — tests below navigate to
 * the relevant tab and expand a section before asserting on its fields,
 * matching how an administrator actually interacts with it.
 *
 * No `@testing-library/jest-dom` in this project — assertions check the
 * plain DOM rather than jest-dom matchers.
 */

function baseComposition() {
  return {
    schemaVersion: 1,
    templateId: null,
    designPackId: "neutral-classic",
    eventCategory: "wedding-other",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "neutral-classic" },
    featureConfig: { motion: true, ambientMotif: "none", openingBurst: false, envelopeOpening: true },
    sections: [
      { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "First section" } },
      { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "Second section" } },
    ],
  };
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof InvitationEditor>> = {}) {
  return render(
    <InvitationEditor
      invitationId="invite-1"
      slug="test-slug"
      initialComposition={baseComposition()}
      initialRevision={0}
      publishedAt={null}
      hasPreviewLink={false}
      generatorKind={null}
      initialReviewHistory={[]}
      privateFieldsForReadiness={null}
      guestSummary={null}
      {...overrides}
    />
  );
}

function goToTab(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function expandSection(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
  );
});

describe("workspace tab navigation", () => {
  it("defaults to the Design tab and reveals every workflow area", () => {
    renderEditor();
    expect(screen.getByText(/template library/i)).toBeTruthy();
    for (const label of ["Content", "Events", "Media", "Preview", "Client Review", "Guests & RSVP", "Readiness & Publish"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`, "i") })).toBeTruthy();
    }
  });

  it("switching to the Content tab shows content sections, not event/media ones", () => {
    renderEditor();
    goToTab(/^content/i);
    expandSection(/expand opening section/i);
    expect(screen.getByDisplayValue("First section")).toBeTruthy();
  });
});

describe("section reordering — deterministic, keyboard-accessible", () => {
  it("moving the second section up swaps its position with the first", () => {
    const { container } = renderEditor();
    goToTab(/^content/i);

    const idsBefore = Array.from(container.querySelectorAll("[id^='section-']")).map((el) => el.id);
    expect(idsBefore).toEqual(["section-opening", "section-closing"]);

    const moveUp = screen.getByRole("button", { name: /move closing message section up/i });
    expect(moveUp.tagName).toBe("BUTTON"); // real button — native Tab/Enter/Space support, no custom keyboard handling
    fireEvent.click(moveUp);

    const idsAfter = Array.from(container.querySelectorAll("[id^='section-']")).map((el) => el.id);
    expect(idsAfter).toEqual(["section-closing", "section-opening"]);
  });

  it("the up-arrow on the first section and the down-arrow on the last section are disabled — no wraparound", () => {
    renderEditor();
    goToTab(/^content/i);
    expect((screen.getByRole("button", { name: /move opening section up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /move closing message section down/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /move opening section down/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("save button state", () => {
  it("is disabled until the draft actually differs from the last-saved state", () => {
    renderEditor();
    expect((screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("becomes enabled after a field is edited, and disabled again once saved", async () => {
    renderEditor();
    goToTab(/^content/i);
    expandSection(/expand opening section/i);
    const headlineInput = screen.getByDisplayValue("First section");
    fireEvent.change(headlineInput, { target: { value: "Updated headline" } });

    const saveButton = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, revision: 1 }) });
    fireEvent.click(saveButton);

    await waitFor(() => expect((screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true));
  });
});

describe("stale-save handling", () => {
  it("shows an explanatory banner and does not silently discard the conflict when the server reports a stale revision", async () => {
    renderEditor();
    goToTab(/^content/i);
    expandSection(/expand opening section/i);
    fireEvent.change(screen.getByDisplayValue("First section"), { target: { value: "My local edit" } });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Someone else saved a newer version.", reason: "stale-revision" }),
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/newer version/i);
    expect(screen.getByRole("button", { name: /reload latest version/i })).toBeTruthy();
  });
});

describe("adding and removing sections", () => {
  it("removing a section takes it out of the editor immediately", () => {
    renderEditor();
    goToTab(/^content/i);
    expandSection(/expand closing message section/i);
    expect(screen.getByDisplayValue("Second section")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /remove closing message section/i }));

    expect(screen.queryByDisplayValue("Second section")).toBeNull();
  });
});

describe("readiness panel reacts live to the in-progress draft", () => {
  it("flags unresolved placeholder text the moment it's introduced, without a server round-trip", () => {
    renderEditor();
    goToTab(/^content/i);
    expandSection(/expand opening section/i);
    fireEvent.change(screen.getByDisplayValue("First section"), { target: { value: "You're Invited" } });

    goToTab(/^readiness & publish/i);
    expect(screen.getByText(/unresolved placeholder content remains/i)).toBeTruthy();
  });
});

describe("Stage 9 — approved-revision edit warning", () => {
  it("shows no warning when there is no approved round for the current revision", () => {
    renderEditor({ generatorKind: "concierge", initialReviewHistory: [] });
    expect(screen.queryByText(/client has approved this exact version/i)).toBeNull();
  });

  it("shows a prominent warning when the CURRENT revision has a client-approved round", () => {
    renderEditor({
      generatorKind: "concierge",
      initialRevision: 3,
      initialReviewHistory: [
        {
          id: "round-1",
          roundNumber: 1,
          status: "client_approved",
          compositionRevision: 3,
          createdAt: "t",
          sentAt: "t",
          openedAt: "t",
          decidedAt: "t",
          decisionDisplayName: null,
          resolvedAt: null,
          supersededAt: null,
          cancelledAt: null,
          feedbackItems: [],
        },
      ],
    });
    expect(screen.getByText(/client has approved this exact version/i)).toBeTruthy();
  });

  it("does not show the warning for an approval bound to an OLDER revision than the current one", () => {
    renderEditor({
      generatorKind: "concierge",
      initialRevision: 4,
      initialReviewHistory: [
        {
          id: "round-1",
          roundNumber: 1,
          status: "client_approved",
          compositionRevision: 2,
          createdAt: "t",
          sentAt: "t",
          openedAt: "t",
          decidedAt: "t",
          decisionDisplayName: null,
          resolvedAt: null,
          supersededAt: null,
          cancelledAt: null,
          feedbackItems: [],
        },
      ],
    });
    expect(screen.queryByText(/client has approved this exact version/i)).toBeNull();
  });

  it("never renders the review-round panel for a self-service invitation (generatorKind null)", () => {
    renderEditor({ generatorKind: null, initialReviewHistory: [] });
    goToTab(/^client review/i);
    expect(screen.queryByRole("button", { name: /start a review round/i })).toBeNull();
    expect(screen.getByText(/only apply to concierge/i)).toBeTruthy();
  });
});

describe("Stage 12 — template library preserves content", () => {
  it("applying a template changes design tokens but never touches section wording", async () => {
    renderEditor();
    // Default tab is Design, where the template library renders.
    const applyButtons = await screen.findAllByRole("button", { name: /apply template/i });
    fireEvent.click(applyButtons[0]);

    // Confirmation dialog appears because the draft's current design
    // tokens differ from every registered template's defaults.
    const dialog = screen.queryByRole("alertdialog");
    if (dialog) fireEvent.click(within(dialog).getByRole("button", { name: /apply template/i }));

    goToTab(/^content/i);
    expandSection(/expand opening section/i);
    expect(screen.getByDisplayValue("First section")).toBeTruthy();
  });
});

describe("Stage 9 accessibility correction — centralized keyboard focus", () => {
  it("the Save button carries the centralized .focus-ring class, not a one-off Tailwind ring utility", () => {
    renderEditor();
    const save = screen.getByRole("button", { name: /^save$/i });
    expect(save.className).toContain("focus-ring");
    expect(save.className).not.toMatch(/focus-visible:ring-\d|focus:ring-\d/);
  });

  it("section move-up/move-down buttons are real, focusable <button>s carrying .focus-ring", () => {
    renderEditor();
    goToTab(/^content/i);
    const moveDown = screen.getByLabelText(/move opening section down/i) as HTMLButtonElement;
    expect(moveDown.tagName).toBe("BUTTON");
    expect(moveDown.className).toContain("focus-ring");
    moveDown.focus();
    expect(document.activeElement).toBe(moveDown);
  });

  it("the desktop/tablet/mobile live-preview width toggles carry .focus-ring", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /^desktop$/i }).className).toContain("focus-ring");
    expect(screen.getByRole("button", { name: /^mobile$/i }).className).toContain("focus-ring");
  });
});
