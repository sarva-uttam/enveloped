import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationExperience } from "./InvitationExperience";
import { InvitationCompositionSchema, COMPOSITION_SCHEMA_VERSION } from "@/lib/composition/schema";

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part G/I). Node env
 * + renderToStaticMarkup — the experience shell's server output IS the
 * invitation content (the envelope overlay is client-only); this proves
 * the composition renderer stays the content authority and the shell
 * only wraps it.
 */

function composition(overrides: Record<string, unknown> = {}) {
  return InvitationCompositionSchema.parse({
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    templateId: null,
    designPackId: "hindu-wedding",
    eventCategory: "wedding-hindu",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "gold" },
    sections: [
      { id: "opening", type: "opening", enabled: true, data: { headline: "Priya & Devansh" } },
      { id: "welcome", type: "welcome", enabled: true, data: { message: "We can't wait to celebrate." } },
      { id: "rsvp", type: "rsvp", enabled: true, data: {} },
      { id: "closing", type: "closing", enabled: true, data: { message: "With love." } },
    ],
    featureConfig: { motion: true, ambientMotif: "light", openingBurst: true, envelopeOpening: true },
    ...overrides,
  });
}

describe("InvitationExperience — server-rendered content is the invitation itself", () => {
  it("the server HTML contains the composition's wording, before any hydration", () => {
    const html = renderToStaticMarkup(
      <InvitationExperience composition={composition()} inviteId="priya-devansh" canRsvp mode="guest" />
    );
    expect(html).toContain("Priya &amp; Devansh");
    expect(html).toContain("We can&#x27;t wait to celebrate.");
    expect(html).toContain("With love.");
  });

  it("the envelope overlay is NEVER in the server HTML — it is a client-only progressive enhancement", () => {
    const html = renderToStaticMarkup(
      <InvitationExperience composition={composition()} inviteId="x" canRsvp mode="guest" />
    );
    expect(html).not.toContain("data-envelope-overlay");
    expect(html).not.toContain("Open your invitation");
    expect(html).not.toContain("Skip animation");
  });
});

describe("InvitationExperience — context-specific behavior stays correct", () => {
  it("RSVP form appears for a published/guest context (canRsvp true)", () => {
    const html = renderToStaticMarkup(
      <InvitationExperience composition={composition()} inviteId="x" canRsvp mode="guest" />
    );
    expect(html).toContain("Will you be joining us?");
  });

  it("RSVP form is absent when canRsvp is false (unpublished preview) — Stage 5 restriction preserved through the shell", () => {
    const html = renderToStaticMarkup(
      <InvitationExperience composition={composition()} inviteId="x" canRsvp={false} mode="review" />
    );
    expect(html).not.toContain("Will you be joining us?");
  });

  it("does not render, import, or reference any owner-management or PayPal control", () => {
    const html = renderToStaticMarkup(
      <InvitationExperience composition={composition()} inviteId="x" canRsvp mode="review" />
    );
    expect(html).not.toContain("PaywallPanel");
    expect(html).not.toContain("My invites");
    expect(html).not.toContain("paypal");
  });
});
