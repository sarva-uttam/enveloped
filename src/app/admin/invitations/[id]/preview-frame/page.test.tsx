// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import PreviewFramePage from "./page";

afterEach(() => {
  cleanup();
});

/**
 * Stage 8 Part F/K — proves the live-preview target: uses the real
 * InvitationExperience/CompositionRenderer (not a second renderer),
 * receives its draft only via postMessage, and can NEVER render an RSVP
 * form regardless of what the draft composition contains — `canRsvp` is
 * hardcoded in this file's own render call, not something a posted
 * message can influence at all.
 */

function validComposition(overrides: Record<string, unknown> = {}) {
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
      { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Ananya & Rohan" } },
      { id: "rsvp", type: "rsvp", enabled: true, motionPreset: "fade", data: {} },
    ],
    ...overrides,
  };
}

function postToWindow(payload: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: payload, origin: window.location.origin }));
  });
}

describe("admin invitation preview frame", () => {
  it("shows a waiting state before any draft arrives", () => {
    render(<PreviewFramePage />);
    expect(screen.getByText(/waiting for the editor/i)).toBeTruthy();
  });

  it("renders the real invitation content once a valid draft is posted — the same trusted renderer, not a second one", async () => {
    render(<PreviewFramePage />);
    postToWindow({ type: "envelope-admin-preview", composition: validComposition(), forceReducedMotion: false });

    expect(await screen.findByText("Ananya & Rohan")).toBeTruthy();
  });

  it("never renders an RSVP form, even when the draft composition has an enabled rsvp section — canRsvp is hardcoded false here", async () => {
    render(<PreviewFramePage />);
    postToWindow({ type: "envelope-admin-preview", composition: validComposition(), forceReducedMotion: false });

    await screen.findByText("Ananya & Rohan");
    expect(screen.queryByRole("button", { name: /joyfully accept|regretfully decline/i })).toBeNull();
  });

  it("shows a distinct 'doesn't validate' message (not a crash) when the parent posts composition: null", async () => {
    render(<PreviewFramePage />);
    postToWindow({ type: "envelope-admin-preview", composition: null, forceReducedMotion: false });

    await waitFor(() => expect(screen.getByText(/doesn't currently pass validation/i)).toBeTruthy());
  });

  it("ignores a message from a different origin", async () => {
    render(<PreviewFramePage />);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "envelope-admin-preview", composition: validComposition() }, origin: "https://evil.example.com" }));
    });
    expect(screen.getByText(/waiting for the editor/i)).toBeTruthy();
  });

  it("ignores a message with an unrelated type", async () => {
    render(<PreviewFramePage />);
    postToWindow({ type: "something-else", composition: validComposition() });
    expect(screen.getByText(/waiting for the editor/i)).toBeTruthy();
  });
});
