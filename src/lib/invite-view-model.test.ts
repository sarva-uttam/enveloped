import { describe, it, expect } from "vitest";
import {
  buildPublicInviteViewModel,
  buildDemoInviteViewModel,
  buildPreviewInviteViewModel,
  buildOwnerInviteViewModel,
  isValidSlug,
} from "./invite-view-model";
import type { PublicInvite, PreviewInvite, StoredInvite } from "./storage-queries";
import type { GeneratedInviteContent } from "./types";

const CONTENT: GeneratedInviteContent = {
  headline: "Priya & Devansh",
  subheadline: "sub",
  welcomeMessage: "welcome",
  eventDetails: [{ label: "Date", value: "Nov 1" }],
  closingLine: "closing",
  suggestedPalette: ["#000"],
};

const PUBLISHED: PublicInvite = {
  invitesRowId: "row-1",
  slug: "priya-devansh",
  paid: true,
  publishedAt: "2026-11-01T00:00:00Z",
  tier: "gold",
  content: CONTENT,
  eventDate: "2026-11-01T18:00:00Z",
  song: "Perfect",
};

describe("buildPublicInviteViewModel", () => {
  it("returns null when the invite doesn't exist at all (publicInvite: null)", () => {
    expect(buildPublicInviteViewModel({ publicInvite: null, guestEntry: null })).toBeNull();
  });

  it("returns null when the invite exists but isn't published — same null as 'doesn't exist', by design (one safe unavailable response)", () => {
    const unpublished: PublicInvite = { ...PUBLISHED, publishedAt: null, tier: null, content: null, eventDate: null, song: null };
    expect(buildPublicInviteViewModel({ publicInvite: unpublished, guestEntry: null })).toBeNull();
  });

  it("returns null when publishedAt is set but content is somehow still null (defensive — never render a partial model)", () => {
    const weird: PublicInvite = { ...PUBLISHED, content: null };
    expect(buildPublicInviteViewModel({ publicInvite: weird, guestEntry: null })).toBeNull();
  });

  it("returns null REGARDLESS of paid status when unpublished — paid never substitutes for published", () => {
    const paidButUnpublished: PublicInvite = { ...PUBLISHED, paid: true, publishedAt: null, tier: null, content: null, eventDate: null, song: null };
    expect(buildPublicInviteViewModel({ publicInvite: paidButUnpublished, guestEntry: null })).toBeNull();

    const unpaidButPublished: PublicInvite = { ...PUBLISHED, paid: false };
    expect(buildPublicInviteViewModel({ publicInvite: unpaidButPublished, guestEntry: null })).not.toBeNull();
  });

  it("builds a full model for a published invite with no guest token — base link still renders, no personalization required", () => {
    const model = buildPublicInviteViewModel({ publicInvite: PUBLISHED, guestEntry: null });
    expect(model).toEqual({
      inviteId: "priya-devansh",
      guestId: undefined,
      guestName: undefined,
      tier: "gold",
      content: PUBLISHED.content,
      eventDate: "2026-11-01T18:00:00Z",
      song: "Perfect",
      isDemo: false,
      isPublished: true,
    });
  });

  it("personalizes guestId/guestName ONLY from a resolved guest entry — never trusts a raw token directly", () => {
    const model = buildPublicInviteViewModel({
      publicInvite: PUBLISHED,
      guestEntry: { id: "guest-1", name: "Aria", clickTeaser: "Click me." },
    });
    expect(model?.guestId).toBe("guest-1");
    expect(model?.guestName).toBe("Aria");
  });

  it("an invalid/non-matching guest token (resolved to null) does not block the base invite from rendering — no leak, no error, just unpersonalized", () => {
    const model = buildPublicInviteViewModel({ publicInvite: PUBLISHED, guestEntry: null });
    expect(model).not.toBeNull();
    expect(model?.guestName).toBeUndefined();
  });

  it("falls back tier to 'bronze' if the RPC somehow returned a null tier on a published row", () => {
    const noTier: PublicInvite = { ...PUBLISHED, tier: null };
    const model = buildPublicInviteViewModel({ publicInvite: noTier, guestEntry: null });
    expect(model?.tier).toBe("bronze");
  });

  it("the model never carries answers/owner_id/paypal_order_id/paid — structurally impossible, not just unused: those keys don't exist on InviteViewModel", () => {
    const model = buildPublicInviteViewModel({ publicInvite: PUBLISHED, guestEntry: null });
    const keys = Object.keys(model!);
    expect(keys).toEqual([
      "inviteId",
      "guestId",
      "guestName",
      "tier",
      "content",
      "eventDate",
      "song",
      "isDemo",
      "isPublished",
    ]);
    expect(keys).not.toContain("paid");
    expect(keys).not.toContain("answers");
    expect(keys).not.toContain("ownerId");
    expect(keys).not.toContain("paypalOrderId");
  });
});

describe("buildDemoInviteViewModel", () => {
  it("always produces a viewable model (demos are always 'published') with inviteId undefined — no RSVP path for demos", () => {
    const model = buildDemoInviteViewModel({
      id: "demo-gold",
      tier: "gold",
      content: CONTENT,
      eventDate: "2027-01-01T00:00:00Z",
      song: "Song",
      guestName: "Aria",
    });
    expect(model.inviteId).toBeUndefined();
    expect(model.guestId).toBeUndefined();
    expect(model.isDemo).toBe(true);
    expect(model.isPublished).toBe(true);
    expect(model.guestName).toBe("Aria");
    expect(model.tier).toBe("gold");
  });
});

describe("buildPreviewInviteViewModel", () => {
  const PREVIEW: PreviewInvite = {
    invitesRowId: "row-2",
    slug: "priya-devansh",
    paid: false,
    publishedAt: null,
    tier: "gold",
    content: CONTENT,
    eventDate: "2026-11-01T18:00:00Z",
    song: "Perfect",
  };

  it("returns null for a token that didn't resolve to anything — the RPC/fetch layer already collapsed every reason (invalid, malformed, rotated, revoked) into 'no row'", () => {
    expect(buildPreviewInviteViewModel(null)).toBeNull();
  });

  it("builds a full model for an UNPUBLISHED invitation — a preview token grants access regardless of publishedAt", () => {
    const model = buildPreviewInviteViewModel(PREVIEW);
    expect(model).not.toBeNull();
    expect(model?.content).toEqual(CONTENT);
    expect(model?.isPublished).toBe(false);
  });

  it("builds a full model for an already-published invitation too — preview works for both", () => {
    const model = buildPreviewInviteViewModel({ ...PREVIEW, publishedAt: "2026-11-01T00:00:00Z" });
    expect(model?.isPublished).toBe(true);
  });

  it("never personalizes a guest — guestId/guestName are always undefined, there is no guest-token concept in a preview payload at all", () => {
    const model = buildPreviewInviteViewModel(PREVIEW);
    expect(model?.guestId).toBeUndefined();
    expect(model?.guestName).toBeUndefined();
  });

  it("falls back tier to 'bronze' if somehow null", () => {
    const model = buildPreviewInviteViewModel({ ...PREVIEW, tier: null as unknown as PreviewInvite["tier"] });
    expect(model?.tier).toBe("bronze");
  });

  it("never carries paid/token hashes/any invite_previews column — not on PreviewInvite's own shape, so structurally impossible on the model built from it", () => {
    const model = buildPreviewInviteViewModel(PREVIEW);
    const keys = Object.keys(model!);
    expect(keys).not.toContain("paid");
    expect(keys).not.toContain("tokenHash");
    expect(keys).not.toContain("token_hash");
  });
});

describe("buildOwnerInviteViewModel", () => {
  const OWNED: StoredInvite = {
    id: "priya-devansh",
    internalId: "row-3",
    answers: {
      category: "wedding-hindu",
      tier: "silver",
      partnerNames: "Priya & Devansh",
      eventDate: "2027-02-01T18:00:00Z",
      venue: "The Grand Hall",
      city: "Mumbai",
      colorMood: "warm",
      song: "Our Song",
      extraDetails: "",
      guestNames: "Aria, Kabir",
    },
    content: CONTENT,
    guestList: [{ id: "g1", name: "Aria", slug: "aria-abc", viewed: false, clickTeaser: "Click me." }],
    createdAt: "2026-01-01T00:00:00Z",
    paid: false,
    publishedAt: null,
    ownerId: "owner-1",
  };

  it("builds a full model even when unpublished — the owner is always entitled to see their own invitation", () => {
    const model = buildOwnerInviteViewModel(OWNED);
    expect(model.content).toEqual(CONTENT);
    expect(model.isPublished).toBe(false);
    expect(model.tier).toBe("silver");
    expect(model.eventDate).toBe("2027-02-01T18:00:00Z");
    expect(model.song).toBe("Our Song");
  });

  it("reflects real publication state once published", () => {
    const model = buildOwnerInviteViewModel({ ...OWNED, publishedAt: "2027-01-15T00:00:00Z" });
    expect(model.isPublished).toBe(true);
  });

  it("never personalizes a guest — this is the owner's own base view, not any one guest's", () => {
    const model = buildOwnerInviteViewModel(OWNED);
    expect(model.guestId).toBeUndefined();
    expect(model.guestName).toBeUndefined();
  });

  it("the model never carries the owner-only answers blob itself, owner_id, or the raw guest list — only the narrow InviteViewModel fields, same as every other builder", () => {
    const model = buildOwnerInviteViewModel(OWNED);
    const keys = Object.keys(model);
    expect(keys).not.toContain("answers");
    expect(keys).not.toContain("ownerId");
    expect(keys).not.toContain("guestList");
  });

  it("falls back tier to 'bronze' when the stored answers have no tier set", () => {
    const model = buildOwnerInviteViewModel({ ...OWNED, answers: { ...OWNED.answers, tier: null } });
    expect(model.tier).toBe("bronze");
  });
});

describe("isValidSlug", () => {
  it("accepts real slug shapes this app actually generates", () => {
    expect(isValidSlug("priya-devansh-abc123")).toBe(true);
    expect(isValidSlug("demo-bronze")).toBe(true);
    expect(isValidSlug("aria-thompson-0-a1b2")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
  });

  it("rejects empty, null, undefined", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(undefined)).toBe(false);
  });

  it("rejects uppercase, whitespace, and unexpected punctuation", () => {
    expect(isValidSlug("Priya-Devansh")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("../../etc/passwd")).toBe(false);
    expect(isValidSlug("drop table invites;")).toBe(false);
    expect(isValidSlug("slug'or'1'='1")).toBe(false);
    expect(isValidSlug("<script>alert(1)</script>")).toBe(false);
  });

  it("rejects a value starting with a hyphen (every real slug starts with a letter/digit)", () => {
    expect(isValidSlug("-leading-hyphen")).toBe(false);
  });

  it("rejects an unreasonably long value (defense against pathological input)", () => {
    expect(isValidSlug("a".repeat(129))).toBe(false);
    expect(isValidSlug("a".repeat(128))).toBe(true);
  });
});
