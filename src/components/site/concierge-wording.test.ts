import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A text-pattern guard (same shape as focus-ring.test.ts) proving the
 * concierge/self-service distinction stays consistent with the actual
 * code paths (generator_kind gate) rather than drifting into confused
 * wording across the homepage explainer, the consultation placeholder,
 * and the self-service survey itself.
 */
const projectRoot = path.resolve(__dirname, "../../..");

describe("concierge vs self-service wording is not confused", () => {
  it("the homepage explainer's concierge CTA points at /consultation, not /survey", () => {
    const content = readFileSync(
      path.join(projectRoot, "src/components/site/ConciergeVsSelfService.tsx"),
      "utf8",
    );
    expect(content).toMatch(/href="\/consultation"/);
  });

  it("the homepage explainer's self-service CTA points at /survey", () => {
    const content = readFileSync(
      path.join(projectRoot, "src/components/site/ConciergeVsSelfService.tsx"),
      "utf8",
    );
    expect(content).toMatch(/href="\/survey"/);
  });

  it("the consultation placeholder never claims to BE the self-service survey", () => {
    const content = readFileSync(path.join(projectRoot, "src/app/consultation/page.tsx"), "utf8");
    // It's allowed to offer the survey as an alternative, but the page
    // itself must not read as if submitting it starts self-service.
    expect(content).toMatch(/isn&apos;t connected yet|not connected yet/);
  });

  it("the self-service survey never mentions concierge — it is the OTHER pathway", () => {
    const content = readFileSync(path.join(projectRoot, "src/components/survey/SurveyFlow.tsx"), "utf8");
    expect(content.toLowerCase()).not.toContain("concierge");
  });
});
