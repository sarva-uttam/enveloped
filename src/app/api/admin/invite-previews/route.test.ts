import { describe, it, expect, vi, beforeEach } from "vitest";

const checkAdmin = vi.fn();
vi.mock("@/lib/auth/admin.server", () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}));

const createPreviewLink = vi.fn();
const rotatePreviewLink = vi.fn();
const revokePreviewLink = vi.fn();
vi.mock("@/lib/preview-admin.server", () => ({
  createPreviewLink: (...args: unknown[]) => createPreviewLink(...args),
  rotatePreviewLink: (...args: unknown[]) => rotatePreviewLink(...args),
  revokePreviewLink: (...args: unknown[]) => revokePreviewLink(...args),
}));

import { POST } from "./route";

// A real, RFC-4122-shaped UUID (variant nibble in {8,9,a,b}, which
// zod's .uuid() validator requires) — "1111...1111" throughout is
// rejected by that validator despite looking plausible at a glance.
const VALID_ID = "11111111-1111-1111-8111-111111111111";

function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkAdmin.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true });
});

describe("POST /api/admin/invite-previews — authorization", () => {
  it("403s a non-admin caller BEFORE parsing the body or calling any preview-admin function", async () => {
    checkAdmin.mockResolvedValue({ user: { id: "user-1" }, isAdmin: false });

    const res = await POST(req({ inviteId: VALID_ID, action: "create" }));

    expect(res.status).toBe(403);
    expect(createPreviewLink).not.toHaveBeenCalled();
  });

  it("403s a signed-out caller the same way", async () => {
    checkAdmin.mockResolvedValue({ user: null, isAdmin: false });

    const res = await POST(req({ inviteId: VALID_ID, action: "create" }));

    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/invite-previews — validation", () => {
  it("400s a malformed body (not a uuid)", async () => {
    const res = await POST(req({ inviteId: "not-a-uuid", action: "create" }));
    expect(res.status).toBe(400);
    expect(createPreviewLink).not.toHaveBeenCalled();
  });

  it("400s an invalid action", async () => {
    const res = await POST(req({ inviteId: VALID_ID, action: "delete" }));
    expect(res.status).toBe(400);
  });

  it("400s unparseable JSON", async () => {
    const badReq = { json: async () => { throw new Error("bad json"); } } as unknown as Request;
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/invite-previews — create/rotate", () => {
  it("returns the raw token in the response body on a successful create", async () => {
    createPreviewLink.mockResolvedValue({ ok: true, token: "RAW-TOKEN" });

    const res = await POST(req({ inviteId: VALID_ID, action: "create" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ token: "RAW-TOKEN" });
    expect(createPreviewLink).toHaveBeenCalledWith(VALID_ID);
  });

  it("returns 409 with a clear message when a link already exists", async () => {
    createPreviewLink.mockResolvedValue({ ok: false, reason: "already-exists" });

    const res = await POST(req({ inviteId: VALID_ID, action: "create" }));

    expect(res.status).toBe(409);
  });

  it("calls rotatePreviewLink (not createPreviewLink) for action: rotate", async () => {
    rotatePreviewLink.mockResolvedValue({ ok: true, token: "NEW-TOKEN" });

    const res = await POST(req({ inviteId: VALID_ID, action: "rotate" }));
    const body = await res.json();

    expect(body).toEqual({ token: "NEW-TOKEN" });
    expect(rotatePreviewLink).toHaveBeenCalledWith(VALID_ID);
    expect(createPreviewLink).not.toHaveBeenCalled();
  });

  it("404s when rotate finds no matching invitation/link", async () => {
    rotatePreviewLink.mockResolvedValue({ ok: false, reason: "invite-not-found" });

    const res = await POST(req({ inviteId: VALID_ID, action: "rotate" }));

    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/invite-previews — revoke", () => {
  it("returns a plain confirmation, never a token, on successful revoke", async () => {
    revokePreviewLink.mockResolvedValue({ ok: true });

    const res = await POST(req({ inviteId: VALID_ID, action: "revoke" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ revoked: true });
    expect(body).not.toHaveProperty("token");
    expect(revokePreviewLink).toHaveBeenCalledWith(VALID_ID);
    expect(createPreviewLink).not.toHaveBeenCalled();
    expect(rotatePreviewLink).not.toHaveBeenCalled();
  });

  it("404s when nothing to revoke", async () => {
    revokePreviewLink.mockResolvedValue({ ok: false, reason: "not-found" });

    const res = await POST(req({ inviteId: VALID_ID, action: "revoke" }));

    expect(res.status).toBe(404);
  });
});
