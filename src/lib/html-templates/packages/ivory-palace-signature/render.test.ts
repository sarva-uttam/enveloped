import { describe, expect, it } from "vitest";
import { renderIvoryPalaceInvitation } from "./render";
import { validateGeneratedHtml } from "@/lib/html-templates/security";
import {
  IVORY_PALACE_FIXTURE,
  IVORY_PALACE_FIXTURE_NO_RESPONSE,
  IVORY_PALACE_FIXTURE_EMPTY_GALLERY,
  IVORY_PALACE_FIXTURE_PARTIAL_GALLERY,
  IVORY_PALACE_FIXTURE_LONG_NAMES,
} from "./fixture";

describe("renderIvoryPalaceInvitation — security/output contract", () => {
  it("passes the independent output validator for the representative fixture", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
  });

  it("contains zero <script> tags and zero inline event handlers", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
  });

  it("contains zero <link> tags (all styling is inline, per security.ts's contract)", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(html).not.toMatch(/<link\b/i);
  });

  it("escapes a hostile couple name rather than emitting raw markup", () => {
    const html = renderIvoryPalaceInvitation({
      ...IVORY_PALACE_FIXTURE,
      coupleName1: "</style><script>alert(document.cookie)</script>",
    });
    expect(html).not.toContain("</style><script>");
    expect(html).toContain("&lt;/style&gt;&lt;script&gt;alert(document.cookie)&lt;/script&gt;");
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
  });

  it("escapes hostile text in the family blessing line", () => {
    const html = renderIvoryPalaceInvitation({
      ...IVORY_PALACE_FIXTURE,
      familyBlessingLine: "</style><script>alert(1)</script>",
    });
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    expect(html).not.toMatch(/<script\b/i);
  });

  it("every scene section id from the 13-scene sequence is present", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    const expectedScenes = [
      "opening-reveal",
      "monogram",
      "introduction",
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
      "reception",
      "formal",
      "gallery",
      "venue",
      "blessing",
      "finale",
    ];
    for (const scene of expectedScenes) {
      expect(html).toContain(`id="scene-${scene}"`);
    }
  });

  it("does not render a ceremony section for an omitted optional ceremony", () => {
    const html = renderIvoryPalaceInvitation({
      ...IVORY_PALACE_FIXTURE,
      ceremonies: { wedding: IVORY_PALACE_FIXTURE.ceremonies.wedding },
    });
    expect(html).not.toContain('id="scene-haldi"');
    expect(html).not.toContain('id="scene-mehendi"');
    expect(html).not.toContain('id="scene-sangeet"');
    expect(html).not.toContain('id="scene-reception"');
    expect(html).toContain('id="scene-wedding"');
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
  });
});

describe("renderIvoryPalaceInvitation — RSVP states", () => {
  it("renders the RSVP CTA when response is present", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(html).toContain('<a class="rsvp-cta"');
    expect(html).toContain(IVORY_PALACE_FIXTURE.response!.url);
  });

  it("renders no RSVP link and no dangling href when response is omitted", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_NO_RESPONSE);
    // The .rsvp-cta CSS rule is always present in the shared stylesheet;
    // what must never appear is the <a> element itself.
    expect(html).not.toContain('<a class="rsvp-cta"');
    expect(html).toContain("response-disabled-note");
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
  });
});

function extractGalleryGrid(html: string): string {
  const match = html.match(/class="gallery-grid">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/);
  if (!match) throw new Error("gallery-grid not found in rendered output");
  return match[1];
}

describe("renderIvoryPalaceInvitation — gallery states", () => {
  it("renders 6 empty-fallback slots (never a fake photo) when gallery is empty", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_EMPTY_GALLERY);
    const grid = extractGalleryGrid(html);
    const emptySlots = grid.match(/gallery-slot--empty/g) ?? [];
    expect(emptySlots.length).toBe(6);
    expect(grid).not.toContain("<img");
  });

  it("renders exactly 3 photo slots and 3 empty slots for a partial gallery", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_PARTIAL_GALLERY);
    const grid = extractGalleryGrid(html);
    const photoImgs = grid.match(/<img\b/g) ?? [];
    const emptySlots = grid.match(/gallery-slot--empty/g) ?? [];
    expect(emptySlots.length).toBe(3);
    expect(photoImgs.length).toBe(3);
  });

  it("all 6 slots render photos for the full fixture, with escaped alt text", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    const grid = extractGalleryGrid(html);
    for (const photo of IVORY_PALACE_FIXTURE.gallery) {
      expect(grid).toContain(photo.alt);
    }
    expect(grid).not.toMatch(/gallery-slot--empty/);
  });
});

describe("renderIvoryPalaceInvitation — long names / long venue wording", () => {
  it("still validates cleanly with unusually long names and venue text", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_LONG_NAMES);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
    expect(html).toContain("Sarveshkumar Ramgoolam-Appadoo");
    expect(html).toContain("Shakshina Devi Ramnarain-Beeharry");
  });

  it("chooses the stacked name format for the long-names fixture", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE_LONG_NAMES);
    expect(html).toContain("names-line--stacked");
  });

  it("chooses the inline name format for short names", () => {
    const html = renderIvoryPalaceInvitation({ ...IVORY_PALACE_FIXTURE, coupleName1: "Jo", coupleName2: "Al" });
    expect(html).toContain("names-line--inline");
  });
});

describe("renderIvoryPalaceInvitation — video contract", () => {
  it("every <video> is preload=none with no autoplay attribute (zero-script lazy load)", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    const videoTags = html.match(/<video\b[^>]*>/g) ?? [];
    expect(videoTags.length).toBeGreaterThan(0);
    for (const tag of videoTags) {
      expect(tag).toContain('preload="none"');
      expect(tag).not.toMatch(/\sautoplay\b/);
    }
  });

  it("the opening door video has no loop attribute (plays once)", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    const openingSceneMatch = html.match(/id="scene-opening-reveal"[\s\S]*?<\/section>/);
    expect(openingSceneMatch).not.toBeNull();
    const openVideoTag = openingSceneMatch![0].match(/<video\b[^>]*>/);
    expect(openVideoTag).not.toBeNull();
    expect(openVideoTag![0]).not.toMatch(/\sloop\b/);
  });

  it("ambient ceremony videos (Haldi, Sangeet, Reception) and the finale video carry loop", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    for (const scene of ["haldi", "sangeet", "reception", "finale"]) {
      const sectionMatch = html.match(new RegExp(`id="scene-${scene}"[\\s\\S]*?</section>`));
      expect(sectionMatch, `expected a ${scene} section`).not.toBeNull();
      const videoTag = sectionMatch![0].match(/<video\b[^>]*>/);
      expect(videoTag, `expected a <video> in ${scene}`).not.toBeNull();
      expect(videoTag![0]).toMatch(/\sloop\b/);
    }
  });

  it("mehendi has no video (static-only scene per the source package)", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    const sectionMatch = html.match(/id="scene-mehendi"[\s\S]*?<\/section>/);
    expect(sectionMatch).not.toBeNull();
    expect(sectionMatch![0]).not.toContain("<video");
  });
});

describe("renderIvoryPalaceInvitation — accessibility", () => {
  it("finale artwork carries the documented meaningful alt text; decorative scenes are alt=\"\"", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(html).toContain(
      "An illustrated newlywed couple in burgundy and ivory attire stands on an illuminated palace terrace.",
    );
    expect(html).toContain('alt=""');
  });

  it("the RSVP CTA and map link are real anchors (keyboard-reachable, no button-as-div)", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(html).toMatch(/<a class="rsvp-cta"/);
    expect(html).toMatch(/<a class="map-link"/);
  });

  it("particle layers and decorative scrims are aria-hidden", () => {
    const html = renderIvoryPalaceInvitation(IVORY_PALACE_FIXTURE);
    expect(html).toMatch(/<div class="particle-layer" aria-hidden="true">/);
    expect(html).toMatch(/<div class="lamp-glow" aria-hidden="true">/);
  });
});
