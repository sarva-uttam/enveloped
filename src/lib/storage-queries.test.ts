import { describe, it, expect, vi } from "vitest";
import { fetchInvite, fetchGuestEntry, fetchPublicInvite } from "./storage-queries";

// fetchInvite/fetchGuestEntry are the ONE shared implementation used by
// both storage.ts (browser client) and storage.server.ts (server client)
// — testing them here with a mocked client covers both call paths at
// once. These tests verify the app never does anything that WOULD leak
// data even if RLS were somehow bypassed (defense in depth) — the actual
// RLS enforcement itself is reviewed in supabase/migrations/
// 20260828000000_auth_ownership.sql and its accompanying policy-text
// regression test (rls-policy.test.ts), not exercised against a real
// Postgres here.

function makeClient(overrides: {
  invitesSelect?: unknown;
  guestsSelect?: unknown;
  rpc?: unknown;
}) {
  const client = {
    from: vi.fn((table: string) => {
      if (table === "invites") {
        const eq = vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: overrides.invitesSelect ?? null, error: null }),
        });
        return { select: vi.fn().mockReturnValue({ eq }) };
      }
      if (table === "invite_guests") {
        const eq = vi.fn().mockResolvedValue({ data: overrides.guestsSelect ?? [], error: null });
        return { select: vi.fn().mockReturnValue({ eq }) };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: overrides.rpc ?? null, error: null }),
    }),
  };
  return client;
}

// fetchInvite/fetchGuestEntry expect a real SupabaseClient; the mock above
// only implements the handful of methods each test exercises. Cast at
// each call site (not on makeClient's return type) so the mock object
// itself keeps its real, assertable type (client.from.mock.calls, etc.).
function asClient(client: ReturnType<typeof makeClient>) {
  return client as never;
}

describe("fetchInvite", () => {
  it("returns null when the row isn't visible to the caller (RLS-blocked or truly missing — indistinguishable, by design)", async () => {
    const client = makeClient({ invitesSelect: null });
    const result = await fetchInvite(asClient(client), "some-unpaid-invite");
    expect(result).toBeNull();
  });

  it("never returns a guest list that doesn't belong to the requested invite — the guest query is scoped by invite_id", async () => {
    const inviteRow = {
      id: "invite-row-uuid",
      slug: "priya-devansh",
      answers: {},
      content: {},
      created_at: "2026-01-01",
      paid: true,
      owner_id: "host-1",
    };
    const client = makeClient({
      invitesSelect: inviteRow,
      guestsSelect: [{ id: "g1", name: "Aria", slug: "aria-1", viewed_at: null, click_teaser: "Click me" }],
    });

    const result = await fetchInvite(asClient(client), "priya-devansh");

    expect(result?.guestList).toHaveLength(1);
    expect(result?.ownerId).toBe("host-1");
    // Confirm the invite_guests query was actually filtered by this
    // invite's row id, not fetched unscoped.
    const invitesFrom = client.from.mock.calls.find((c: unknown[]) => c[0] === "invite_guests");
    expect(invitesFrom).toBeTruthy();
  });

  it("maps an empty guest list (e.g. RLS hid it from a non-owner) to [] rather than throwing", async () => {
    const client = makeClient({
      invitesSelect: {
        id: "row-1",
        slug: "someones-invite",
        answers: {},
        content: {},
        created_at: "2026-01-01",
        paid: true,
        owner_id: "host-1",
      },
      guestsSelect: [],
    });

    const result = await fetchInvite(asClient(client), "someones-invite");
    expect(result?.guestList).toEqual([]);
  });
});

describe("fetchGuestEntry", () => {
  it("resolves through the resolve_invite_guest RPC — never a direct invite_guests table read", async () => {
    const client = makeClient({ rpc: { id: "g1", name: "Aria", click_teaser: "Click me" } });

    const result = await fetchGuestEntry(asClient(client), "priya-devansh", "aria-1");

    expect(result).toEqual({ id: "g1", name: "Aria", clickTeaser: "Click me" });
    expect(client.rpc).toHaveBeenCalledWith("resolve_invite_guest", {
      p_invite_slug: "priya-devansh",
      p_guest_slug: "aria-1",
    });
    // The whole point of the RPC: fetchGuestEntry must never touch
    // invite_guests directly (that's owner-only under RLS as of this
    // batch, and even if it weren't, a direct read risks returning more
    // than the one requested guest).
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns null for a slug that doesn't match any guest (RPC returns no row)", async () => {
    const client = makeClient({ rpc: null });
    const result = await fetchGuestEntry(asClient(client), "priya-devansh", "not-a-real-guest");
    expect(result).toBeNull();
  });
});

describe("fetchPublicInvite — the sanitized public/guest payload", () => {
  it("resolves through the get_published_invite RPC — never a direct invites table read", async () => {
    const client = makeClient({
      rpc: {
        id: "row-1",
        slug: "priya-devansh",
        paid: true,
        tier: "gold",
        content: { headline: "Priya & Devansh" },
        event_date: "2026-12-01T18:00:00Z",
        song: "Perfect — Ed Sheeran",
      },
    });

    const result = await fetchPublicInvite(asClient(client), "priya-devansh");

    expect(client.rpc).toHaveBeenCalledWith("get_published_invite", { p_slug: "priya-devansh" });
    expect(client.from).not.toHaveBeenCalled();
    expect(result).toEqual({
      invitesRowId: "row-1",
      slug: "priya-devansh",
      paid: true,
      tier: "gold",
      content: { headline: "Priya & Devansh" },
      eventDate: "2026-12-01T18:00:00Z",
      song: "Perfect — Ed Sheeran",
    });
  });

  it("the returned object structurally cannot carry guestNames, answers, owner_id, or paypal_order_id — those keys simply don't exist on PublicInvite", async () => {
    const client = makeClient({
      rpc: {
        id: "row-1",
        slug: "priya-devansh",
        paid: true,
        tier: "gold",
        content: { headline: "Priya & Devansh" },
        event_date: "2026-12-01T18:00:00Z",
        song: "Perfect — Ed Sheeran",
        // Simulates a hypothetical future bug where the SQL function is
        // edited to also return these — fetchPublicInvite must not pass
        // them through even if the RPC response somehow included them.
        answers: { guestNames: "Aria Thompson\nRohan Mehta", venue: "The Garden Hall" },
        owner_id: "host-1",
        paypal_order_id: "PAYPAL-ORDER-1",
      },
    });

    const result = await fetchPublicInvite(asClient(client), "priya-devansh");

    expect(result).not.toBeNull();
    const keys = Object.keys(result!);
    expect(keys).toEqual(["invitesRowId", "slug", "paid", "tier", "content", "eventDate", "song"]);
    expect(keys).not.toContain("answers");
    expect(keys).not.toContain("owner_id");
    expect(keys).not.toContain("ownerId");
    expect(keys).not.toContain("paypal_order_id");
    expect(JSON.stringify(result)).not.toContain("guestNames");
    expect(JSON.stringify(result)).not.toContain("Aria Thompson");
  });

  it("an unpublished invite resolves to paid:false with content/tier/eventDate/song all null — never partial content", async () => {
    const client = makeClient({
      rpc: { id: "row-1", slug: "unpaid-invite", paid: false, tier: null, content: null, event_date: null, song: null },
    });

    const result = await fetchPublicInvite(asClient(client), "unpaid-invite");

    expect(result).toEqual({
      invitesRowId: "row-1",
      slug: "unpaid-invite",
      paid: false,
      tier: null,
      content: null,
      eventDate: null,
      song: null,
    });
  });

  it("returns null for a slug that doesn't exist at all (RPC returns no row)", async () => {
    const client = makeClient({ rpc: null });
    const result = await fetchPublicInvite(asClient(client), "does-not-exist");
    expect(result).toBeNull();
  });
});
