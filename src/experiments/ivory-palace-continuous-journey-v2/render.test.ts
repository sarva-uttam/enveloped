import { describe, expect, it } from "vitest";
import { renderJourneyDocument } from "./render";
import { JOURNEY_FIXTURE, JOURNEY_FIXTURE_LONG_NAMES } from "./fixture";

describe("renderJourneyDocument", () => {
  const html = renderJourneyDocument(JOURNEY_FIXTURE);

  it("carries the EXPERIMENTAL marker visibly in the document", () => {
    expect(html).toContain("EXPERIMENTAL");
    expect(html).toContain("NOT PRODUCTION READY");
  });

  it("emits every piece of required wording as live text, never baked into an image reference", () => {
    expect(html).toContain("You are invited");
    expect(html).toContain("Sarvesh");
    expect(html).toContain("Shakshina");
    expect(html).toContain("Together with their families invite you to celebrate their wedding journey.");
    expect(html).toContain("Haldi Ceremony");
    expect(html).toContain("Friday, 18 December 2026");
    expect(html).toContain("With the blessings of our families");
    expect(html).toContain("Saturday, 19 December 2026");
    expect(html).toContain("Your presence will make our celebration complete.");
    expect(html).toContain("View directions");
    expect(html).toContain("Share your response");
  });

  it("keeps the ampersand independent (its own element/line), never merged into a name string", () => {
    expect(html).toMatch(/<span class="ampersand">&amp;<\/span>/);
    expect(html).toMatch(/<p class="ampersand-standalone">&amp;<\/p>/);
    expect(html).not.toContain("Sarvesh & Shakshina<");
  });

  it("HTML-escapes interpolated fixture text (defence against markup injection in fixture data)", () => {
    const withMarkup = renderJourneyDocument({
      ...JOURNEY_FIXTURE,
      state1Intro: '<img src=x onerror="alert(1)">',
    });
    expect(withMarkup).not.toContain("<img src=x onerror");
    expect(withMarkup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("never uses S01/S02/S03 as separate shipped plates (core implementation decision)", () => {
    expect(html).not.toContain("world-plate-2");
    expect(html).not.toContain("s01-welcome");
    expect(html).not.toContain("s02-haldi-master");
    expect(html).not.toContain("s03-wedding");
  });

  it("declares all three T04 treatments so they can be locally compared", () => {
    expect(html).toContain('data-t04="A"');
    expect(html).toContain('data-t04="B"');
    expect(html).toContain('data-t04="C"');
    expect(html).toContain('data-treatment="A"');
    expect(html).toContain('data-treatment="B"');
    expect(html).toContain('data-treatment="C"');
  });

  it("provides a complete reduced-motion static fallback with all content present", () => {
    expect(html).toContain('id="static"');
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("#scrolly { display: none; }");
  });

  it("declares no video element or Gemini video reference anywhere", () => {
    expect(html).not.toContain("<video");
    expect(html.toLowerCase()).not.toContain("gemini");
    expect(html).not.toMatch(/\.mp4|\.webm/);
  });

  it("renders long names on independent lines without truncation", () => {
    const longHtml = renderJourneyDocument(JOURNEY_FIXTURE_LONG_NAMES);
    expect(longHtml).toContain("Venkateshwaran");
    expect(longHtml).toContain("Anushriyadevi");
    expect(longHtml).toMatch(/<p class="phase-names">Venkateshwaran<\/p>/);
    expect(longHtml).toMatch(/<p class="phase-names">Anushriyadevi<\/p>/);
  });

  it("gives every interactive control an accessible min-height via CSS (44px target)", () => {
    expect(html).toContain("min-height: 44px");
  });

  it("marks decorative imagery with empty alt and gives the finale composite meaningful alt text", () => {
    expect(html).toMatch(/alt=""/);
    expect(html).toContain(
      "An illustrated newlywed couple in burgundy and ivory attire stands on an illuminated palace terrace."
    );
  });
});
