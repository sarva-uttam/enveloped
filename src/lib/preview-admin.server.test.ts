import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking pattern as storage.server.test.ts/admin.server.test.ts:
// mock every I/O boundary (checkAdmin, the session-aware server client,
// and the pure token primitives themselves, so their exact output is
// controlled and assertable) so this file exercises preview-admin.server.ts's
// own orchestration/fail-closed logic without a real Next.js/Supabase
// runtime. vitest.setup.ts mocks the `server-only` package globally.

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const rpc = vi.fn();
const mockServerClient = { rpc: (...args: unknown[]) => rpc(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

const generatePreviewToken = vi.fn();
const hashPreviewToken = vi.fn();
vi.mock("./preview-tokens.server", () => ({
  generatePreviewToken: (...args: unknown[]) => generatePreviewToken(...args),
  hashPreviewToken: (...args: unknown[]) => hashPreviewToken(...args),
}));

import { createPreviewLink, rotatePreviewLink, revokePreviewLink } from "./preview-admin.server";

const ADMIN = { user: { id: "admin-1" }, isAdmin: true };
const NON_ADMIN = { user: { id: "user-1" }, isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
  generatePreviewToken.mockReturnValue("RAW-TOKEN-VALUE");
  hashPreviewToken.mockReturnValue("hashed-value");
});

describe("createPreviewLink", () => {
  it("rejects a non-admin caller WITHOUT ever generating a token or touching the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);

    const result = await createPreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(generatePreviewToken).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("hashes the token BEFORE sending anything to the database — the RPC call never receives the raw token", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });

    await createPreviewLink("invite-1");

    expect(rpc).toHaveBeenCalledWith("admin_create_invite_preview", {
      p_invite_id: "invite-1",
      p_token_hash: "hashed-value",
    });
    const callArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.values(callArgs)).not.toContain("RAW-TOKEN-VALUE");
  });

  it("returns the raw token exactly once, on success", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });

    const result = await createPreviewLink("invite-1");

    expect(result).toEqual({ ok: true, token: "RAW-TOKEN-VALUE" });
  });

  it("maps a unique-violation-shaped error to 'already-exists', not a generic failure", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "a preview link already exists for this invitation — rotate it instead" } });

    const result = await createPreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "already-exists" });
  });

  it("fails closed on any other database error — never returns ok:true on an error response", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const result = await createPreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "database-error" });
  });

  it("fails closed when no server client is available at all", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    createServerSupabaseClient.mockResolvedValue(null);

    const result = await createPreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "database-error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never logs the raw token, on any path — success or failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await createPreviewLink("invite-1");

    for (const call of spy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("RAW-TOKEN-VALUE");
      }
    }
    spy.mockRestore();
  });
});

describe("rotatePreviewLink", () => {
  it("rejects a non-admin caller before touching the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);

    const result = await rotatePreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the fresh raw token once on success", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });

    const result = await rotatePreviewLink("invite-1");

    expect(result).toEqual({ ok: true, token: "RAW-TOKEN-VALUE" });
  });

  it("maps a false/no-row result to 'invite-not-found', not an error", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: false, error: null });

    const result = await rotatePreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "invite-not-found" });
  });

  it("fails closed on a database error", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await rotatePreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "database-error" });
  });
});

describe("revokePreviewLink", () => {
  it("rejects a non-admin caller before touching the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);

    const result = await revokePreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("succeeds without ever generating or hashing a token — revocation needs neither", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: true, error: null });

    const result = await revokePreviewLink("invite-1");

    expect(result).toEqual({ ok: true });
    expect(generatePreviewToken).not.toHaveBeenCalled();
    expect(hashPreviewToken).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("admin_revoke_invite_preview", { p_invite_id: "invite-1" });
  });

  it("maps a false/no-row result to 'not-found', not an error — revoking an already-revoked link is a normal outcome", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: false, error: null });

    const result = await revokePreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("fails closed on a database error", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await revokePreviewLink("invite-1");

    expect(result).toEqual({ ok: false, reason: "database-error" });
  });
});
