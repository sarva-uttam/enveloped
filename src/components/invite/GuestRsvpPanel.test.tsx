// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { GuestRsvpPanel } from "./GuestRsvpPanel";

/**
 * Component tests for the guest's real RSVP experience — Stage 10.
 * Covers accessible confirmation states, the plus-one/event-level
 * conditional fields, and that the raw token is only ever used to build
 * the fetch URL (never rendered, never stored).
 */

function baseProps(overrides: Partial<React.ComponentProps<typeof GuestRsvpPanel>> = {}) {
  return {
    token: "test-token-value",
    accent: "#b8862f",
    guestName: "Aisha",
    permittedAttendees: 2,
    allowPlusOne: true,
    initialStatus: "pending" as const,
    initialAttendeeCount: 0,
    initialPlusOneName: null,
    initialDietaryNotes: null,
    initialEventAttendance: [],
    scheduleEntries: [{ id: "ceremony", label: "Ceremony" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ ok: true }) }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuestRsvpPanel — pending state", () => {
  it("prompts by the guest's own name", () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    expect(screen.getByText("Will you be joining us, Aisha?")).toBeTruthy();
  });

  it("the submit button is disabled until an attending/declining choice is made", () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    expect((screen.getByRole("button", { name: "Send RSVP" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    expect((screen.getByRole("button", { name: "Send RSVP" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the attendee-count selector and plus-one field only when attending and permitted", () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    expect(screen.queryByLabelText(/Guest name/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    fireEvent.change(screen.getByLabelText(/Number attending/), { target: { value: "2" } });

    expect(screen.getByPlaceholderText("Who's joining you?")).toBeTruthy();
  });

  it("does not show a plus-one field when the guest is not permitted one", () => {
    render(<GuestRsvpPanel {...baseProps({ allowPlusOne: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    fireEvent.change(screen.getByLabelText(/Number attending/), { target: { value: "2" } });
    expect(screen.queryByPlaceholderText("Who's joining you?")).toBeNull();
  });

  it("shows event-level attendance checkboxes when the invitation has schedule entries", () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    expect(screen.getByText("Ceremony")).toBeTruthy();
  });

  it("submits to /api/guest/<token>/rsvp with the token only in the URL, never in the body", async () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, options] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/guest/test-token-value/rsvp");
    expect(options.body).not.toContain("test-token-value");
  });

  it("declining sends attendeeCount 0 and no plus-one/dietary data", async () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Regretfully decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, options] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ status: "declined", attendeeCount: 0, plusOneName: null, dietaryNotes: null, eventAttendance: [] });
  });
});

describe("GuestRsvpPanel — accessible confirmation states", () => {
  it("an ATTENDING confirmation is announced via role=status and names the guest", async () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    const statusText = screen.getByRole("status").textContent ?? "";
    expect(statusText).toMatch(/Aisha/);
    expect(statusText).toMatch(/celebrate/);
  });

  it("a DECLINED confirmation reads differently from an attending one", async () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Regretfully decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent ?? "").toMatch(/missed/);
  });

  it("offers a way back to correct the response", async () => {
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Change my response" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Change my response" }));
    expect(screen.getByText("Will you be joining us, Aisha?")).toBeTruthy();
  });

  it("an already-attending guest sees the confirmation immediately, not the input form", () => {
    render(<GuestRsvpPanel {...baseProps({ initialStatus: "attending", initialAttendeeCount: 1 })} />);
    expect(screen.getByRole("status").textContent ?? "").toMatch(/Aisha/);
    expect(screen.queryByText("Will you be joining us, Aisha?")).toBeNull();
  });
});

describe("GuestRsvpPanel — failure handling", () => {
  it("shows an accessible alert when the submission fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }))
    );
    render(<GuestRsvpPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Joyfully accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
