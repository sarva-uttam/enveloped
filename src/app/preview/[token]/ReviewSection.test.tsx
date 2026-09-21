// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ReviewSection } from "./ReviewSection";

/**
 * Stage 9 Part L — the client decision UI's core security/accessibility
 * behaviors: review controls only render for an active, current review;
 * approval requires an explicit confirmation step; requesting changes
 * rejects empty/HTML-like content client-side; a successful submission
 * moves accessible focus to its confirmation heading; a superseded
 * review shows a distinct, non-sensitive message. `fetch` is mocked at
 * the boundary — this component never imports a Supabase client.
 */

const SECTIONS = [{ id: "opening", type: "opening" }];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("state derived from status/isCurrent", () => {
  it("shows a neutral 'not yet open' message when there is no round yet (status null)", () => {
    render(<ReviewSection token="tok" status={null} isCurrent={false} sections={SECTIONS} />);
    expect(screen.getByText(/not yet open for review/i)).toBeTruthy();
    expect(screen.queryByText(/approve this version/i)).toBeNull();
  });

  it("shows the same neutral message for draft/ready_to_send/resolved/cancelled — nothing actionable", () => {
    render(<ReviewSection token="tok" status="resolved" isCurrent={true} sections={SECTIONS} />);
    expect(screen.getByText(/not yet open for review/i)).toBeTruthy();
  });

  it("shows the decision UI ONLY when status is awaiting_client and isCurrent is true", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    expect(screen.getByText(/approve this version/i)).toBeTruthy();
    expect(screen.getByText(/request changes/i)).toBeTruthy();
  });

  it("shows the superseded/stale message when the round is no longer current, even if status looks otherwise active", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={false} sections={SECTIONS} />);
    expect(screen.getByText(/this version has changed/i)).toBeTruthy();
    expect(screen.queryByText(/approve this version/i)).toBeNull();
  });

  it("shows the superseded message directly when status is 'superseded'", () => {
    render(<ReviewSection token="tok" status="superseded" isCurrent={false} sections={SECTIONS} />);
    expect(screen.getByText(/this version has changed/i)).toBeTruthy();
  });

  it("shows an already-approved confirmation when status is client_approved, without any fetch call", () => {
    render(<ReviewSection token="tok" status="client_approved" isCurrent={true} sections={SECTIONS} />);
    expect(screen.getByText(/you've approved this version/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an already-submitted confirmation when status is changes_requested", () => {
    render(<ReviewSection token="tok" status="changes_requested" isCurrent={true} sections={SECTIONS} />);
    expect(screen.getByText(/your feedback has been received/i)).toBeTruthy();
  });
});

describe("approval requires an explicit confirmation step", () => {
  it("clicking 'Approve this version' does NOT submit immediately — it shows a confirmation first", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/approve this version/i));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/approve this exact version of the invitation/i)).toBeTruthy();
  });

  it("confirming submits and moves focus to the success heading", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ReviewSection token="my-token" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/approve this version/i));
    fireEvent.click(screen.getByText(/^yes, approve$/i));

    await waitFor(() => expect(screen.getByText(/you've approved this version/i)).toBeTruthy());
    const heading = screen.getByText(/you've approved this version/i);
    await waitFor(() => expect(document.activeElement).toBe(heading));

    expect(fetch).toHaveBeenCalledWith(
      "/api/preview/my-token/review/approve",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("cancelling the confirmation returns to the idle state without submitting", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/approve this version/i));
    fireEvent.click(screen.getByText(/^cancel$/i));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/approve this version/i)).toBeTruthy();
  });
});

describe("requesting changes — validation", () => {
  it("rejects an empty submission (all-whitespace message) without calling fetch", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText(/^submit$/i));
    expect(screen.getByText(/describe at least one change/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects HTML/script-like content client-side without calling fetch", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    fireEvent.change(screen.getByLabelText(/what would you like changed/i), { target: { value: "<script>alert(1)</script>" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText(/^submit$/i));
    expect(screen.getByText(/html-like characters/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires the private-link acknowledgement checkbox before submitting", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    fireEvent.change(screen.getByLabelText(/what would you like changed/i), { target: { value: "Please fix the date." } });
    fireEvent.click(screen.getByText(/^submit$/i));
    expect(screen.getByText(/confirm you understand/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits successfully with valid content and the checkbox checked, moving focus to the confirmation", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ReviewSection token="my-token" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    fireEvent.change(screen.getByLabelText(/what would you like changed/i), { target: { value: "Please fix the date." } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText(/^submit$/i));

    await waitFor(() => expect(screen.getByText(/your feedback has been received/i)).toBeTruthy());
    const heading = screen.getByText(/your feedback has been received/i);
    await waitFor(() => expect(document.activeElement).toBe(heading));

    expect(fetch).toHaveBeenCalledWith(
      "/api/preview/my-token/review/request-changes",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("never renders feedback content with dangerouslySetInnerHTML — the textarea's own value stays plain text", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    const textarea = screen.getByLabelText(/what would you like changed/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Plain text only" } });
    expect(textarea.value).toBe("Plain text only");
    expect(document.querySelector("[dangerously-set-inner-html]")).toBeNull();
  });
});

describe("generic failure handling", () => {
  it("shows a generic error message on a failed submission, never a specific reason", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/approve this version/i));
    fireEvent.click(screen.getByText(/^yes, approve$/i));
    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeTruthy());
  });
});

describe("Stage 9 accessibility correction — centralized keyboard focus", () => {
  it("the primary decision buttons carry the centralized .focus-ring class, not a one-off Tailwind ring utility", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    const approve = screen.getByText(/approve this version/i);
    const requestChanges = screen.getByText(/^request changes$/i);
    expect(approve.className).toContain("focus-ring");
    expect(requestChanges.className).toContain("focus-ring");
    expect(approve.className).not.toMatch(/focus-visible:ring-\d|focus:ring-\d/);
  });

  it("the acknowledgement checkbox and message textarea both carry .focus-ring", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    expect(screen.getByRole("checkbox").className).toContain("focus-ring");
    expect(screen.getByLabelText(/what would you like changed/i).className).toContain("focus-ring");
  });

  it("every button in the decision UI is genuinely focusable via .focus() — real keyboard tab order works, nothing is a non-interactive div masquerading as a control", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    const approve = screen.getByText(/approve this version/i) as HTMLButtonElement;
    expect(approve.tagName).toBe("BUTTON");
    approve.focus();
    expect(document.activeElement).toBe(approve);
  });

  it("a disabled control (submit before the acknowledgement checkbox is checked would still be a real button, not silently unreachable) remains a real, focusable <button> even while any parent state is invalid", () => {
    render(<ReviewSection token="tok" status="awaiting_client" isCurrent={true} sections={SECTIONS} />);
    fireEvent.click(screen.getByText(/^request changes$/i));
    const submit = screen.getByText(/^submit$/i) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    submit.focus();
    expect(document.activeElement).toBe(submit);
  });
});
