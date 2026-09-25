import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const rpc = vi.fn();
const fromChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
};
const from = vi.fn(function (...args: unknown[]) {
  void args;
  return fromChain;
});
const mockServerClient = { rpc: (...args: unknown[]) => rpc(...args), from: (...args: unknown[]) => from(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

const generateGuestToken = vi.fn();
const hashGuestToken = vi.fn();
vi.mock("@/lib/guest-tokens.server", () => ({
  generateGuestToken: (...args: unknown[]) => generateGuestToken(...args),
  hashGuestToken: (...args: unknown[]) => hashGuestToken(...args),
}));

import { createGuest, updateGuest, deleteGuest, createGuestLink, rotateGuestLink, revokeGuestLink, bulkImportGuests } from "./guest-admin.server";

const ADMIN = { user: { id: "admin-1" }, isAdmin: true };
const NON_ADMIN = { user: { id: "user-1" }, isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
  generateGuestToken.mockReturnValue("RAW-GUEST-TOKEN");
  hashGuestToken.mockReturnValue("hashed-guest-token");
  fromChain.select.mockReturnThis();
  fromChain.insert.mockReturnThis();
  fromChain.delete.mockReturnThis();
  fromChain.eq.mockReturnThis();
  fromChain.order.mockReturnThis();
});

describe("createGuest", () => {
  it("rejects a non-admin caller without touching the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await createGuest("invite-1", { name: "Jane" });
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an empty name before calling the database", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    const result = await createGuest("invite-1", { name: "   " });
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("generates a slug and passes it to admin_create_guest", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: "guest-1", error: null });

    const result = await createGuest("invite-1", { name: "Jane Doe", permittedAttendees: 2, allowPlusOne: true });

    expect(result).toEqual({ ok: true, guestId: "guest-1" });
    const call = rpc.mock.calls[0];
    expect(call[0]).toBe("admin_create_guest");
    const args = call[1] as Record<string, unknown>;
    expect(args.p_invite_id).toBe("invite-1");
    expect(args.p_name).toBe("Jane Doe");
    expect(args.p_slug).toMatch(/^jane-doe-[0-9a-f]{8}$/);
    expect(args.p_permitted_attendees).toBe(2);
    expect(args.p_allow_plus_one).toBe(true);
  });

  it("fails closed on a database error", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await createGuest("invite-1", { name: "Jane" });
    expect(result).toEqual({ ok: false, reason: "database-error" });
  });
});

describe("updateGuest", () => {
  it("rejects a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await updateGuest("guest-1", { name: "Jane" });
    expect(result).toEqual({ ok: false, reason: "not-admin" });
  });

  it("maps a false result to not-found", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: false, error: null });
    const result = await updateGuest("guest-1", { name: "Jane" });
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("succeeds on a true result", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });
    const result = await updateGuest("guest-1", { name: "Jane" });
    expect(result).toEqual({ ok: true });
  });
});

describe("deleteGuest", () => {
  it("maps an 'already responded' database error to not-eligible, not a generic failure", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "this guest has already responded — deactivate instead of deleting" } });
    const result = await deleteGuest("guest-1");
    expect(result).toEqual({ ok: false, reason: "not-eligible" });
  });

  it("maps an 'issued link' database error to not-eligible", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "this guest has an issued link — deactivate instead of deleting" } });
    const result = await deleteGuest("guest-1");
    expect(result).toEqual({ ok: false, reason: "not-eligible" });
  });

  it("succeeds for an eligible guest", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });
    const result = await deleteGuest("guest-1");
    expect(result).toEqual({ ok: true });
  });
});

describe("createGuestLink / rotateGuestLink / revokeGuestLink", () => {
  it("createGuestLink hashes the token before sending anything to the database, and returns the raw token exactly once", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });

    const result = await createGuestLink("guest-1");

    expect(rpc).toHaveBeenCalledWith("admin_create_guest_link", { p_guest_id: "guest-1", p_token_hash: "hashed-guest-token" });
    expect(result).toEqual({ ok: true, token: "RAW-GUEST-TOKEN" });
    const callArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.values(callArgs)).not.toContain("RAW-GUEST-TOKEN");
  });

  it("createGuestLink maps 'already exists' to already-exists", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "a link already exists for this guest — rotate it instead" } });
    const result = await createGuestLink("guest-1");
    expect(result).toEqual({ ok: false, reason: "already-exists" });
  });

  it("rotateGuestLink returns a fresh raw token on success", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });
    const result = await rotateGuestLink("guest-1");
    expect(result).toEqual({ ok: true, token: "RAW-GUEST-TOKEN" });
  });

  it("rotateGuestLink maps a false result to guest-not-found", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: false, error: null });
    const result = await rotateGuestLink("guest-1");
    expect(result).toEqual({ ok: false, reason: "guest-not-found" });
  });

  it("revokeGuestLink succeeds without ever generating or hashing a token", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });
    const result = await revokeGuestLink("guest-1");
    expect(result).toEqual({ ok: true });
    expect(generateGuestToken).not.toHaveBeenCalled();
    expect(hashGuestToken).not.toHaveBeenCalled();
  });

  it("rejects a non-admin caller for every link operation, without ever generating a token", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    expect(await createGuestLink("guest-1")).toEqual({ ok: false, reason: "not-admin" });
    expect(await rotateGuestLink("guest-1")).toEqual({ ok: false, reason: "not-admin" });
    expect(await revokeGuestLink("guest-1")).toEqual({ ok: false, reason: "not-admin" });
    expect(generateGuestToken).not.toHaveBeenCalled();
  });
});

describe("bulkImportGuests", () => {
  it("rejects a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await bulkImportGuests("invite-1", [{ name: "A" }], false);
    expect(result).toEqual({ ok: false, reason: "not-admin" });
  });

  it("rejects an empty or over-limit batch before calling the database", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    expect(await bulkImportGuests("invite-1", [], false)).toEqual({ ok: false, reason: "too-many-rows" });
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ name: `G${i}` }));
    expect(await bulkImportGuests("invite-1", tooMany, false)).toEqual({ ok: false, reason: "too-many-rows" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not generate links unless explicitly requested", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: { inserted: 1, results: [{ row: 1, status: "inserted", guestId: "guest-1" }] }, error: null });

    const result = await bulkImportGuests("invite-1", [{ name: "Jane" }], false);

    expect(result).toEqual({ ok: true, inserted: 1, results: [{ row: 1, status: "inserted", guestId: "guest-1" }], generatedLinks: {} });
    expect(rpc).toHaveBeenCalledTimes(1); // only the import call, no link RPC
  });

  it("generates a link for each newly inserted guest when explicitly requested", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValueOnce({ data: { inserted: 1, results: [{ row: 1, status: "inserted", guestId: "guest-1" }] }, error: null });
    rpc.mockResolvedValueOnce({ data: true, error: null }); // admin_create_guest_link

    const result = await bulkImportGuests("invite-1", [{ name: "Jane" }], true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generatedLinks).toEqual({ "guest-1": "RAW-GUEST-TOKEN" });
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
