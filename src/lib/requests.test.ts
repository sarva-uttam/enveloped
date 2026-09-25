import { describe, it, expect } from "vitest";
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TRANSITIONS,
  isRequestStatus,
  isValidRequestStatusTransition,
} from "./requests";

describe("REQUEST_STATUSES / labels", () => {
  it("every status has a human label", () => {
    for (const status of REQUEST_STATUSES) {
      expect(REQUEST_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("isRequestStatus accepts only the real vocabulary", () => {
    for (const status of REQUEST_STATUSES) {
      expect(isRequestStatus(status)).toBe(true);
    }
    expect(isRequestStatus("quoted")).toBe(false); // old, pre-Stage-8 vocabulary
    expect(isRequestStatus("paid")).toBe(false); // payment is not a request status
    expect(isRequestStatus("")).toBe(false);
    expect(isRequestStatus("NEW")).toBe(false);
  });
});

describe("request status transition graph — mirrors the database trigger", () => {
  it("archived is terminal — no transitions out of it", () => {
    expect(REQUEST_STATUS_TRANSITIONS.archived).toEqual([]);
  });

  it("every status is reachable from 'new' by some forward path (except archived's own dead end)", () => {
    // A cheap reachability check across the whole graph — every status
    // except the starting point should show up as someone's transition
    // target somewhere.
    const allTargets = new Set(Object.values(REQUEST_STATUS_TRANSITIONS).flat());
    for (const status of REQUEST_STATUSES) {
      if (status === "new") continue;
      expect(allTargets.has(status)).toBe(true);
    }
  });

  it("the full happy-path sequence is valid step by step", () => {
    const path = ["new", "contacted", "consultation", "accepted", "in_production", "preview_sent", "completed", "archived"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidRequestStatusTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("declining is allowed from every non-terminal status", () => {
    for (const status of ["new", "contacted", "consultation", "accepted", "in_production", "preview_sent"] as const) {
      expect(isValidRequestStatusTransition(status, "declined")).toBe(true);
    }
  });

  it("skipping forward is rejected", () => {
    expect(isValidRequestStatusTransition("new", "accepted")).toBe(false);
    expect(isValidRequestStatusTransition("new", "completed")).toBe(false);
    expect(isValidRequestStatusTransition("contacted", "in_production")).toBe(false);
  });

  it("un-declining and un-completing are rejected — only archiving is allowed from a terminal-ish state", () => {
    expect(isValidRequestStatusTransition("declined", "new")).toBe(false);
    expect(isValidRequestStatusTransition("declined", "contacted")).toBe(false);
    expect(isValidRequestStatusTransition("completed", "in_production")).toBe(false);
    expect(isValidRequestStatusTransition("declined", "archived")).toBe(true);
    expect(isValidRequestStatusTransition("completed", "archived")).toBe(true);
  });

  it("preview_sent can go back to in_production for revisions", () => {
    expect(isValidRequestStatusTransition("preview_sent", "in_production")).toBe(true);
  });

  it("nothing transitions out of archived", () => {
    for (const status of REQUEST_STATUSES) {
      expect(isValidRequestStatusTransition("archived", status)).toBe(false);
    }
  });
});
