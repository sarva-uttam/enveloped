import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

function makeQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.eq = vi.fn(chain);
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  return query;
}

const fromMock = vi.fn();
const rpcMock = vi.fn();
const mockClient = { from: (...args: unknown[]) => fromMock(...args), rpc: (...args: unknown[]) => rpcMock(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

import { createInvitationFromRequest, publishInvitation, unpublishInvitation, getAdminInvitationDetail } from "./invitation-admin.server";

const ADMIN = { user: { id: "admin-1" }, isAdmin: true };
const NON_ADMIN = { user: { id: "user-1" }, isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockClient);
});

describe("createInvitationFromRequest", () => {
  it("rejects a non-admin caller before touching the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await createInvitationFromRequest({ requestId: "r1", packId: "neutral-classic" });
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an unregistered pack id before touching the database", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    const result = await createInvitationFromRequest({ requestId: "r1", packId: "muslim-wedding" });
    expect(result).toEqual({ ok: false, reason: "invalid-pack" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reports request-not-found when the request doesn't exist", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    const result = await createInvitationFromRequest({ requestId: "missing", packId: "neutral-classic" });
    expect(result).toEqual({ ok: false, reason: "request-not-found" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("directs the caller to the existing invitation instead of creating a duplicate", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock
      .mockReturnValueOnce(makeQuery({ data: { id: "r1", name: "Priya", category: "wedding-other", tier_interest: null }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: "existing-invite-id" }, error: null }));

    const result = await createInvitationFromRequest({ requestId: "r1", packId: "neutral-classic" });

    expect(result).toEqual({ ok: false, reason: "already-exists", existingInvitationId: "existing-invite-id" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("creates a new invitation when the request exists and has none yet", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock
      .mockReturnValueOnce(makeQuery({ data: { id: "r1", name: "Priya & Sam", category: "wedding-other", tier_interest: "gold" }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null })) // no existing invite
      .mockReturnValueOnce(makeQuery({ data: null, error: null })); // slug uniqueness check
    rpcMock.mockResolvedValue({ data: "new-invite-id", error: null });

    const result = await createInvitationFromRequest({ requestId: "r1", packId: "neutral-classic" });

    expect(result).toEqual({ ok: true, invitationId: "new-invite-id" });
    expect(rpcMock).toHaveBeenCalledWith(
      "admin_create_invitation_from_request",
      expect.objectContaining({
        p_request_id: "r1",
        p_category: "wedding-other",
        p_tier: "gold",
        p_composition: expect.objectContaining({ designPackId: "neutral-classic" }),
      })
    );
  });
});

describe("publishInvitation / unpublishInvitation — thin, admin-gated wrappers", () => {
  it("publishInvitation rejects a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await publishInvitation("invite-1");
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("publishInvitation calls the existing publish_invite RPC", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: true, error: null });
    const result = await publishInvitation("invite-1");
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("publish_invite", { p_invite_id: "invite-1" });
  });

  it("unpublishInvitation calls the existing unpublish_invite RPC", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: true, error: null });
    const result = await unpublishInvitation("invite-1");
    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("unpublish_invite", { p_invite_id: "invite-1" });
  });

  it("reports not-found when the RPC finds no matching row", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpcMock.mockResolvedValue({ data: false, error: null });
    const result = await publishInvitation("missing");
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("getAdminInvitationDetail — narrow read model", () => {
  it("returns null for a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await getAdminInvitationDetail("invite-1");
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("never includes owner_id, paypal_order_id, or a preview hash in its return shape", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock
      .mockReturnValueOnce(
        makeQuery({
          data: {
            id: "invite-1",
            slug: "priya-sam",
            category: "wedding-other",
            tier: "gold",
            request_id: null,
            published_at: null,
            paid: false,
            composition: null,
            composition_revision: 0,
          },
          error: null,
        })
      )
      .mockReturnValueOnce(makeQuery({ data: null, error: null }));

    const result = await getAdminInvitationDetail("invite-1");

    expect(result).not.toBeNull();
    expect(Object.keys(result!)).not.toContain("ownerId");
    expect(Object.keys(result!)).not.toContain("tokenHash");
    expect(Object.keys(result!)).not.toContain("paypalOrderId");
    expect(result!.hasPreviewLink).toBe(false);
  });
});
