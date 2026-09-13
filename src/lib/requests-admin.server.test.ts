import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking pattern as composition-admin.server.test.ts /
// preview-admin.server.test.ts: mock every I/O boundary.

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

// A tiny fluent builder standing in for the real Supabase query builder —
// each test configures `resolveWith` for whichever terminal call it
// expects (maybeSingle/order-as-thenable/etc).
function makeQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.eq = vi.fn(chain);
  query.in = vi.fn(chain);
  query.order = vi.fn(() => Promise.resolve(result));
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  query.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(result)) }));
  // Support `await query` directly (used after .select().eq() with no
  // terminal call in listRequests' second, batched invites lookup).
  query.then = ((onfulfilled?: (v: unknown) => unknown) => Promise.resolve(result).then(onfulfilled)) as unknown;
  return query;
}

const fromMock = vi.fn();
const mockClient = { from: (...args: unknown[]) => fromMock(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

import { listRequests, getRequestDetail, updateRequestStatus } from "./requests-admin.server";

const ADMIN = { user: { id: "admin-1" }, isAdmin: true };
const NON_ADMIN = { user: { id: "user-1" }, isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockClient);
});

describe("listRequests", () => {
  it("returns null for a non-admin caller without querying the database", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await listRequests();
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns [] (not null) when an admin has zero requests — 'no rows' and 'not authorized' are never confused", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock.mockReturnValue(makeQuery({ data: [], error: null }));
    const result = await listRequests();
    expect(result).toEqual([]);
  });

  it("falls back to 'new' if a corrupted status value somehow reaches the app layer, rather than crashing", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    const row = {
      id: "r1",
      reference_code: "REF-1",
      status: "some-unknown-status",
      name: "Test Client",
      email: null,
      phone: null,
      preferred_channel: "whatsapp",
      category: "wedding-other",
      event_date: null,
      tier_interest: null,
      requested_occasions: [],
      notes: null,
      internal_notes: null,
      agreed_price: null,
      agreed_currency: "USD",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      status_changed_at: "2026-01-01T00:00:00Z",
    };
    fromMock.mockReturnValueOnce(makeQuery({ data: [row], error: null })).mockReturnValueOnce(makeQuery({ data: [], error: null }));
    const result = await listRequests();
    expect(result).not.toBeNull();
    expect(result![0].status).toBe("new");
  });
});

describe("getRequestDetail", () => {
  it("returns null for a non-admin caller", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await getRequestDetail("r1");
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null for a missing request id", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock.mockReturnValue(makeQuery({ data: null, error: null }));
    const result = await getRequestDetail("does-not-exist");
    expect(result).toBeNull();
  });
});

describe("updateRequestStatus — client-side validation before touching the database", () => {
  it("rejects a non-admin caller before reading current status", async () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);
    const result = await updateRequestStatus("r1", "contacted");
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition WITHOUT ever calling update()", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    const readQuery = makeQuery({ data: { status: "new" }, error: null });
    fromMock.mockReturnValue(readQuery);

    const result = await updateRequestStatus("r1", "completed"); // new -> completed skips the whole pipeline

    expect(result).toEqual({ ok: false, reason: "invalid-transition" });
    expect(readQuery.update).not.toHaveBeenCalled();
  });

  it("allows a valid transition and calls update()", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    const updateEq = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const readQuery = makeQuery({ data: { status: "new" }, error: null });
    readQuery.update = vi.fn(() => ({ eq: updateEq }));
    fromMock.mockReturnValue(readQuery);

    const result = await updateRequestStatus("r1", "contacted");

    expect(result).toEqual({ ok: true });
    expect(readQuery.update).toHaveBeenCalledWith({ status: "contacted" });
  });

  it("returns not-found when the request doesn't exist", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    fromMock.mockReturnValue(makeQuery({ data: null, error: null }));
    const result = await updateRequestStatus("missing", "contacted");
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });
});
