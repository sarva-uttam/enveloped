import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests exercise the APPLICATION layer's own auth/ownership
// enforcement (what runs before a request even reaches Postgres) using a
// mocked Supabase client — they intentionally do NOT stand up a real
// database, so they don't exercise the RLS policies in
// supabase/migrations/20260828000000_auth_ownership.sql themselves. That
// migration is reviewed by eye and by a human running it against a real
// (or local) Postgres — see PROJECT_STATUS.md for that caveat. What these
// tests DO verify: the app never even attempts a write while
// unauthenticated, and queries the database with an explicit
// owner_id/slug filter rather than fetching everything and filtering
// client-side (which would leak data over the wire even if the UI hid it).

const mockClient = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: mockClient,
  supabaseConfigured: true,
}));

import { saveInvite, getMyInvites, deleteOwnInvite, submitRsvp, NotAuthenticatedError } from "./storage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveInvite", () => {
  const invite = {
    id: "priya-devansh-abc123",
    answers: { category: "wedding-hindu", tier: "gold" } as never,
    content: { headline: "h" } as never,
    guestList: [],
    createdAt: new Date().toISOString(),
    paid: false,
  };

  it("throws NotAuthenticatedError and never touches the database when there's no session", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(saveInvite(invite)).rejects.toBeInstanceOf(NotAuthenticatedError);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("inserts without sending owner_id — the database default (auth.uid()) decides it, not the client", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: "host-1" } } });

    const single = vi.fn().mockResolvedValue({ data: { id: "row-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mockClient.from.mockReturnValue({ insert });

    await saveInvite(invite);

    expect(insert).toHaveBeenCalledTimes(1);
    const insertedRow = insert.mock.calls[0][0];
    expect(insertedRow).not.toHaveProperty("owner_id");
  });
});

describe("getMyInvites", () => {
  it("returns [] without querying invites when there's no session", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await getMyInvites();

    expect(result).toEqual([]);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("filters explicitly by the signed-in user's owner_id — never fetches all invites", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: "host-1" } } });

    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockClient.from.mockReturnValue({ select });

    await getMyInvites();

    expect(mockClient.from).toHaveBeenCalledWith("invites");
    expect(eq).toHaveBeenCalledWith("owner_id", "host-1");
  });
});

describe("submitRsvp", () => {
  // submitRsvp used to look up the invite via a direct `invites.select`
  // read — that broke once `invites` became owner-only (a guest, with no
  // session, would get nothing back). It now resolves the invite through
  // fetchPublicInvite() (the same sanitized RPC path guests use to view
  // an invite at all), which also means RSVPs against an unpublished
  // invite are now refused outright, not just hidden by the UI.

  it("refuses to submit against an unpublished invite, even if the client sends a guestId", async () => {
    mockClient.rpc.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "row-1", slug: "unpaid-invite", paid: false, tier: null, content: null, event_date: null, song: null },
        error: null,
      }),
    });

    const ok = await submitRsvp("unpaid-invite", "guest-1", "Aria", "yes");

    expect(ok).toBe(false);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("on a published invite, inserts scoped to the invite id resolved from the sanitized RPC, not a raw table read", async () => {
    mockClient.rpc.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "row-1",
          slug: "priya-devansh",
          paid: true,
          tier: "gold",
          content: { headline: "h" },
          event_date: null,
          song: null,
        },
        error: null,
      }),
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockClient.from.mockReturnValue({ insert });

    const ok = await submitRsvp("priya-devansh", "guest-1", "Aria", "yes");

    expect(ok).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith("get_published_invite", { p_slug: "priya-devansh" });
    expect(mockClient.from).toHaveBeenCalledWith("invite_rsvps");
    expect(insert).toHaveBeenCalledWith({
      invite_id: "row-1",
      guest_id: "guest-1",
      name: "Aria",
      status: "yes",
    });
  });
});

describe("deleteOwnInvite", () => {
  it("scopes the delete to the given slug (RLS is the real backstop against cross-user deletes)", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    mockClient.from.mockReturnValue({ delete: del });

    const ok = await deleteOwnInvite("someone-elses-invite");

    expect(ok).toBe(true);
    expect(eq).toHaveBeenCalledWith("slug", "someone-elses-invite");
  });
});
