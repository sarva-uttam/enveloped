// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { saveDraft, loadDraft, clearDraft, type SurveyDraft } from "./draft";

const SAMPLE: SurveyDraft = {
  answers: {
    category: "wedding-hindu",
    tier: "platinum",
    partnerNames: "Priya & Devansh",
    eventDate: "",
    venue: "",
    city: "",
    colorMood: "",
    song: "",
    extraDetails: "",
    guestNames: "",
  },
  guestRows: [{ id: "r1", name: "Aria Thompson" }],
  step: 2,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("survey draft autosave/restore — previously stored survey data can be restored", () => {
  it("round-trips exactly what was saved", () => {
    saveDraft(SAMPLE);
    expect(loadDraft()).toEqual(SAMPLE);
  });

  it("returns null when nothing has been saved yet", () => {
    expect(loadDraft()).toBeNull();
  });

  it("clearDraft removes it — used after a successful submission so a stale draft never resurfaces", () => {
    saveDraft(SAMPLE);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("a corrupted stored value degrades to null instead of throwing", () => {
    window.sessionStorage.setItem("enveloped:survey-draft", "{not json");
    expect(loadDraft()).toBeNull();
  });
});
