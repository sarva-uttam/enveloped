import { describe, it, expect, vi, beforeEach } from "vitest";

// Confirms storage.server.ts's read functions go through the
// SESSION-AWARE SERVER client (src/lib/supabase/server.ts), never the
// browser client — that's the actual fix for the fragility flagged in
// the previous round (a Route Handler using the anon browser client,
// which silently drops the caller's session). vitest.setup.ts mocks the
// `server-only` package so this file can import storage.server.ts at all
// (see that file's comment for why it's otherwise import-time-fatal
// outside Next.js's build).

const mockServerClient = { marker: "server-client" };
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

const fetchInvite = vi.fn();
const fetchGuestEntry = vi.fn();

vi.mock("@/lib/storage-queries", () => ({
  fetchInvite: (...args: unknown[]) => fetchInvite(...args),
  fetchGuestEntry: (...args: unknown[]) => fetchGuestEntry(...args),
}));

const mockAdminClient = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: mockAdminClient,
  supabaseAdminConfigured: true,
}));

import { getInviteServer, getGuestEntryServer, markInvitePaid } from "./storage.server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getInviteServer / getGuestEntryServer", () => {
  it("fetches through the session-aware server client, not the browser one", async () => {
    createServerSupabaseClient.mockResolvedValue(mockServerClient);
    fetchInvite.mockResolvedValue({ id: "row" });

    await getInviteServer("some-slug");

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(fetchInvite).toHaveBeenCalledWith(mockServerClient, "some-slug");
  });

  it("getGuestEntryServer also uses the server client", async () => {
    createServerSupabaseClient.mockResolvedValue(mockServerClient);
    fetchGuestEntry.mockResolvedValue({ id: "g1", name: "Aria", clickTeaser: "Click me" });

    await getGuestEntryServer("invite-slug", "guest-slug");

    expect(fetchGuestEntry).toHaveBeenCalledWith(mockServerClient, "invite-slug", "guest-slug");
  });

  it("returns null (not a throw) when Supabase isn't configured server-side", async () => {
    createServerSupabaseClient.mockResolvedValue(null);

    const result = await getInviteServer("some-slug");

    expect(result).toBeNull();
    expect(fetchInvite).not.toHaveBeenCalled();
  });
});

describe("markInvitePaid", () => {
  it("uses the admin (service-role) client, scoped to the invitation's internal uuid (not the slug)", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mockAdminClient.from.mockReturnValue({ update });

    const ok = await markInvitePaid("11111111-1111-1111-1111-111111111111", "PAYPAL-ORDER-1");

    expect(ok).toBe(true);
    expect(mockAdminClient.from).toHaveBeenCalledWith("invites");
    expect(update).toHaveBeenCalledWith({ paid: true, paypal_order_id: "PAYPAL-ORDER-1" });
    // Keyed by the real primary key, so a capture can never accidentally
    // touch a different row that happens to share some other identifier.
    expect(eq).toHaveBeenCalledWith("id", "11111111-1111-1111-1111-111111111111");
  });
});
