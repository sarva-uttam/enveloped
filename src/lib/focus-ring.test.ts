import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * A TEXT-PATTERN regression guard (same shape as rls-policy.test.ts —
 * it does not render anything or compute real CSS, it only fails loudly
 * if the source drifts from the intended design) over the Stage 9
 * accessibility correction's centralized keyboard-focus treatment (see
 * PROJECT_STATUS.md's Stage 9 section and src/app/globals.css's own
 * comment on `.focus-ring`).
 *
 * Two things this guards against:
 *   1. The `.focus-ring` class definition itself silently regressing —
 *      e.g. someone "simplifying" it back to a plain `outline: none`
 *      with no visible replacement, or dropping the real `outline`
 *      layer that Windows high-contrast/forced-colors mode depends on.
 *   2. A NEW scattered, one-off `focus-visible:ring-*`/`focus:ring-*`
 *      Tailwind utility reappearing somewhere under the admin interface
 *      or the client review UI — the exact pattern this stage replaced
 *      everywhere except src/components/site/Navbar.tsx (the public
 *      homepage's own, separately-approved, already-working focus
 *      treatment, deliberately left untouched — Part of the task's own
 *      "does not alter the approved public homepage design
 *      unnecessarily").
 */

const projectRoot = path.resolve(__dirname, "../..");
const globalsCssPath = path.join(projectRoot, "src/app/globals.css");

describe(".focus-ring — centralized definition in globals.css", () => {
  const css = readFileSync(globalsCssPath, "utf8");

  it("defines exactly one `.focus-ring` rule", () => {
    const matches = css.match(/^\.focus-ring\s*\{/gm) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("keeps the base state's outline suppressed until :focus-visible", () => {
    const baseRule = css.match(/\.focus-ring\s*\{[^}]*\}/)?.[0] ?? "";
    expect(baseRule).toContain("outline: none");
  });

  it("provides a REAL outline at :focus-visible (not just box-shadow) — this is what Windows high-contrast/forced-colors mode actually renders, since that mode strips box-shadow entirely", () => {
    const focusRule = css.match(/\.focus-ring:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";
    expect(focusRule).toMatch(/outline:\s*\d+px\s+solid/);
    expect(focusRule).not.toMatch(/outline:\s*none/);
  });

  it("provides a two-color box-shadow halo (paper + ink) so contrast holds regardless of the control's own background", () => {
    const focusRule = css.match(/\.focus-ring:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";
    expect(focusRule).toContain("box-shadow");
    expect(focusRule).toContain("var(--paper)");
    expect(focusRule).toContain("var(--ink)");
  });

  it("is gated on :focus-visible, never plain :focus — so an ordinary pointer click never shows it", () => {
    expect(css).not.toMatch(/\.focus-ring:focus\s*\{/);
  });
});

describe(".focus-ring — no scattered one-off focus-ring utilities reappear", () => {
  const SCATTERED_PATTERN = /focus-visible:ring-\d|focus:ring-\d/;
  // Navbar.tsx is the ONE deliberate exception — the public homepage's
  // own, already-approved focus treatment, explicitly left untouched by
  // this stage's instructions ("does not alter the approved public
  // homepage design unnecessarily").
  const ALLOWED_EXCEPTIONS = [path.join(projectRoot, "src/components/site/Navbar.tsx")];

  function listTsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listTsxFiles(full));
      else if (entry.isFile() && (full.endsWith(".tsx") || full.endsWith(".ts")) && !full.endsWith(".test.tsx") && !full.endsWith(".test.ts")) out.push(full);
    }
    return out;
  }

  it("no admin-surface file uses a scattered focus-visible:ring-*/focus:ring-* utility instead of .focus-ring", () => {
    const offenders: string[] = [];
    for (const file of listTsxFiles(path.join(projectRoot, "src/app/admin"))) {
      if (ALLOWED_EXCEPTIONS.includes(file)) continue;
      const content = readFileSync(file, "utf8");
      if (SCATTERED_PATTERN.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no client review-UI file uses a scattered focus-visible:ring-*/focus:ring-* utility instead of .focus-ring", () => {
    const offenders: string[] = [];
    for (const file of listTsxFiles(path.join(projectRoot, "src/app/preview"))) {
      const content = readFileSync(file, "utf8");
      if (SCATTERED_PATTERN.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
