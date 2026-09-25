import { describe, expect, it } from "vitest";
import { chooseDesktopNameFormat, estimateInlineNamesWidthPx } from "./names";
import { renderTimelessEditorialInvitation } from "./render";
import { TIMELESS_EDITORIAL_FIXTURE } from "./fixture";

// Mirrors the constants render.ts checks against (see its own
// DESKTOP_CONTENT_SAFE_WIDTH_PX / DESKTOP_INLINE_NAME_MAX_FONT_PX).
const SAFE_WIDTH_PX = 640;
const MAX_FONT_PX = 57.6;

describe("chooseDesktopNameFormat", () => {
  it("keeps short names on one line", () => {
    expect(chooseDesktopNameFormat("Jo", "Al", SAFE_WIDTH_PX, MAX_FONT_PX)).toBe("inline");
    expect(chooseDesktopNameFormat("Wei", "Amy", SAFE_WIDTH_PX, MAX_FONT_PX)).toBe("inline");
  });

  it("chooses the permitted format for an ordinary two-word-per-person name", () => {
    // "Priya & Devendra" is short enough to legitimately fit inline at
    // the desktop safe width; this asserts the *correct* format is
    // chosen, not that inline is always preferred.
    const format = chooseDesktopNameFormat("Priya", "Devendra", SAFE_WIDTH_PX, MAX_FONT_PX);
    const estimate = estimateInlineNamesWidthPx("Priya", "Devendra", MAX_FONT_PX);
    expect(format).toBe(estimate <= SAFE_WIDTH_PX ? "inline" : "stacked");
    expect(format).toBe("inline");
  });

  it("switches long full names safely to the stacked format", () => {
    const format = chooseDesktopNameFormat(
      "Alexandria Cunningham-Fairweather",
      "Maximilian Worthington-Blackwood",
      SAFE_WIDTH_PX,
      MAX_FONT_PX,
    );
    expect(format).toBe("stacked");
  });

  it("switches an ordinary full first+last name pair to stacked once both names are present", () => {
    // "Eleanor Whitfield & Julian Marsh" (33 chars) does not fit the
    // 640px safe width at the inline format's own max font-size —
    // stacked is the correct, safe choice here, not a fallback.
    const format = chooseDesktopNameFormat("Eleanor Whitfield", "Julian Marsh", SAFE_WIDTH_PX, MAX_FONT_PX);
    expect(format).toBe("stacked");
  });

  it("is monotonic: a strictly longer name never flips stacked back to inline", () => {
    const shortFormat = chooseDesktopNameFormat("Amy", "Lee", SAFE_WIDTH_PX, MAX_FONT_PX);
    const longerFormat = chooseDesktopNameFormat("Amy Alexandra", "Lee Montgomery-Fitzgerald", SAFE_WIDTH_PX, MAX_FONT_PX);
    expect(shortFormat).toBe("inline");
    expect(longerFormat).toBe("stacked");
  });
});

describe("renderNames output (structure + ampersand rule)", () => {
  it("emits three separate semantic spans, never a single combined string", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toContain('<span class="name-person">Eleanor Whitfield</span>');
    expect(html).toContain('<span class="name-amp">&amp;</span>');
    expect(html).toContain('<span class="name-person">Julian Marsh</span>');
    // never a raw combined "Eleanor Whitfield & Julian Marsh" text run
    // inside the visible heading markup the browser could wrap on its
    // own (the <title> tag legitimately contains the plain combined
    // string as page metadata, so this checks only the h1 region)
    const heroMatch = html.match(/<h1 class="names-line[\s\S]*?<\/h1>/);
    expect(heroMatch).not.toBeNull();
    expect(heroMatch![0]).not.toContain("Eleanor Whitfield & Julian Marsh");
  });

  it("keeps each full name inside a single name-person span (never split across two spans)", () => {
    const html = renderTimelessEditorialInvitation({
      ...TIMELESS_EDITORIAL_FIXTURE,
      partner1Name: "Alexandria Cunningham-Fairweather",
      partner2Name: "Maximilian Worthington-Blackwood",
    });
    expect(html).toContain('<span class="name-person">Alexandria Cunningham-Fairweather</span>');
    expect(html).toContain('<span class="name-person">Maximilian Worthington-Blackwood</span>');
  });

  it("wraps the names in a names-line--stacked wrapper when the format decision says stacked", () => {
    const html = renderTimelessEditorialInvitation({
      ...TIMELESS_EDITORIAL_FIXTURE,
      partner1Name: "Alexandria Cunningham-Fairweather",
      partner2Name: "Maximilian Worthington-Blackwood",
    });
    expect(html).toMatch(/<h1 class="names-line names-line--stacked">/);
  });

  it("wraps the names in a names-line--inline wrapper when the format decision says inline", () => {
    const html = renderTimelessEditorialInvitation({ ...TIMELESS_EDITORIAL_FIXTURE, partner1Name: "Jo", partner2Name: "Al" });
    expect(html).toMatch(/<h1 class="names-line names-line--inline">/);
  });

  it("the ampersand span never appears immediately adjacent to a name with no separating markup boundary (structural check)", () => {
    // The three spans are always emitted as sibling elements on their
    // own lines in the template string, so the ampersand can never be
    // concatenated onto either name's own span content.
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).not.toMatch(/name-person">[^<]*&amp;/); // amp never inside a name-person span
    expect(html).not.toMatch(/name-amp">[^<]*(Eleanor|Julian)/); // a name never inside the amp span
  });
});

describe("mobile always stacks (CSS-level contract)", () => {
  it("forces names-line--inline into a column layout under the mobile breakpoint", () => {
    const html = renderTimelessEditorialInvitation(TIMELESS_EDITORIAL_FIXTURE);
    expect(html).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.names-line--inline\s*\{[\s\S]*?flex-direction:\s*column/,
    );
  });
});
