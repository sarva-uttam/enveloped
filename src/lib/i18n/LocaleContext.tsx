"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, TRANSLATIONS, type LocaleCode } from "./translations";

const STORAGE_KEY = "enveloped:locale";
// Fired on same-tab writes so useSyncExternalStore re-reads immediately —
// the native "storage" event only fires in OTHER tabs/windows.
const LOCALE_EVENT = "enveloped:locale-change";

interface LocaleContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCALE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCALE_EVENT, callback);
  };
}

function getSnapshot(): LocaleCode {
  const saved = window.localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
  return saved && TRANSLATIONS[saved] ? saved : DEFAULT_LOCALE;
}

function getServerSnapshot(): LocaleCode {
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Reads localStorage via React's official external-store API instead of
  // an effect + setState — avoids both the set-state-in-effect lint rule
  // and any SSR/hydration-mismatch risk from reading `window` in a lazy
  // useState initializer (window doesn't exist during the server render).
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setLocale(next: LocaleCode) {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }

  function t(key: string): string {
    return TRANSLATIONS[locale][key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
