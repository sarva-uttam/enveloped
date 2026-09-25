import type { SurveyAnswers } from "@/lib/types";
import type { GuestRow } from "./guest-utils";

const DRAFT_KEY = "enveloped:survey-draft";

export interface SurveyDraft {
  answers: SurveyAnswers;
  guestRows: GuestRow[];
  step: number;
}

/**
 * Client-only, sessionStorage-backed autosave — deliberately NOT a
 * backend feature (no new API, no database write). Session-scoped (not
 * localStorage) so an abandoned draft on a shared/public computer
 * doesn't linger indefinitely; closing the tab clears it, same as most
 * "restore my form" patterns. Every call is guarded for SSR/no-window
 * and wrapped so a private-browsing/storage-disabled visitor degrades to
 * "no draft," never a thrown error.
 */
export function saveDraft(draft: SurveyDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage disabled/full — the survey still works, it just won't restore.
  }
}

export function loadDraft(): SurveyDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SurveyDraft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
