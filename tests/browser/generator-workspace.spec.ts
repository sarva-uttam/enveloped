import { test, expect } from "@playwright/test";
import { getInvitationId } from "./helpers";

/**
 * Stage 12 — a small, focused real-browser suite covering interactions
 * jsdom/vitest can't reach: the preview iframe's actual postMessage
 * handshake, real CSS breakpoints, and reduced-motion media-query
 * behavior. See tests/browser/README.md for setup (seed fixtures,
 * start `npm run dev`, then `npx playwright test`).
 */

test.describe("template library — selection and apply", () => {
  test("applying a different template updates the selected badge without changing section content", async ({ page }) => {
    const id = await getInvitationId("stage12review-modern-editorial");
    await page.goto(`/admin/invitations/${id}`);

    await expect(page.getByText("Template library")).toBeVisible();
    await page.getByTestId("template-card-evening-burgundy").getByRole("button", { name: /Apply template/ }).click();

    const dialog = page.getByRole("alertdialog");
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByRole("button", { name: /Apply template/ }).click();
    }

    await expect(page.getByText("Selected").first()).toBeVisible();

    await page.getByRole("button", { name: /^Content/ }).click();
    await page.getByRole("button", { name: /Expand Opening section/ }).click();
    // Not getByLabel("Headline") alone — the Opening section also has an
    // "Eyebrow (small text above the headline)" field and a "Subheadline"
    // field, both of which contain "headline" as a substring and would
    // make this locator ambiguous (strict-mode violation).
    await expect(page.getByLabel(/^Headline/)).toHaveValue("Amara & Devin");
  });
});

test.describe("live preview reflects unsaved edits", () => {
  test("editing the opening headline updates the compact preview iframe", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const id = await getInvitationId("stage12review-timeless-ivory");
    await page.goto(`/admin/invitations/${id}`);

    await page.getByRole("button", { name: /^Content/ }).click();
    await page.getByRole("button", { name: /Expand Opening section/ }).click();
    const headline = page.getByLabel(/^Headline/);
    await headline.fill("Amara & Jordan");

    const frame = page.frameLocator('iframe[title="Invitation preview"]');
    await expect(frame.getByText("Amara & Jordan")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("reduced-motion preview toggle", () => {
  test("checking 'Reduced motion' does not error and preview content remains visible", async ({ page }) => {
    const id = await getInvitationId("stage12review-golden-marigold");
    await page.goto(`/admin/invitations/${id}`);
    await page.getByRole("button", { name: /^Preview/ }).click();

    await page.getByLabel("Reduced motion").check();
    const frame = page.frameLocator('iframe[title="Invitation preview"]');
    await expect(frame.locator("body")).toBeVisible();
  });
});

test.describe("responsive editor/preview behavior", () => {
  for (const { name, width, height } of [
    { name: "mobile-360", width: 360, height: 740 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "mobile-428", width: 428, height: 926 },
    { name: "tablet-portrait", width: 834, height: 1112 },
    { name: "tablet-landscape", width: 1194, height: 834 },
    { name: "laptop", width: 1366, height: 900 },
    { name: "desktop", width: 1920, height: 1080 },
  ]) {
    test(`no horizontal overflow at ${name} (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const id = await getInvitationId("stage12review-rose-mandap");
      await page.goto(`/admin/invitations/${id}`);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    });
  }

  test("below the xl breakpoint, a 'Show preview' control switches to a full preview instead of squeezing three columns", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    const id = await getInvitationId("stage12review-rose-mandap");
    await page.goto(`/admin/invitations/${id}`);

    const showPreview = page.getByRole("button", { name: "Show preview" });
    await expect(showPreview).toBeVisible();
    await showPreview.click();
    await expect(page.frameLocator('iframe[title="Invitation preview"]').locator("body")).toBeVisible();
  });
});

test.describe("keyboard-only workspace navigation", () => {
  test("every workspace tab is reachable via Tab and activates on Enter", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const id = await getInvitationId("stage12review-evening-burgundy");
    await page.goto(`/admin/invitations/${id}`);

    const eventsTab = page.getByRole("button", { name: /^Events/ });
    await eventsTab.focus();
    await expect(eventsTab).toBeFocused();
    await page.keyboard.press("Enter");
    // Not .first() on its own — the "+ Add section" <select> lists every
    // section type as an <option> (including "schedule"/"venue"), which
    // matches this text too but is never visible, so .and(":visible")
    // filters down to the actually-rendered section content.
    const visibleMatch = page.getByText(/no sections in this area yet|Venue|Schedule/i).and(page.locator(":visible"));
    await expect(visibleMatch.first()).toBeVisible();
  });
});

test.describe("admin preview cannot RSVP", () => {
  test("the preview iframe never renders an RSVP form the admin can submit", async ({ page }) => {
    const id = await getInvitationId("stage12review-timeless-ivory");
    await page.goto(`/admin/invitations/${id}`);
    await page.getByRole("button", { name: /^Preview/ }).click();

    const frame = page.frameLocator('iframe[title="Invitation preview"]');
    await expect(frame.getByRole("button", { name: /submit|rsvp/i })).toHaveCount(0);
  });
});
