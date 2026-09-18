// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AudioPlayer } from "./AudioPlayer";

/**
 * Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part F/I). jsdom
 * implements `<audio>` as an element but not real playback — its
 * `play()`/`pause()` are stubbed here so the COMPONENT's own behavior
 * (button-gated playback, state reflecting media events, graceful error
 * handling) is exercised for real; only the browser's audio decoding
 * itself is not, which is correct — this tests the component, not the
 * browser.
 */

let playImpl: () => Promise<void>;

beforeEach(() => {
  playImpl = vi.fn(() => Promise.resolve());
  // jsdom leaves these unimplemented; give them controllable stubs.
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => playImpl(),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPlayer(props: Partial<React.ComponentProps<typeof AudioPlayer>> = {}) {
  return render(
    <AudioPlayer
      src="/audio/sample-test-tone.wav"
      title="Enveloped sample tone"
      credit={null}
      loop={false}
      startVolume={0.6}
      accent="var(--gold)"
      {...props}
    />
  );
}

describe("AudioPlayer", () => {
  it("renders a real <audio> element with NO autoplay attribute", () => {
    const { container } = renderPlayer();
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio!.hasAttribute("autoplay")).toBe(false);
    expect(audio!.getAttribute("preload")).toBe("none");
  });

  it("does not call play() on initial render — only a real click starts playback", () => {
    renderPlayer();
    expect(playImpl).not.toHaveBeenCalled();
  });

  it("calls audio.play() only when the button is activated", () => {
    renderPlayer();
    fireEvent.click(screen.getByRole("button"));
    expect(playImpl).toHaveBeenCalledTimes(1);
  });

  it("reflects the playing state (aria-pressed) once the audio element reports it", () => {
    const { container } = renderPlayer();
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    fireEvent(container.querySelector("audio")!, new Event("playing"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/now playing/i)).toBeTruthy();
  });

  it("returns to a paused state when the audio element pauses", () => {
    const { container } = renderPlayer();
    const audio = container.querySelector("audio")!;
    fireEvent.click(screen.getByRole("button"));
    fireEvent(audio, new Event("playing"));
    fireEvent(audio, new Event("pause"));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/play music/i)).toBeTruthy();
  });

  it("fails gracefully on an audio error — shows an unavailable state, disables the control, never throws", () => {
    const { container } = renderPlayer();
    expect(() => fireEvent(container.querySelector("audio")!, new Event("error"))).not.toThrow();
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/music unavailable/i)).toBeTruthy();
  });

  it("fails gracefully when play() rejects (e.g. browser blocks it)", async () => {
    playImpl = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    renderPlayer();
    fireEvent.click(screen.getByRole("button"));
    // findByText retries until the rejected promise settles and React re-renders.
    expect(await screen.findByText(/music unavailable/i)).toBeTruthy();
  });

  it("has an accessible label reflecting the current action and the track title", () => {
    renderPlayer();
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/play music: enveloped sample tone/i);
  });

  it("applies the bounded start volume to the audio element on mount", () => {
    const { container } = renderPlayer({ startVolume: 0.25 });
    expect(container.querySelector("audio")!.volume).toBeCloseTo(0.25);
  });
});
