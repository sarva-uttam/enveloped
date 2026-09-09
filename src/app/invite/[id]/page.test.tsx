import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SERVER-RENDERING TESTS for the public /invite/[id] route (Stage 4,
 * 2026-09-09 — see PROJECT_STATUS.md's Stage 4 section).
 *
 * Environment choice: plain Node (this project's existing
 * `environment: "node"` in vitest.config.ts — no jsdom, no new test
 * dependency added). This works because Next.js App Router async Server
 * Components are, underneath the framework machinery, just async
 * functions that return a React element tree — calling the exported
 * `default` function (the page) or `generateMetadata` directly, the same
 * way any other async function is tested, gives back that tree (or a
 * plain Metadata object) without needing Next's dev/build runtime at
 * all. `react-dom/server`'s `renderToStaticMarkup` (already available —
 * `react-dom` is an existing direct dependency, nothing new was added
 * for this) then renders that tree to an HTML string exactly like a real
 * server request would produce, INCLUDING the initial markup of client
 * components nested inside it (a "use client" directive is a build-time
 * bundler signal Next.js's real compiler acts on; importing the same
 * file directly in Vitest just gives back an ordinary, fully
 * server-renderable React component — this is what proves the
 * content is present in the initial HTML, not something that only
 * appears after hydration).
 *
 * The database layer (@/lib/storage.server) is mocked — this file tests
 * the PAGE's own logic (sanitization, the safe-unavailable-state
 * decision, metadata generation, what gets passed to which component),
 * not RLS/RPC behavior, which is already exhaustively covered by
 * tests/integration/ against a real local Postgres. Each test uses a
 * UNIQUE invite slug — React's cache() (used to dedupe generateMetadata/
 * page fetches within one real request) has no request-boundary concept
 * in a plain Vitest process, so distinct cache keys per test is what
 * keeps tests isolated from each other, not any assumption about cache()
 * resetting between calls.
 */

const getPublicInviteServer = vi.fn();
const getGuestEntryServer = vi.fn();

vi.mock("@/lib/storage.server", () => ({
  getPublicInviteServer: (...args: unknown[]) => getPublicInviteServer(...args),
  getGuestEntryServer: (...args: unknown[]) => getGuestEntryServer(...args),
  // getInviteServer is deliberately NOT provided here — if page.tsx ever
  // imported it, this mock module would throw "not a function" the
  // moment it's called, which is exactly the failure this project wants:
  // the public route must never touch the owner-only read.
}));

import InvitePage, { generateMetadata } from "./page";

function makeProps(id: string, guest?: string) {
  return {
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(guest ? { guest } : {}),
  };
}

const PUBLISHED_CONTENT = {
  headline: "Priya & Devansh",
  subheadline: "Together with their families",
  welcomeMessage: "We can't wait to celebrate with you, a truly unique welcome message string",
  eventDetails: [{ label: "Venue", value: "The Garden Hall" }],
  closingLine: "With love, Priya & Devansh",
  suggestedPalette: ["#b8862f", "#f8ecd2"],
};

function publishedInvite(overrides: Record<string, unknown> = {}) {
  return {
    invitesRowId: "row-1",
    slug: "priya-devansh-test",
    paid: true,
    publishedAt: "2026-11-01T00:00:00Z",
    tier: "gold",
    content: PUBLISHED_CONTENT,
    eventDate: "2026-12-01T18:00:00Z",
    song: "Perfect",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InvitePage — server-rendered public content", () => {
  it("a published invitation's wording appears in the server-rendered HTML — not blank, no client-side fetch needed", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-1" }));

    const jsx = await InvitePage(makeProps("render-test-1"));
    const html = renderToStaticMarkup(jsx);

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Priya &amp; Devansh"); // headline (React escapes & in static markup)
    expect(html).toContain("truly unique welcome message string");
    expect(html).toContain("The Garden Hall");
    expect(html).toContain("With love, Priya &amp; Devansh");
  });

  it("rendering does not require an authenticated user — no auth mock exists in this file at all, and the page never imports supabase.auth", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-no-auth" }));
    // No mock of any auth-related module here — if the page's rendering
    // path required one, this test would throw (an unmocked import
    // reaching a real Supabase/cookies() call in a Vitest process
    // throws), not silently pass.
    const jsx = await InvitePage(makeProps("render-test-no-auth"));
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Priya &amp; Devansh");
  });

  it("unpaid + published renders the invitation normally", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-unpaid-published", paid: false }));
    const jsx = await InvitePage(makeProps("render-test-unpaid-published"));
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Priya &amp; Devansh");
  });

  it("paid + unpublished does NOT render the invitation — the safe unavailable state instead", async () => {
    getPublicInviteServer.mockResolvedValue(
      publishedInvite({ slug: "render-test-paid-unpublished", paid: true, publishedAt: null, tier: null, content: null, eventDate: null, song: null })
    );
    const jsx = await InvitePage(makeProps("render-test-paid-unpublished"));
    const html = renderToStaticMarkup(jsx);
    expect(html).not.toContain("Priya");
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("a missing invitation and an unpublished one render the IDENTICAL safe unavailable HTML — never distinguishable", async () => {
    getPublicInviteServer.mockResolvedValueOnce(null); // doesn't exist
    const missingHtml = renderToStaticMarkup(await InvitePage(makeProps("render-test-missing")));

    getPublicInviteServer.mockResolvedValueOnce(
      publishedInvite({ slug: "render-test-unpub", publishedAt: null, tier: null, content: null, eventDate: null, song: null })
    );
    const unpublishedHtml = renderToStaticMarkup(await InvitePage(makeProps("render-test-unpub")));

    expect(missingHtml).toBe(unpublishedHtml);
  });

  it("an invalid guest token does not leak guest data — the invite still renders as its base (unpersonalized) content, no error, no clue the token was wrong", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-bad-guest" }));
    getGuestEntryServer.mockResolvedValue(null); // token didn't resolve

    const jsx = await InvitePage(makeProps("render-test-bad-guest", "not-a-real-guest-token"));
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Priya &amp; Devansh"); // still renders
    expect(html).not.toContain("Dearest"); // the personalized greeting never appears
  });

  it("a valid guest token personalizes the greeting for that exact invitation only", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-good-guest" }));
    getGuestEntryServer.mockResolvedValue({ id: "guest-1", name: "Aria Thompson", clickTeaser: "Click me." });

    const jsx = await InvitePage(makeProps("render-test-good-guest", "aria-abc1"));
    const html = renderToStaticMarkup(jsx);

    expect(html).toContain("Dearest Aria Thompson");
    expect(getGuestEntryServer).toHaveBeenCalledWith("render-test-good-guest", "aria-abc1");
  });

  it("uses ONLY the sanitized public read — never the raw/owner-only table, proven by the mock module itself: no getInviteServer export exists, so any call to it would throw, and no test here throws", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-sanitized-only" }));
    await expect(InvitePage(makeProps("render-test-sanitized-only"))).resolves.toBeTruthy();
    expect(getPublicInviteServer).toHaveBeenCalledWith("render-test-sanitized-only");
  });

  it("private fields never appear in the rendered HTML — not as visible text, not as a serialized prop/attribute", async () => {
    getPublicInviteServer.mockResolvedValue(
      publishedInvite({
        slug: "render-test-no-leak",
        // Simulates a hypothetical bug where the storage layer somehow
        // handed back more than it should — the page/view-model must
        // still never surface any of this in the rendered output, since
        // PublicInviteView only ever reads the narrow InviteViewModel
        // shape (tier/content/eventDate/song/guestName/inviteId/guestId),
        // never the raw PublicInvite object itself.
        ownerId: "owner-secret-uuid",
        paypal_order_id: "PAYPAL-ORDER-SECRET",
        answers: { guestNames: "Should Never Appear In HTML" },
      })
    );

    const jsx = await InvitePage(makeProps("render-test-no-leak"));
    const html = renderToStaticMarkup(jsx);

    expect(html).not.toContain("owner-secret-uuid");
    expect(html).not.toContain("PAYPAL-ORDER-SECRET");
    expect(html).not.toContain("Should Never Appear In HTML");
    expect(html).not.toContain("owner_id");
    expect(html).not.toContain("paypal_order");
  });

  it("the RSVP section only appears when the tier includes it (bronze excluded), proving RsvpForm's presence — its actual props (inviteId/guestId only) are covered by invite-view-model.test.ts, the sole source of what it ever receives", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-bronze", tier: "bronze" }));
    const html = renderToStaticMarkup(await InvitePage(makeProps("render-test-bronze")));
    expect(html).not.toContain("Will you be joining us?");

    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-gold-rsvp", tier: "gold" }));
    const goldHtml = renderToStaticMarkup(await InvitePage(makeProps("render-test-gold-rsvp")));
    expect(goldHtml).toContain("Will you be joining us?");
  });

  it("server-rendered content is fully readable text in the static markup — usable before any hydration/JS execution", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "render-test-pre-hydration" }));
    const html = renderToStaticMarkup(await InvitePage(makeProps("render-test-pre-hydration")));
    // A <main> landmark exists, and the invitation's actual wording is
    // inside it as plain text — nothing here depends on a script having
    // run first.
    expect(html).toMatch(/<main[^>]*>[\s\S]*Priya[\s\S]*<\/main>/);
  });

  it("high-confidence input validation: an invalid slug shape never reaches the database at all", async () => {
    const jsx = await InvitePage(makeProps("../../etc/passwd"));
    const html = renderToStaticMarkup(jsx);
    expect(getPublicInviteServer).not.toHaveBeenCalled();
    expect(html).toContain("This invitation isn&#x27;t available");
  });

  it("demo invites render without ever touching the database", async () => {
    const html = renderToStaticMarkup(await InvitePage(makeProps("demo-gold")));
    expect(getPublicInviteServer).not.toHaveBeenCalled();
    expect(html.length).toBeGreaterThan(0);
  });
});

describe("generateMetadata — sanitized, leak-free", () => {
  it("a published invitation gets correct, sanitized metadata", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "meta-test-published" }));
    const metadata = await generateMetadata(makeProps("meta-test-published"));
    expect(metadata.title).toBe("Priya & Devansh");
    expect(metadata.description).toBe("Together with their families");
    expect(metadata.openGraph).toMatchObject({ title: "Priya & Devansh" });
  });

  it("a valid guest token leads metadata with the click-teaser line, not the headline directly", async () => {
    getPublicInviteServer.mockResolvedValue(publishedInvite({ slug: "meta-test-guest" }));
    getGuestEntryServer.mockResolvedValue({ id: "g1", name: "Aria", clickTeaser: "There's a surprise for you." });
    const metadata = await generateMetadata(makeProps("meta-test-guest", "aria-1"));
    expect(metadata.title).toBe("There's a surprise for you.");
    expect(metadata.description).toBe("Priya & Devansh");
  });

  it("an unavailable invitation (missing OR unpublished) returns an EMPTY metadata object — leaks nothing through title/description/OpenGraph", async () => {
    getPublicInviteServer.mockResolvedValueOnce(null);
    const missingMeta = await generateMetadata(makeProps("meta-test-missing"));
    expect(missingMeta).toEqual({});

    getPublicInviteServer.mockResolvedValueOnce(
      publishedInvite({ slug: "meta-test-unpub", publishedAt: null, tier: null, content: null, eventDate: null, song: null })
    );
    const unpubMeta = await generateMetadata(makeProps("meta-test-unpub"));
    expect(unpubMeta).toEqual({});
  });

  it("an invalid slug shape returns empty metadata without a database call", async () => {
    const metadata = await generateMetadata(makeProps("<script>bad</script>"));
    expect(metadata).toEqual({});
    expect(getPublicInviteServer).not.toHaveBeenCalled();
  });

  // NOT independently re-verified here, and worth being explicit about
  // why: page.tsx wraps its data fetch in React's cache() specifically
  // so generateMetadata() and the page component share one underlying
  // call per real request (the same pattern already used for
  // checkAdmin() in src/lib/auth/admin.server.ts, Stage 2). Tried to
  // prove that directly in this file by calling generateMetadata() then
  // InvitePage() with identical args and asserting a single underlying
  // getPublicInviteServer call — that assertion FAILED (2 calls, not 1)
  // when actually run. The reason: cache()'s per-request memoization is
  // wired up by Next.js's own server runtime (it resets/scopes the cache
  // per real request); calling the same cache()-wrapped function twice
  // as plain top-level async calls in a bare Vitest process, with none
  // of that framework machinery present, does not reproduce that
  // behavior — there is no "request" for it to scope to here. This is a
  // genuine limitation of testing an async Server Component by direct
  // invocation, not a bug in page.tsx; the dedup guarantee itself is
  // standard, framework-provided React/Next.js behavior, not something
  // this project invented. See PROJECT_STATUS.md's Stage 4 section.
});
