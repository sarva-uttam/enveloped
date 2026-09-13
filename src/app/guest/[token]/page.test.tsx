import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SERVER-RENDERING TESTS for the personalized guest route — Stage 10.
 * Same approach as src/app/preview/[token]/page.test.tsx: call the
 * exported async Server Component / generateMetadata directly, render
 * with react-dom/server's renderToStaticMarkup.
 */

const getGuestInviteServer = vi.fn();

vi.mock("@/lib/guest-client.server", () => ({
  getGuestInviteServer: (...args: unknown[]) => getGuestInviteServer(...args),
  // getInviteServer/getPublicInviteServer/getInvitePreviewServer/
  // checkAdmin are deliberately NOT provided — a guest link is its own,
  // independent credential; if this route ever imported any admin/owner/
  // preview module, this mock would throw the moment it's called.
}));

import GuestInvitePage, { generateMetadata } from "./page";
import { GUEST_TOKEN_LENGTH } from "@/lib/guest-tokens.server";

function makeProps(token: string) {
  return { params: Promise.resolve({ token }) };
}

const REAL_TOKEN = "a".repeat(GUEST_TOKEN_LENGTH);

const COMPOSITION = {
  schemaVersion: 1,
  templateId: null,
  designPackId: "neutral-classic",
  eventCategory: "wedding-other",
  weddingContext: null,
  locale: "en",
  dir: "ltr",
  themeTokens: { paletteId: "neutral-classic" },
  featureConfig: { motion: true, ambientMotif: "none", openingBurst: false },
  sections: [
    { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { headline: "Priya & Devansh" } },
    {
      id: "sched-1",
      type: "schedule",
      enabled: true,
      motionPreset: "fade",
      data: { entries: [{ id: "ceremony", eventTypeId: null, label: "Ceremony", value: "5pm" }] },
    },
  ],
};

function guestRow(overrides: Record<string, unknown> = {}) {
  return {
    inviteId: "i1",
    slug: "priya-devansh-test",
    tier: "gold",
    content: { headline: "Priya & Devansh" },
    composition: COMPOSITION,
    guestId: "g1",
    guestName: "Aisha",
    permittedAttendees: 2,
    allowPlusOne: true,
    rsvpStatus: "pending",
    attendeeCount: 0,
    plusOneName: null,
    dietaryNotes: null,
    eventAttendance: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GuestInvitePage — server-rendered guest content", () => {
  it("a valid guest token renders the invitation content and a personalized greeting", async () => {
    getGuestInviteServer.mockResolvedValue(guestRow());
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).toContain("Priya &amp; Devansh");
    expect(html).toContain("Aisha");
  });

  it("never exposes the raw token anywhere in the rendered HTML", async () => {
    getGuestInviteServer.mockResolvedValue(guestRow());
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).not.toContain(REAL_TOKEN);
  });

  it("a malformed token never reaches the database — returns the same unavailable state", async () => {
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps("not-a-real-token")));
    expect(getGuestInviteServer).not.toHaveBeenCalled();
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("a well-formed but non-matching token (invalid/revoked/deactivated/unpublished — all collapsed identically by get_guest_invite()) returns the same unavailable state", async () => {
    getGuestInviteServer.mockResolvedValue(null);
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("a malformed-token response and a valid-but-rejected-token response are byte-identical", async () => {
    const malformedHtml = renderToStaticMarkup(await GuestInvitePage(makeProps("short")));
    getGuestInviteServer.mockResolvedValue(null);
    const rejectedHtml = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(malformedHtml).toBe(rejectedHtml);
  });

  it("never renders owner/admin/payment/request wording", async () => {
    getGuestInviteServer.mockResolvedValue(guestRow());
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).not.toContain("owner");
    expect(html).not.toContain("PayPal");
    expect(html).not.toContain("Administrator");
  });

  it("offers the RSVP panel with the guest's own name", async () => {
    getGuestInviteServer.mockResolvedValue(guestRow());
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).toContain("Will you be joining us, Aisha?");
  });

  it("renders inside a <main> landmark", async () => {
    getGuestInviteServer.mockResolvedValue(guestRow());
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).toMatch(/<main[^>]*>[\s\S]*Priya[\s\S]*<\/main>/);
  });

  it("shows an already-attending confirmation, not the input form, when rsvp_status is already set", async () => {
    getGuestInviteServer.mockResolvedValue(guestRow({ rsvpStatus: "attending", attendeeCount: 2 }));
    const html = renderToStaticMarkup(await GuestInvitePage(makeProps(REAL_TOKEN)));
    expect(html).toContain("we can&#x27;t wait to celebrate with you");
    expect(html).not.toContain("Joyfully accept");
  });
});

describe("generateMetadata — always generic, never touches the database", () => {
  it("returns generic title/description regardless of token validity", () => {
    const metadata = generateMetadata();
    expect(metadata.title).toBe("You're invited — Enveloped");
    expect(metadata.description).not.toContain("Priya");
    expect(getGuestInviteServer).not.toHaveBeenCalled();
  });

  it("sets noindex/nofollow and no-referrer", () => {
    const metadata = generateMetadata();
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("never includes an openGraph block with invitation details", () => {
    const metadata = generateMetadata();
    expect(metadata.openGraph).toBeUndefined();
  });
});
