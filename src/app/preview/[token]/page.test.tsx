import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SERVER-RENDERING TESTS for the private preview route (Stage 5,
 * 2026-09-10 — see PROJECT_STATUS.md's Stage 5 section). Same approach
 * as src/app/invite/[id]/page.test.tsx: call the exported async Server
 * Component / generateMetadata functions directly, render the returned
 * tree with react-dom/server's renderToStaticMarkup — no jsdom, no new
 * test dependency.
 */

const getInvitePreviewServer = vi.fn();

vi.mock("@/lib/storage.server", () => ({
  getInvitePreviewServer: (...args: unknown[]) => getInvitePreviewServer(...args),
  // getInviteServer/getPublicInviteServer/getGuestEntryServer are
  // deliberately NOT provided — a preview token is its own, independent
  // credential; if this route ever imported any of those, this mock
  // module would throw the moment it's called.
}));

import PreviewPage, { generateMetadata } from "./page";

function makeProps(token: string) {
  return { params: Promise.resolve({ token }) };
}

const CONTENT = {
  headline: "Priya & Devansh",
  subheadline: "Together with their families",
  welcomeMessage: "We can't wait to celebrate with you, a truly unique welcome message string",
  eventDetails: [{ label: "Venue", value: "The Garden Hall" }],
  closingLine: "With love, Priya & Devansh",
  suggestedPalette: ["#b8862f", "#f8ecd2"],
};

// A real-shaped token — matches PREVIEW_TOKEN_LENGTH (43 base64url
// characters) so format validation passes and the mocked fetch is
// actually reached; the exact characters are arbitrary.
const REAL_TOKEN = "a".repeat(43);

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
    invitesRowId: "row-1",
    slug: "priya-devansh-test",
    paid: false,
    publishedAt: null,
    tier: "gold",
    content: CONTENT,
    eventDate: "2026-12-01T18:00:00Z",
    song: "Perfect",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PreviewPage — server-rendered preview content", () => {
  it("an unpublished invitation's wording appears in the server-rendered HTML via a valid token", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow());

    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Priya &amp; Devansh");
    expect(html).toContain("The Garden Hall");
  });

  it("rendering does not require an authenticated user — no auth mock exists at all", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow());
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toContain("Priya &amp; Devansh");
  });

  it("shows a visible Preview indicator", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow());
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toContain("Preview");
  });

  it("indicates when the invitation has NOT been published yet", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow({ publishedAt: null }));
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toContain("has not been published yet");
  });

  it("indicates when the invitation IS already published — preview also works for published invitations", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow({ publishedAt: "2026-11-01T00:00:00Z" }));
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toContain("is live and publicly shareable");
  });

  it("never enables RSVP for an UNPUBLISHED preview, even on a tier that normally includes it", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow({ tier: "gold", publishedAt: null }));
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).not.toContain("Will you be joining us?");
  });

  it("DOES offer RSVP for a PUBLISHED invitation viewed via a preview token, on an RSVP-eligible tier", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow({ tier: "gold", publishedAt: "2026-11-01T00:00:00Z" }));
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toContain("Will you be joining us?");
  });

  it("never resolves guest personalization — no 'Dearest ...' greeting ever appears, there is no guest-token concept here", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow());
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).not.toContain("Dearest");
  });

  it("never exposes the raw token anywhere in the rendered HTML", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow());
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).not.toContain(REAL_TOKEN);
  });

  it("private fields never leak, even from a deliberately 'leaky' mocked row", async () => {
    getInvitePreviewServer.mockResolvedValue(
      previewRow({
        ownerId: "owner-secret-uuid",
        paypal_order_id: "PAYPAL-ORDER-SECRET",
        answers: { guestNames: "Should Never Appear In HTML" },
      })
    );
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).not.toContain("owner-secret-uuid");
    expect(html).not.toContain("PAYPAL-ORDER-SECRET");
    expect(html).not.toContain("Should Never Appear In HTML");
  });

  it("a malformed token (wrong length/alphabet) never reaches the database — returns the same unavailable state", async () => {
    const html = renderToStaticMarkup(await PreviewPage(makeProps("not-a-real-token")));
    expect(getInvitePreviewServer).not.toHaveBeenCalled();
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("a well-formed but non-matching token returns the same unavailable state as one the database rejects (rotated/revoked/invalid)", async () => {
    getInvitePreviewServer.mockResolvedValue(null);
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("a malformed-token response and a valid-but-rejected-token response are byte-identical — one safe unavailable response either way", async () => {
    const malformedHtml = renderToStaticMarkup(await PreviewPage(makeProps("short")));

    getInvitePreviewServer.mockResolvedValue(null);
    const rejectedHtml = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));

    expect(malformedHtml).toBe(rejectedHtml);
  });

  it("renders inside a <main> landmark", async () => {
    getInvitePreviewServer.mockResolvedValue(previewRow());
    const html = renderToStaticMarkup(await PreviewPage(makeProps(REAL_TOKEN)));
    expect(html).toMatch(/<main[^>]*>[\s\S]*Priya[\s\S]*<\/main>/);
  });
});

describe("generateMetadata — always generic, never touches the database", () => {
  it("returns generic title/description regardless of token validity", async () => {
    const metadata = generateMetadata();
    expect(metadata.title).toBe("Private preview — Enveloped");
    expect(metadata.description).not.toContain("Priya");
    expect(getInvitePreviewServer).not.toHaveBeenCalled();
  });

  it("sets noindex/nofollow", async () => {
    const metadata = generateMetadata();
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("sets a no-referrer policy", async () => {
    const metadata = generateMetadata();
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("never includes an openGraph block with invitation details", async () => {
    const metadata = generateMetadata();
    expect(metadata.openGraph).toBeUndefined();
  });
});
