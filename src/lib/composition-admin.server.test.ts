import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking pattern as preview-admin.server.test.ts: mock every I/O
// boundary so this file exercises composition-admin.server.ts's own
// orchestration/fail-closed logic without a real Next.js/Supabase
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

import { validateComposition, buildCompositionFromPack, saveInviteComposition } from "./composition-admin.server";
import { COMPOSITION_SCHEMA_VERSION } from "./composition/schema";

const ADMIN = { user: { id: "admin-1" }, isAdmin: true };
const NON_ADMIN = { user: { id: "user-1" }, isAdmin: false };

function validComposition() {
  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    templateId: null,
    designPackId: "neutral-classic",
    eventCategory: "wedding-other",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "gold" },
    sections: [{ id: "opening", type: "opening", enabled: true, data: { headline: "Hi" } }],
    featureConfig: { motion: true, ambientMotif: "none", openingBurst: false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
});

describe("validateComposition", () => {
  it("accepts a valid composition", () => {
    const result = validateComposition(validComposition());
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid composition (wrong schemaVersion)", () => {
    const result = validateComposition({ ...validComposition(), schemaVersion: 99 });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects garbage input without throwing", () => {
    expect(() => validateComposition("not even an object")).not.toThrow();
    expect(validateComposition(null).ok).toBe(false);
    expect(validateComposition(undefined).ok).toBe(false);
  });
});

describe("buildCompositionFromPack", () => {
  it("builds a valid composition for a registered pack", () => {
    const composition = buildCompositionFromPack({ packId: "neutral-classic", eventCategory: "wedding-other" });
    expect(composition).not.toBeNull();
  });

  it("returns null for an unregistered pack id", () => {
    expect(buildCompositionFromPack({ packId: "muslim-wedding", eventCategory: "wedding-muslim" })).toBeNull();
  });
});

describe("saveInviteComposition — authorization and validation order", () => {
  it("rejects a non-admin caller BEFORE validating the composition or touching the database", () => {
    checkAdmin.mockResolvedValue(NON_ADMIN);

    return saveInviteComposition({ inviteId: "invite-1", composition: { garbage: true }, expectedRevision: 0 }).then((result) => {
      expect(result).toEqual({ ok: false, reason: "not-admin" });
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  it("rejects an invalid composition from an admin, WITHOUT ever calling the RPC", async () => {
    checkAdmin.mockResolvedValue(ADMIN);

    const result = await saveInviteComposition({ inviteId: "invite-1", composition: { garbage: true }, expectedRevision: 0 });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves a valid composition from an admin, calling the RPC with the validated (not raw) composition and the expected revision", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: "ok", error: null });

    const result = await saveInviteComposition({ inviteId: "invite-1", composition: validComposition(), expectedRevision: 3 });

    expect(result).toEqual({ ok: true, revision: 4 });
    expect(rpc).toHaveBeenCalledWith("admin_save_invite_composition", {
      p_invite_id: "invite-1",
      p_composition: expect.objectContaining({ schemaVersion: COMPOSITION_SCHEMA_VERSION }),
      p_expected_revision: 3,
      p_occasion: null,
      p_occasion_custom_label: null,
    });
  });

  it("passes occasionId/occasionCustomLabel through when supplied", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: "ok", error: null });

    await saveInviteComposition({
      inviteId: "invite-1",
      composition: validComposition(),
      expectedRevision: 0,
      occasionId: "mehendi",
      occasionCustomLabel: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      "admin_save_invite_composition",
      expect.objectContaining({ p_occasion: "mehendi", p_occasion_custom_label: null })
    );
  });

  it("maps a 'not-found' RPC result to 'invite-not-found'", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: "not-found", error: null });

    const result = await saveInviteComposition({ inviteId: "invite-1", composition: validComposition(), expectedRevision: 0 });

    expect(result).toEqual({ ok: false, reason: "invite-not-found" });
  });

  it("maps a 'stale' RPC result to 'stale-revision' — a concurrent save must not be silently overwritten", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: "stale", error: null });

    const result = await saveInviteComposition({ inviteId: "invite-1", composition: validComposition(), expectedRevision: 0 });

    expect(result).toEqual({ ok: false, reason: "stale-revision" });
  });

  it("fails closed on a database error", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await saveInviteComposition({ inviteId: "invite-1", composition: validComposition(), expectedRevision: 0 });

    expect(result).toEqual({ ok: false, reason: "database-error" });
  });

  it("fails closed when no server client is available", async () => {
    checkAdmin.mockResolvedValue(ADMIN);
    createServerSupabaseClient.mockResolvedValue(null);

    const result = await saveInviteComposition({ inviteId: "invite-1", composition: validComposition(), expectedRevision: 0 });

    expect(result).toEqual({ ok: false, reason: "database-error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
