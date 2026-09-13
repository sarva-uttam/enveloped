// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// ReviewPanel.tsx (rendered as a child when generatorKind === "concierge")
// calls useRouter() — mocked here the same way ReviewPanel.test.tsx mocks
// it on its own, since this file renders InvitationEditor as a whole tree.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { InvitationEditor } from "./InvitationEditor";

/**
 * Stage 8 Part K — proves the structured generator's core interactive
 * behaviors without a real Next.js/Supabase runtime: `fetch` is mocked
 * at the boundary (this component never imports a Supabase client
 * directly — every mutation goes through /api/admin/... routes), and
 * the preview `<iframe>` is left unmocked (jsdom renders it inert,
 * which is fine — these tests are about the FORM side of the editor).
 *
 * No `@testing-library/jest-dom` in this project (removed as unused in
 * Stage 7) — assertions below check the plain DOM (`.disabled`,
 * `.hasAttribute`, `.textContent`) rather than jest-dom matchers like
 * `toBeDisabled()`.
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
      {...overrides}
    />
  );
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

describe("section reordering — deterministic, keyboard-accessible", () => {
  it("moving the second section up swaps its position with the first", () => {
    const { container } = renderEditor();

    const idsBefore = Array.from(container.querySelectorAll("code")).map((el) => el.textContent);
    expect(idsBefore).toEqual(["opening", "closing"]);

    const moveUp = screen.getByRole("button", { name: /move closing section up/i });
    expect(moveUp.tagName).toBe("BUTTON"); // real button — native Tab/Enter/Space support, no custom keyboard handling
    fireEvent.click(moveUp);

    const idsAfter = Array.from(container.querySelectorAll("code")).map((el) => el.textContent);
    expect(idsAfter).toEqual(["closing", "opening"]);
  });

  it("the up-arrow on the first section and the down-arrow on the last section are disabled — no wraparound", () => {
    renderEditor();
    expect((screen.getByRole("button", { name: /move opening section up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /move closing section down/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /move opening section down/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("save button state", () => {
  it("is disabled until the draft actually differs from the last-saved state", () => {
    renderEditor();
    expect((screen.getByRole("button", { name: /save composition/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("becomes enabled after a field is edited, and disabled again once saved", async () => {
    renderEditor();
    const headlineInput = screen.getByDisplayValue("First section");
    fireEvent.change(headlineInput, { target: { value: "Updated headline" } });

    const saveButton = screen.getByRole("button", { name: /save composition/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, revision: 1 }) });
    fireEvent.click(saveButton);

    await waitFor(() => expect((screen.getByRole("button", { name: /save composition/i }) as HTMLButtonElement).disabled).toBe(true));
  });
});

describe("stale-save handling", () => {
  it("shows an explanatory banner and does not silently discard the conflict when the server reports a stale revision", async () => {
    renderEditor();
    fireEvent.change(screen.getByDisplayValue("First section"), { target: { value: "My local edit" } });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Someone else saved a newer version.", reason: "stale-revision" }),
    });
    fireEvent.click(screen.getByRole("button", { name: /save composition/i }));

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/newer version/i);
    expect(screen.getByRole("button", { name: /reload latest version/i })).toBeTruthy();
  });
});

describe("adding and removing sections", () => {
  it("removing a section takes it out of the editor immediately", () => {
    renderEditor();
    expect(screen.getByDisplayValue("Second section")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /remove closing section/i }));

    expect(screen.queryByDisplayValue("Second section")).toBeNull();
  });
});

describe("readiness panel reacts live to the in-progress draft", () => {
  it("flags unresolved placeholder text the moment it's introduced, without a server round-trip", () => {
    renderEditor();
    expect(screen.queryByText(/unresolved placeholder content remains/i)).toBeNull();

    fireEvent.change(screen.getByDisplayValue("First section"), { target: { value: "You're Invited" } });

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

  it("never shows the review panel or the warning for a self-service invitation (generatorKind null)", () => {
    renderEditor({ generatorKind: null, initialReviewHistory: [] });
    expect(screen.queryByText(/client review/i)).toBeNull();
    expect(screen.queryByText(/client has approved this exact version/i)).toBeNull();
  });
});

describe("Stage 9 accessibility correction — centralized keyboard focus", () => {
  it("the Save button carries the centralized .focus-ring class, not a one-off Tailwind ring utility", () => {
    renderEditor();
    const save = screen.getByText(/save composition/i);
    expect(save.className).toContain("focus-ring");
    expect(save.className).not.toMatch(/focus-visible:ring-\d|focus:ring-\d/);
  });

  it("section move-up/move-down buttons are real, focusable <button>s carrying .focus-ring", () => {
    renderEditor();
    const moveDown = screen.getByLabelText(/move opening section down/i) as HTMLButtonElement;
    expect(moveDown.tagName).toBe("BUTTON");
    expect(moveDown.className).toContain("focus-ring");
    moveDown.focus();
    expect(document.activeElement).toBe(moveDown);
  });

  it("the Desktop/Mobile live-preview toggle buttons carry .focus-ring", () => {
    renderEditor();
    expect(screen.getByText("Desktop").className).toContain("focus-ring");
    expect(screen.getByText("Mobile").className).toContain("focus-ring");
  });
});
