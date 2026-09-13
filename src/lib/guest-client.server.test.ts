import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const mockServerClient = { rpc: (...args: unknown[]) => rpc(...args) };
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => createServerSupabaseClient(...args),
}));

import { getGuestInviteServer, submitGuestRsvp } from "./guest-client.server";
import { GUEST_TOKEN_LENGTH } from "./guest-tokens.server";

const VALID_TOKEN = "a".repeat(GUEST_TOKEN_LENGTH);

beforeEach(() => {
  vi.clearAllMocks();
  createServerSupabaseClient.mockResolvedValue(mockServerClient);
});

describe("getGuestInviteServer", () => {
  it("returns null for a malformed token without calling the database", async () => {
    const result = await getGuestInviteServer("too-short");
    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a valid RPC row to the sanitized view model", async () => {
    rpc.mockReturnValue({
      maybeSingle: () =>
        Promise.resolve({
          data: {
            invite_id: "i1",
            slug: "our-wedding",
            tier: "gold",
            content: { headline: "Hi" },
            composition: null,
            guest_id: "g1",
            guest_name: "Jane Doe",
            permitted_attendees: 2,
            allow_plus_one: true,
            rsvp_status: "pending",
            attendee_count: 0,
            plus_one_name: null,
            dietary_notes: null,
            event_attendance: [],
          },
          error: null,
        }),
    });

    const result = await getGuestInviteServer(VALID_TOKEN);
    expect(result).toEqual({
      inviteId: "i1",
      slug: "our-wedding",
      tier: "gold",
      content: { headline: "Hi" },
      composition: null,
      guestId: "g1",
      guestName: "Jane Doe",
      permittedAttendees: 2,
      allowPlusOne: true,
      rsvpStatus: "pending",
      attendeeCount: 0,
      plusOneName: null,
      dietaryNotes: null,
      eventAttendance: [],
    });
  });

  it("returns null when the RPC errors or returns nothing", async () => {
    rpc.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
    expect(await getGuestInviteServer(VALID_TOKEN)).toBeNull();
  });
});

describe("submitGuestRsvp", () => {
  it("rejects a malformed token without calling the database", async () => {
    const result = await submitGuestRsvp("bad-token", { status: "attending", attendeeCount: 1 });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid input (bad status) before calling the database", async () => {
    const result = await submitGuestRsvp(VALID_TOKEN, { status: "maybe", attendeeCount: 1 });
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an attendee count outside the schema bound before calling the database", async () => {
    const result = await submitGuestRsvp(VALID_TOKEN, { status: "attending", attendeeCount: 999 });
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects HTML-like content in free-text fields", async () => {
    const result = await submitGuestRsvp(VALID_TOKEN, {
      status: "attending",
      attendeeCount: 1,
      dietaryNotes: "<script>alert(1)</script>",
    });
    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("submits a well-formed request and maps 'ok' to success", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    const result = await submitGuestRsvp(VALID_TOKEN, { status: "attending", attendeeCount: 2, plusOneName: "Sam" });
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("submit_guest_rsvp", {
      p_token: VALID_TOKEN,
      p_status: "attending",
      p_attendee_count: 2,
      p_plus_one_name: "Sam",
      p_dietary_notes: null,
      p_event_attendance: [],
    });
  });

  it("maps every RPC-level failure to the identical generic 'unavailable' reason", async () => {
    rpc.mockResolvedValue({ data: "unavailable", error: null });
    const result = await submitGuestRsvp(VALID_TOKEN, { status: "attending", attendeeCount: 1 });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never logs or echoes the raw token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await submitGuestRsvp(VALID_TOKEN, { status: "attending", attendeeCount: 1 });
    for (const call of spy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(VALID_TOKEN);
      }
    }
    spy.mockRestore();
  });
});
