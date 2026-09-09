import { describe, it, expect } from "vitest";
import { resolveViewerRole } from "./ownership";

const BASE = {
  isDemo: false,
  storedExists: true as const,
  isPublished: true,
  currentUserId: null as string | null,
  ownerId: null as string | null,
  guestSlug: null as string | null,
};

describe("resolveViewerRole", () => {
  it("returns null while still loading (storedExists === null)", () => {
    expect(resolveViewerRole({ ...BASE, storedExists: null })).toBeNull();
  });

  it("returns not-found when the invite doesn't exist", () => {
    expect(resolveViewerRole({ ...BASE, storedExists: false })).toEqual({ kind: "not-found" });
  });

  it("always treats demo invites as demo, regardless of auth state", () => {
    expect(resolveViewerRole({ ...BASE, isDemo: true, currentUserId: "u1", ownerId: "u2" })).toEqual({
      kind: "demo",
    });
  });

  // --- The core bug fix: ownership is never inferred from the absence of
  // a ?guest= query param — only from a real authenticated id match. ---

  it("does NOT grant owner view to a logged-out visitor with no ?guest= param (the original bug)", () => {
    const role = resolveViewerRole({
      ...BASE,
      currentUserId: null,
      ownerId: "host-1",
      guestSlug: null,
    });
    expect(role?.kind).not.toMatch(/^owner/);
    expect(role).toEqual({ kind: "guest-published", guestSlug: null });
  });

  it("does NOT grant owner view to a DIFFERENT logged-in user viewing someone else's invite (cross-user denial)", () => {
    const role = resolveViewerRole({
      ...BASE,
      currentUserId: "attacker-42",
      ownerId: "host-1",
      guestSlug: null,
    });
    expect(role?.kind).not.toMatch(/^owner/);
    expect(role).toEqual({ kind: "guest-published", guestSlug: null });
  });

  it("grants owner view ONLY when the authenticated user's id matches owner_id", () => {
    const role = resolveViewerRole({
      ...BASE,
      currentUserId: "host-1",
      ownerId: "host-1",
      guestSlug: null,
    });
    expect(role).toEqual({ kind: "owner-published" });
  });

  it("does not grant owner view when owner_id is null (legacy ownerless invite), even for a logged-in user", () => {
    const role = resolveViewerRole({
      ...BASE,
      currentUserId: "host-1",
      ownerId: null,
      guestSlug: null,
    });
    expect(role?.kind).not.toMatch(/^owner/);
  });

  // --- Stage 3: publication, not payment, is the gate. isPublished
  // drives every "*-published"/"*-unpublished" role below — never
  // `paid`, which no longer participates in this decision at all. ---

  it("the real owner still gets the owner-unpublished view when NOT published — regardless of payment status", () => {
    const role = resolveViewerRole({
      ...BASE,
      isPublished: false,
      currentUserId: "host-1",
      ownerId: "host-1",
    });
    expect(role).toEqual({ kind: "owner-unpublished" });
  });

  it("a guest hitting an unpublished invite gets guest-unpublished, never the paywall", () => {
    const role = resolveViewerRole({
      ...BASE,
      isPublished: false,
      currentUserId: null,
      ownerId: "host-1",
      guestSlug: "priya-ab12",
    });
    expect(role).toEqual({ kind: "guest-unpublished" });
  });

  it("a guest with a valid slug on a published invite gets guest-published carrying that slug", () => {
    const role = resolveViewerRole({
      ...BASE,
      currentUserId: null,
      ownerId: "host-1",
      guestSlug: "priya-ab12",
    });
    expect(role).toEqual({ kind: "guest-published", guestSlug: "priya-ab12" });
  });

  it("payment/publication independence: the owner sees owner-published for a PUBLISHED invite even though isPaid isn't part of this function's input at all anymore — publication alone decides it", () => {
    // isPublished: true (from BASE) with no isPaid field present —
    // demonstrates the type itself no longer has a payment concept to
    // accidentally couple back in.
    const role = resolveViewerRole({
      ...BASE,
      currentUserId: "host-1",
      ownerId: "host-1",
    });
    expect(role).toEqual({ kind: "owner-published" });
  });
});
