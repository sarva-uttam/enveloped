import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking pattern as storage.server.test.ts: mock the session-aware
// server client factory so this file can exercise checkAdmin()'s
// orchestration without a real Next.js/Supabase runtime. vitest.setup.ts
// mocks the `server-only` package so admin.server.ts can be imported at
// all outside Next.js's build (same reason as every other .server.ts
// file's test in this repo).

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

import { checkAdmin, deriveAdminCheckResult } from "./admin.server";

const FAKE_USER = { id: "user-1", email: "owner@example.com" } as unknown as import("@supabase/supabase-js").User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deriveAdminCheckResult — the pure decision logic, isolated from any I/O", () => {
  it("no session at all: isAdmin false, user null — regardless of what the RPC would have said", () => {
    expect(deriveAdminCheckResult(null, { data: true, error: null })).toEqual({ user: null, isAdmin: false });
  });

  it("fails CLOSED on an RPC error, even for a real, signed-in user", () => {
    const result = deriveAdminCheckResult(FAKE_USER, { data: null, error: { message: "boom" } });
    expect(result).toEqual({ user: FAKE_USER, isAdmin: false });
  });

  it("isAdmin: true only when the RPC genuinely returned true", () => {
    expect(deriveAdminCheckResult(FAKE_USER, { data: true, error: null })).toEqual({ user: FAKE_USER, isAdmin: true });
  });

  it("isAdmin: false when the RPC returned false", () => {
    expect(deriveAdminCheckResult(FAKE_USER, { data: false, error: null })).toEqual({ user: FAKE_USER, isAdmin: false });
  });

  it("never trusts an unexpected, non-boolean RPC response shape as admin — Boolean(...) coercion, not a truthy default", () => {
    expect(deriveAdminCheckResult(FAKE_USER, { data: null, error: null }).isAdmin).toBe(false);
    expect(deriveAdminCheckResult(FAKE_USER, { data: undefined, error: null }).isAdmin).toBe(false);
    expect(deriveAdminCheckResult(FAKE_USER, { data: 0, error: null }).isAdmin).toBe(false);
    expect(deriveAdminCheckResult(FAKE_USER, { data: "", error: null }).isAdmin).toBe(false);
  });
});

describe("checkAdmin — orchestration against the session-aware server client", () => {
  it("returns { user: null, isAdmin: false } when Supabase isn't configured server-side (client factory returns null)", async () => {
    createServerSupabaseClient.mockResolvedValue(null);
    const result = await checkAdmin();
    expect(result).toEqual({ user: null, isAdmin: false });
  });

  it("returns { user: null, isAdmin: false } for a signed-out caller, and never calls the is_admin() RPC at all", async () => {
    const rpc = vi.fn();
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      rpc,
    });

    const result = await checkAdmin();
    expect(result).toEqual({ user: null, isAdmin: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls is_admin() (no arguments) for a signed-in caller and reports true on a genuine true response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: FAKE_USER } }) },
      rpc,
    });

    const result = await checkAdmin();
    expect(rpc).toHaveBeenCalledWith("is_admin");
    expect(result).toEqual({ user: FAKE_USER, isAdmin: true });
  });

  it("fails closed when the RPC call itself errors — does not throw, does not default to admin", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: FAKE_USER } }) },
      rpc,
    });

    const result = await checkAdmin();
    expect(result).toEqual({ user: FAKE_USER, isAdmin: false });
  });
});
