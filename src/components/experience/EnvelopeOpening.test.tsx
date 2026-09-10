// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnvelopeOpening } from "./EnvelopeOpening";

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part C/I).
 */

const CONTENT = <p data-testid="invitation-body">The real invitation content, always present.</p>;

function setReducedMotion(reduce: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? reduce : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeEach(() => {
  setReducedMotion(false);
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEnvelope(props: Partial<React.ComponentProps<typeof EnvelopeOpening>> = {}) {
  return render(
    <EnvelopeOpening active sessionKey="test-invite" accent="var(--gold)" eyebrow="You're invited" openingBurst={false} {...props}>
      {CONTENT}
    </EnvelopeOpening>
  );
}

describe("EnvelopeOpening — progressive enhancement", () => {
  it("server-rendered HTML contains the real content and NO overlay (overlay is client-only)", () => {
    const html = renderToStaticMarkup(
      <EnvelopeOpening active sessionKey="x" accent="var(--gold)" openingBurst={false}>
        {CONTENT}
      </EnvelopeOpening>
    );
    expect(html).toContain("The real invitation content, always present.");
    expect(html).not.toContain("data-envelope-overlay");
    expect(html).not.toContain("Open your invitation");
    // content wrapper is not inert in SSR
    expect(html).not.toMatch(/<div inert[=>]/);
  });

  it("renders content directly, with no overlay, when active is false", () => {
    renderEnvelope({ active: false });
    expect(screen.getByTestId("invitation-body")).toBeTruthy();
    expect(screen.queryByLabelText("Open your invitation")).toBeNull();
    expect(screen.queryByLabelText("Replay the opening animation")).toBeNull();
  });
});

describe("EnvelopeOpening — reduced motion", () => {
  it("a reduced-motion viewer never sees the overlay and never gets a replay control that could re-trigger it", async () => {
    setReducedMotion(true);
    renderEnvelope();
    await waitFor(() => expect(screen.queryByLabelText("Open your invitation")).toBeNull());
    expect(screen.getByTestId("invitation-body")).toBeTruthy();
    expect(screen.queryByLabelText("Replay the opening animation")).toBeNull();
  });
});

describe("EnvelopeOpening — opening interactions", () => {
  it("shows the overlay for a normal viewer, and the content underneath is marked inert while it's up", async () => {
    const { container } = renderEnvelope();
    const openButton = await screen.findByLabelText("Open your invitation");
    expect(openButton).toBeTruthy();
    const contentWrapper = container.querySelector("div[inert]");
    expect(contentWrapper, "content wrapper should be inert while overlay is up").not.toBeNull();
    // content is still in the DOM the whole time — never removed
    expect(screen.getByTestId("invitation-body")).toBeTruthy();
  });

  it("click activation completes the opening and removes the overlay", async () => {
    renderEnvelope();
    fireEvent.click(await screen.findByLabelText("Open your invitation"));
    await waitFor(() => expect(screen.queryByLabelText("Open your invitation")).toBeNull(), { timeout: 3000 });
    // content is no longer inert
    expect(document.querySelector("div[inert]")).toBeNull();
  });

  it("keyboard activation (Enter/Space on the button) also opens it — it's a real <button>", async () => {
    renderEnvelope();
    const openButton = await screen.findByLabelText("Open your invitation");
    expect(openButton.tagName).toBe("BUTTON");
    // a real <button> fires click on Enter/Space natively; fireEvent.click
    // is the standard way testing-library models that activation path.
    fireEvent.click(openButton);
    await waitFor(() => expect(screen.queryByLabelText("Open your invitation")).toBeNull(), { timeout: 3000 });
  });

  it("the Skip control immediately completes the opening", async () => {
    renderEnvelope();
    await screen.findByLabelText("Open your invitation");
    fireEvent.click(screen.getByRole("button", { name: /skip animation/i }));
    await waitFor(() => expect(screen.queryByLabelText("Open your invitation")).toBeNull());
    expect(screen.getByTestId("invitation-body")).toBeTruthy();
  });

  it("the overlay cannot permanently block content — once done, it is gone and content is interactive", async () => {
    renderEnvelope();
    await screen.findByLabelText("Open your invitation");
    fireEvent.click(screen.getByRole("button", { name: /skip animation/i }));
    await waitFor(() => expect(document.querySelector("[data-envelope-overlay]")).toBeNull());
    expect(document.querySelector("div[inert]")).toBeNull();
  });
});

describe("EnvelopeOpening — session replay rule", () => {
  it("does not show the overlay again on a fresh mount after it was opened this session, but DOES offer a Replay control", async () => {
    const first = renderEnvelope();
    await screen.findByLabelText("Open your invitation");
    fireEvent.click(screen.getByRole("button", { name: /skip animation/i }));
    await waitFor(() => expect(screen.queryByLabelText("Open your invitation")).toBeNull());
    first.unmount();

    // simulate a second page view in the same session
    renderEnvelope();
    await waitFor(() => expect(screen.getByLabelText("Replay the opening animation")).toBeTruthy());
    expect(screen.queryByLabelText("Open your invitation")).toBeNull();
    expect(screen.getByTestId("invitation-body")).toBeTruthy();
  });

  it("the Replay control brings the overlay back", async () => {
    // pre-mark this invite as opened
    sessionStorage.setItem("enveloped:envelope-opened:test-invite", "1");
    renderEnvelope();
    const replay = await screen.findByLabelText("Replay the opening animation");
    fireEvent.click(replay);
    await waitFor(() => expect(screen.getByLabelText("Open your invitation")).toBeTruthy());
  });
});
