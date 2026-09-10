// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { AtmosphericEffect } from "./AtmosphericEffect";

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part D/I).
 */

function setReducedMotion(reduce: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? reduce : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeEach(() => setReducedMotion(false));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AtmosphericEffect", () => {
  it("renders nothing when intensity is 'none'", () => {
    const { container } = render(<AtmosphericEffect designPackId="hindu-wedding" intensity="none" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing at all when the viewer prefers reduced motion — not a slower version, nothing", () => {
    setReducedMotion(true);
    const { container } = render(<AtmosphericEffect designPackId="hindu-wedding" intensity="full" />);
    expect(container.firstChild).toBeNull();
  });

  it("the wrapper is aria-hidden and pointer-events-none — purely decorative, never intercepts a tap", () => {
    const { container } = render(<AtmosphericEffect designPackId="neutral-classic" intensity="light" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.className).toContain("pointer-events-none");
  });

  it("hindu-wedding uses drifting petal glyphs, bounded by the existing FloatingMotif count", () => {
    const { container } = render(<AtmosphericEffect designPackId="hindu-wedding" intensity="full" />);
    const drifting = container.querySelectorAll(".animate-drift");
    expect(drifting.length).toBe(20); // "full" — never more than the Stage 4/6 bound
    const light = render(<AtmosphericEffect designPackId="hindu-wedding" intensity="light" />);
    expect(light.container.querySelectorAll(".animate-drift").length).toBe(10);
    light.unmount();
  });

  it("neutral-classic uses a small number of soft-glow highlights — no particles/petals", () => {
    const { container } = render(<AtmosphericEffect designPackId="neutral-classic" intensity="full" />);
    expect(container.querySelectorAll(".animate-drift").length).toBe(0);
    const glows = container.querySelectorAll(".animate-glow-pulse");
    expect(glows.length).toBeGreaterThan(0);
    expect(glows.length).toBeLessThanOrEqual(4);
  });

  it("pauses (via data-effects-paused) when the page is hidden, resumes when visible", () => {
    const { container } = render(<AtmosphericEffect designPackId="hindu-wedding" intensity="light" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("data-effects-paused")).toBe("false");

    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(wrapper.getAttribute("data-effects-paused")).toBe("true");

    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(wrapper.getAttribute("data-effects-paused")).toBe("false");
  });

  it("removes its visibilitychange listener on unmount (no leaked listener / bounded lifetime)", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<AtmosphericEffect designPackId="hindu-wedding" intensity="light" />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
