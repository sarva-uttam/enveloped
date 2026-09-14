// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import * as React from "react";

// jsdom has no real animation-frame loop, so framer-motion's
// AnimatePresence (mode="wait") never fires its exit-complete callback —
// it would otherwise hold the PREVIOUS step's content in the DOM
// forever while the underlying `step` state has already advanced (the
// progressbar, which lives outside AnimatePresence, updates fine; the
// step content does not). Stubbed here to render immediately, with no
// exit-gating, so these tests exercise the real step-machine/validation
// logic rather than framer-motion's animation-completion plumbing.
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripping framer-motion's animation-only props before forwarding the rest to a plain <div>
        ({ children, initial, animate, exit, transition, whileInView, viewport, ...rest }: Record<string, unknown>) =>
          React.createElement("div", rest, children as React.ReactNode),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const saveInvite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, saveInvite };
});

import { SurveyFlow } from "./SurveyFlow";

beforeEach(() => {
  push.mockReset();
  saveInvite.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests — fallback content is expected"))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function selectRadio(name: RegExp | string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

describe("SurveyFlow — step rendering and navigation", () => {
  it("renders the first step (category) with an intro line and a progressbar", () => {
    render(<SurveyFlow />);
    expect(screen.getByText("What are we celebrating?")).toBeTruthy();
    expect(screen.getByText(/short steps/)).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("blocks advancing without a selection and shows a validation message", () => {
    render(<SurveyFlow />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/choose an occasion/i);
    expect(screen.getByText("What are we celebrating?")).toBeTruthy();
  });

  it("Back/Continue navigate steps, and entered values survive going back and forward", () => {
    render(<SurveyFlow />);
    selectRadio(/Birthday/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    selectRadio(/Bronze/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("The essentials")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Names/), { target: { value: "Priya & Devansh" } });
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Choose your tier")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect((screen.getByLabelText(/Names/) as HTMLInputElement).value).toBe("Priya & Devansh");
  });

  it("requires a name on the details step before continuing", () => {
    render(<SurveyFlow />);
    selectRadio(/Birthday/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    selectRadio(/Bronze/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Add a name to continue.")).toBeTruthy();
  });
});

describe("SurveyFlow — guest list only for Platinum", () => {
  async function toGuestsOrReview(tierName: RegExp) {
    render(<SurveyFlow />);
    selectRadio(/Birthday/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    selectRadio(tierName);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Names/), { target: { value: "Priya & Devansh" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ })); // vibe -> next
  }

  it("Bronze never shows a guests step", async () => {
    await toGuestsOrReview(/Bronze/);
    expect(screen.getByText("Ready when you are")).toBeTruthy();
  });

  it("Platinum shows the structured guest-list step, and blocks continuing with zero named guests", async () => {
    await toGuestsOrReview(/Platinum/);
    expect(screen.getByText("Your guest list")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least one guest/i);

    fireEvent.click(screen.getByRole("button", { name: "Add your first guest" }));
    fireEvent.change(screen.getByLabelText("Guest 1 name"), { target: { value: "Aria Thompson" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Ready when you are")).toBeTruthy();
  });
});

describe("SurveyFlow — review step reflects the intended answers, and submission reaches saveInvite", () => {
  async function fillToReview() {
    render(<SurveyFlow />);
    selectRadio(/Birthday/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    selectRadio(/Platinum/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Names/), { target: { value: "Priya & Devansh" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add your first guest" }));
    fireEvent.change(screen.getByLabelText("Guest 1 name"), { target: { value: "Aria Thompson" } });
    fireEvent.click(screen.getByRole("button", { name: "Add another guest" }));
    fireEvent.change(screen.getByLabelText("Guest 2 name"), { target: { value: "Rohan Mehta" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  }

  it("the review step shows the category, tier, names, and guest count actually entered", async () => {
    await fillToReview();
    const review = screen.getByText("Ready when you are").closest("div")!;
    expect(within(review).getByText("Birthday / Milestone")).toBeTruthy();
    expect(within(review).getByText("Platinum")).toBeTruthy();
    expect(within(review).getByText("Priya & Devansh")).toBeTruthy();
    expect(within(review).getByText("2 named invites")).toBeTruthy();
  });

  it("submitting builds a GuestEntry[] from the structured rows and calls saveInvite with the existing contract", async () => {
    saveInvite.mockResolvedValue(undefined);
    await fillToReview();
    fireEvent.click(screen.getByRole("button", { name: /Generate my invite/ }));

    await waitFor(() => expect(saveInvite).toHaveBeenCalledTimes(1));
    const arg = saveInvite.mock.calls[0][0];
    expect(arg.answers.guestNames).toBe("Aria Thompson\nRohan Mehta");
    expect(arg.guestList).toHaveLength(2);
    expect(arg.guestList[0]).toMatchObject({ name: "Aria Thompson" });
    expect(arg.paid).toBe(false);
    expect(arg.publishedAt).toBeNull();
    expect(arg.composition).toBeNull();

    expect(await screen.findByText("Your invite is ready.")).toBeTruthy();
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/invite\//)), { timeout: 2000 });
  });

  it("a failed save surfaces an error instead of redirecting", async () => {
    saveInvite.mockRejectedValue(new Error("Your invite was created, but the guest list failed to save: boom"));
    await fillToReview();
    fireEvent.click(screen.getByRole("button", { name: /Generate my invite/ }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/guest list failed to save/);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("SurveyFlow — draft restore", () => {
  it("restores a previously saved draft after mount", async () => {
    window.sessionStorage.setItem(
      "enveloped:survey-draft",
      JSON.stringify({
        answers: {
          category: "birthday",
          tier: "bronze",
          partnerNames: "Priya & Devansh",
          eventDate: "",
          venue: "",
          city: "",
          colorMood: "",
          song: "",
          extraDetails: "",
          guestNames: "",
        },
        guestRows: [],
        step: 2,
      })
    );

    render(<SurveyFlow />);
    expect(await screen.findByText("The essentials")).toBeTruthy();
    expect((screen.getByLabelText(/Names/) as HTMLInputElement).value).toBe("Priya & Devansh");
  });
});
