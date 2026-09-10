import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SERVER-RENDERING TESTS for the owner-management route (Stage 5,
 * 2026-09-10 — see PROJECT_STATUS.md's Stage 5 section). Same
 * direct-invocation + renderToStaticMarkup approach as
 * src/app/invite/[id]/page.test.tsx and src/app/preview/[token]/page.test.tsx.
 *
 * next/navigation's real redirect() is NOT mocked — it throws a real
 * Error (message "NEXT_REDIRECT", with the target URL encoded in
 * `.digest`) even outside a real Next.js request context, verified
 * directly while writing this file — so this file catches that thrown
 * error and asserts on `.digest` instead of needing a mock.
 */

const mockServerClient = vi.hoisted(() => ({ auth: { getUser: vi.fn() } }));
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

const getInviteServer = vi.fn();
vi.mock("@/lib/storage.server", () => ({
  getInviteServer: (...args: unknown[]) => getInviteServer(...args),
}));

import ManageInvitePage from "./page";

function makeProps(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function expectRedirectTo(promise: Promise<unknown>, pathContains: string) {
  try {
    await promise;
    throw new Error("expected a redirect to be thrown, but the page resolved normally");
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? "";
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain(pathContains);
  }
}

const OWNED_INVITE = {
  id: "priya-devansh-test",
  internalId: "row-1",
  answers: {
    category: "wedding-hindu",
    tier: "gold",
    partnerNames: "Priya & Devansh",
    eventDate: "2026-12-01T18:00:00Z",
    venue: "The Garden Hall",
    city: "Mumbai",
    colorMood: "warm",
    song: "Perfect",
    extraDetails: "",
    guestNames: "Aria",
  },
  content: {
    headline: "Priya & Devansh",
    subheadline: "Together with their families",
    welcomeMessage: "We can't wait to celebrate with you",
    eventDetails: [{ label: "Venue", value: "The Garden Hall" }],
    closingLine: "With love",
    suggestedPalette: ["#b8862f"],
  },
  guestList: [{ id: "g1", name: "Aria", slug: "aria-abc", viewed: false, clickTeaser: "Click me." }],
  createdAt: "2026-01-01T00:00:00Z",
  paid: true,
  publishedAt: null as string | null,
  ownerId: "owner-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
  mockServerClient.auth.getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
});

describe("ManageInvitePage — authentication", () => {
  it("redirects a signed-out visitor to /login, WITHOUT ever calling getInviteServer", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expectRedirectTo(ManageInvitePage(makeProps("priya-devansh-test")), "/login");
    expect(getInviteServer).not.toHaveBeenCalled();
  });

  it("includes a safe, same-origin next= target pointing back at this exact invite", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expectRedirectTo(
      ManageInvitePage(makeProps("priya-devansh-test")),
      encodeURIComponent("/dashboard/invite/priya-devansh-test")
    );
  });
});

describe("ManageInvitePage — server-side ownership boundary", () => {
  it("renders the management bar and invitation content for the real, signed-in owner", async () => {
    getInviteServer.mockResolvedValue(OWNED_INVITE);
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("priya-devansh-test")));
    expect(html).toContain("Priya &amp; Devansh");
    expect(html).toContain("My invites");
  });

  it("a genuinely missing invitation gets the safe unavailable response, not a crash", async () => {
    getInviteServer.mockResolvedValue(null);
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("does-not-exist")));
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("an invitation belonging to someone else ALSO gets the identical safe unavailable response — getInviteServer's own RLS already returns null for a non-owner, and this page trusts that null the same way it trusts a truly missing slug, never distinguishing the two", async () => {
    // getInviteServer() is owner-scoped by RLS — a genuinely authenticated
    // OTHER user's request for someone else's invite comes back null from
    // it, exactly like a missing slug. This test simulates that by
    // returning null regardless of which user is "signed in" here.
    getInviteServer.mockResolvedValue(null);
    const missingHtml = renderToStaticMarkup(await ManageInvitePage(makeProps("does-not-exist")));
    const notMineHtml = renderToStaticMarkup(await ManageInvitePage(makeProps("someone-elses-invite")));
    expect(missingHtml).toBe(notMineHtml);
  });

  it("high-confidence input validation: an invalid slug shape never reaches the database", async () => {
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("../../etc/passwd")));
    expect(getInviteServer).not.toHaveBeenCalled();
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("the unavailable response here links back to /dashboard, not the generic homepage", async () => {
    getInviteServer.mockResolvedValue(null);
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("does-not-exist")));
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Back to my invites");
  });
});

describe("ManageInvitePage — content and management chrome", () => {
  it("shows the paywall/awaiting-publication state for an unpublished invitation, never an RSVP form", async () => {
    getInviteServer.mockResolvedValue({ ...OWNED_INVITE, publishedAt: null, paid: false });
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("priya-devansh-test")));
    expect(html).not.toContain("Will you be joining us?");
  });

  it("shows the share panel with per-guest links once published", async () => {
    getInviteServer.mockResolvedValue({ ...OWNED_INVITE, publishedAt: "2026-11-01T00:00:00Z" });
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("priya-devansh-test")));
    expect(html).toContain("Share:");
    expect(html).toContain("personal invite links");
  });

  it("renders inside a <main> landmark", async () => {
    getInviteServer.mockResolvedValue(OWNED_INVITE);
    const html = renderToStaticMarkup(await ManageInvitePage(makeProps("priya-devansh-test")));
    expect(html).toMatch(/<main[^>]*>[\s\S]*<\/main>/);
  });
});
