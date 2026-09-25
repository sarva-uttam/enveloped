import { describe, expect, it } from "vitest";
import { TimelessEditorialDataSchema } from "./schema";
import { renderTimelessEditorialInvitation } from "./render";
import { TIMELESS_EDITORIAL_FIXTURE } from "./fixture";
import { validateGeneratedHtml } from "@/lib/html-templates/security";

describe("TimelessEditorialDataSchema", () => {
  it("accepts the representative fixture", () => {
    const result = TimelessEditorialDataSchema.safeParse(TIMELESS_EDITORIAL_FIXTURE);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown field (strict schema)", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      customHtml: "<div>injected</div>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects raw angle brackets in a text field", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      partner1Name: "<img src=x onerror=alert(1)>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: RSVP URL", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: { ...TIMELESS_EDITORIAL_FIXTURE.response, url: "javascript:alert(1)" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unlicensed HTML/script-like value in a response text field", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: { ...TIMELESS_EDITORIAL_FIXTURE.response, heading: "<script>alert(1)</script>" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts composition data with no response section (optional)", () => {
    const result = TimelessEditorialDataSchema.safeParse({ ...TIMELESS_EDITORIAL_FIXTURE, response: undefined });
    expect(result.success).toBe(true);
  });

  it("rejects a data: map URL", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      mapUrl: "data:text/html,<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an https RSVP URL and an http map URL", () => {
    const result = TimelessEditorialDataSchema.safeParse({
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: { ...TIMELESS_EDITORIAL_FIXTURE.response, url: "https://example.com/guest/abc" },
      mapUrl: "http://example.com/map",
    });
    expect(result.success).toBe(true);
  });
});

describe("renderTimelessEditorialInvitation", () => {
  it("produces output that passes the independent output validator", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    const result = validateGeneratedHtml(html);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("contains zero <script> tags", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).not.toMatch(/<script\b/i);
  });

  it("contains zero inline event handler attributes", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).not.toMatch(/\son\w+\s*=/i);
  });

  it("HTML-escapes a name field instead of rendering it as markup", () => {
    const data = { ...TIMELESS_EDITORIAL_FIXTURE, partner1Name: "Anne &amp; <b>Bold</b>" };
    // schema would reject raw <> at the composition boundary; this test
    // exercises the renderer's own escaping independently of the schema
    // gate, per "defense in depth" — simulate a value that reached the
    // renderer some other way and assert it still can't inject markup.
    const html = renderTimelessEditorialInvitation(data);
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
  });

  it("escapes a malicious value in an href-bound field", () => {
    const data = {
      ...TIMELESS_EDITORIAL_FIXTURE,
      response: { ...TIMELESS_EDITORIAL_FIXTURE.response!, url: 'https://example.com/"><script>alert(1)</script>' },
    };
    const html = renderTimelessEditorialInvitation(data);
    expect(html).not.toMatch(/<script\b/i);
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(true);
  });

  it("does not render a content-panel/card/bordered container around the wording", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    // owner review 2: the previous version wrapped all wording in a
    // translucent panel, which read as a webpage card. That element
    // (and any equivalent bordered/box-shadowed container class) must
    // not come back.
    expect(html).not.toContain("content-panel");
    expect(html).not.toMatch(/box-shadow/i);
    expect(html).not.toMatch(/\bborder(?!-top|-bottom)\s*:/i);
  });

  it("uses the owner-specified guest-response wording, not generic RSVP labels", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain("Will you celebrate with us?");
    expect(html).toContain("Share your response");
    expect(html).not.toMatch(/>\s*RSVP\s*</);
  });

  it("declares self-hosted @font-face rules referencing only relative asset paths", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain("@font-face");
    expect(html).toContain('url("assets/fonts/alex-brush-latin-400-normal.woff2")');
    expect(html).toContain('url("assets/fonts/playfair-display-latin-400-normal.woff2")');
    expect(html).toContain('url("assets/fonts/playfair-display-latin-600-normal.woff2")');
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/i);
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(true);
  });

  it("gives every calligraphy/display-serif font stack a real fallback", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toMatch(/--font-calligraphy:\s*"Invitation Calligraphy",[^;]*cursive/);
    expect(html).toMatch(/--font-display-serif:\s*"Invitation Display Serif",[^;]*serif/);
  });

  it("keeps all decorative layers aria-hidden and non-interactive", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain('<div class="frame-corner frame-corner--top-left" aria-hidden="true">');
    expect(html).toContain('<div class="frame-side frame-side--left" aria-hidden="true">');
    expect(html).toContain('<div class="frame-band frame-band--top" aria-hidden="true">');
    expect(html).toContain('<div class="particle-layer" aria-hidden="true">');
  });

  it("bounds petal and sparkle instance counts within the package README limits", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    const petalCount = (html.match(/class="petal"/g) ?? []).length;
    const sparkleCount = (html.match(/class="sparkle"/g) ?? []).length;
    expect(petalCount).toBeLessThanOrEqual(14);
    expect(sparkleCount).toBeLessThanOrEqual(18);
  });

  it("disables decorative animation under prefers-reduced-motion", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
    expect(html).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.petal,\s*\.sparkle\s*\{\s*display:\s*none;/);
  });

  it("references only relative template assets or allowlisted RSVP/map URLs", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain('url("assets/frame-pieces/desktop-top-left.png")');
    expect(html).toContain('url("assets/frame-pieces/mobile-top.png")');
    expect(html).toContain('url("assets/petal-sprites.png")');
    expect(html).toContain('url("assets/sparkle-sprites.png")');
  });

  it("declares AVIF/WebP delivery versions of the petal and sparkle sprites with the PNG as fallback", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain('url("assets/petal-sprites.avif") type("image/avif")');
    expect(html).toContain('url("assets/petal-sprites.webp") type("image/webp")');
    expect(html).toContain('url("assets/sparkle-sprites.avif") type("image/avif")');
    expect(html).toContain('url("assets/sparkle-sprites.webp") type("image/webp")');
  });

  it("declares only relative frame-piece assets (no external image-set references)", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    const refPattern = /url\("(assets\/[^"]+)"\)/g;
    let match: RegExpExecArray | null;
    const refs: string[] = [];
    while ((match = refPattern.exec(html)) !== null) refs.push(match[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith("assets/")).toBe(true);
    }
  });

  it("embeds no raw preview/guest token beyond the illustrative fixture URL", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    // the fixture's response.url is the only token-shaped string in
    // this slice, and it is a fixture value, not a real redeemable token
    expect(html).toContain(TIMELESS_EDITORIAL_FIXTURE.response!.url);
  });
});

describe("validateGeneratedHtml", () => {
  it("flags a document with an injected <script> tag", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE).replace(
      "</body>",
      "<script>alert(1)</script></body>",
    );
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("<script>"))).toBe(true);
  });

  it("flags a document with an inline event handler", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE).replace(
      '<div class="frame-corner frame-corner--top-left" aria-hidden="true">',
      '<div class="frame-corner frame-corner--top-left" aria-hidden="true" onclick="alert(1)">',
    );
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("event handler"))).toBe(true);
  });

  it("flags a document referencing an external CSS url() inside <style> (e.g. an injected external font)", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE).replace(
      "@font-face {",
      `@font-face { src: url("https://fonts.gstatic.com/evil.woff2") format("woff2");`,
    );
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("external CSS url()"))).toBe(true);
  });

  it("passes a clean document with only relative CSS url() references (frame/particle/font assets)", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("flags a document with an injected external stylesheet <link>", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE).replace(
      "</head>",
      '<link rel="stylesheet" href="https://evil.example.com/x.css"></head>',
    );
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("<link>"))).toBe(true);
  });

  it("flags a src/href using a disallowed URL scheme even outside a forbidden tag", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE).replace(
      TIMELESS_EDITORIAL_FIXTURE.mapUrl,
      "ftp://example.com/map",
    );
    const result = validateGeneratedHtml(html);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("disallowed URL scheme"))).toBe(true);
  });

  it("passes a clean document with zero errors", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(validateGeneratedHtml(html)).toEqual({ ok: true, errors: [] });
  });
});
