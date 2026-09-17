import { describe, expect, it } from "vitest";
import { TimelessEditorialDataSchema } from "./schema";
import { renderTimelessEditorialInvitation } from "./render";
import { TIMELESS_EDITORIAL_FIXTURE, TIMELESS_EDITORIAL_FIXTURE_NO_RESPONSE } from "./fixture";
import { validateGeneratedHtml } from "@/lib/html-templates/security";

describe("optional guest-response section (Part 4)", () => {
  it("renders the response section, heading, and link when response is provided", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain('<section class="response-section">');
    expect(html).toContain("Will you celebrate with us?");
    expect(html).toContain('<a class="rsvp-cta"');
  });

  it("renders no response section, heading, or link when response is omitted", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE_NO_RESPONSE);
    expect(html).not.toContain('class="response-section"');
    expect(html).not.toContain('class="response-heading"');
    expect(html).not.toContain('class="rsvp-cta"');
    expect(html).not.toContain("Will you celebrate with us?");
  });

  it("still validates cleanly with the response section disabled", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE_NO_RESPONSE);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
  });

  it("renders an independent deadline line generated from a trusted wrapper sentence", () => {
    const html = renderTimelessEditorialInvitation({
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: {
        heading: "Will you celebrate with us?",
        buttonLabel: "Share your response",
        url: "https://example.com/guest/sample-fixture-token",
        deadline: "1 May 2026",
      },
    });
    expect(html).toContain('<p class="response-deadline">Kindly respond by 1 May 2026.</p>');
  });

  it("applies schema defaults for heading and buttonLabel when omitted", () => {
    const parsed = TimelessEditorialDataSchema.parse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: { url: "https://example.com/guest/sample-fixture-token" },
    });
    expect(parsed.response?.heading).toBe("Will you celebrate with us?");
    expect(parsed.response?.buttonLabel).toBe("Share your response");
  });

  it("enforces strict length limits and rejects markup in every response field", () => {
    const overLong = "x".repeat(500);
    expect(
      TimelessEditorialDataSchema.safeParse({
        ...TIMELESS_EDITORIAL_FIXTURE,
        response: { ...TIMELESS_EDITORIAL_FIXTURE.response, heading: overLong },
      }).success,
    ).toBe(false);
    expect(
      TimelessEditorialDataSchema.safeParse({
        ...TIMELESS_EDITORIAL_FIXTURE,
        response: { ...TIMELESS_EDITORIAL_FIXTURE.response, supportingMessage: "<img src=x onerror=alert(1)>" },
      }).success,
    ).toBe(false);
    expect(
      TimelessEditorialDataSchema.safeParse({
        ...TIMELESS_EDITORIAL_FIXTURE,
        response: { ...TIMELESS_EDITORIAL_FIXTURE.response, buttonLabel: "<script>alert(1)</script>" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields on the response object (strict schema, no client-injected markup slots)", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: { ...TIMELESS_EDITORIAL_FIXTURE.response, rawHtml: "<div>injected</div>" },
    });
    expect(result.success).toBe(false);
  });
});
