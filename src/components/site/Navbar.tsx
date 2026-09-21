"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, Menu, X } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { LOCALES, type LocaleCode } from "@/lib/i18n/translations";
import { useAuth } from "@/lib/auth/AuthContext";

export function Navbar() {
  const { locale, setLocale, t } = useLocale();
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const LINKS = [
    { href: "/templates", label: t("nav.templates") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-2xl tracking-tight text-ink">
          Envel<span className="italic text-blush">oped</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-ink-soft transition hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="relative hidden items-center sm:inline-flex">
            <Globe className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-soft" />
            <select
              aria-label="Language"
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleCode)}
              className="appearance-none rounded-full border border-line bg-paper-raised py-1.5 pl-8 pr-3 text-xs font-medium text-ink-soft transition hover:border-ink hover:text-ink focus:outline-none focus:ring-1 focus:ring-ink"
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <Link
            href="/dashboard"
            className="hidden text-sm text-ink-soft transition hover:text-ink sm:inline"
          >
            {t("nav.myInvites")}
          </Link>
          {!loading && (
            <>
              {user ? (
                <button
                  onClick={() => signOut()}
                  title={user.email ?? undefined}
                  className="hidden text-sm text-ink-soft transition hover:text-ink sm:inline"
                >
                  Sign out
                </button>
              ) : (
                <Link
                  href="/login"
                  className="hidden text-sm text-ink-soft transition hover:text-ink sm:inline"
                >
                  Sign in
                </Link>
              )}
            </>
          )}
          <Link
            href="/survey"
            className="hidden shrink-0 whitespace-nowrap rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft sm:inline-flex"
          >
            {t("nav.startMyInvite")}
          </Link>
          {/* Mobile: everything above sm/md collapses to just logo + this
              disclosure toggle — previously there was no way at all to
              reach Templates/Pricing/How-it-works/locale/auth on a small
              screen except scrolling to the footer. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-panel"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition hover:border-ink md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-nav-panel" className="border-t border-line bg-paper px-6 py-5 md:hidden">
          <nav className="flex flex-col gap-4">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="focus-ring rounded-sm text-base text-ink-soft transition hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
              className="focus-ring rounded-sm text-base text-ink-soft transition hover:text-ink"
            >
              {t("nav.myInvites")}
            </Link>
            {!loading && (
              <>
                {user ? (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className="focus-ring rounded-sm text-left text-base text-ink-soft transition hover:text-ink"
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="focus-ring rounded-sm text-base text-ink-soft transition hover:text-ink"
                  >
                    Sign in
                  </Link>
                )}
              </>
            )}
          </nav>
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-5">
            <div className="relative inline-flex items-center">
              <Globe className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-soft" />
              <select
                aria-label="Language"
                value={locale}
                onChange={(e) => setLocale(e.target.value as LocaleCode)}
                className="appearance-none rounded-full border border-line bg-paper-raised py-1.5 pl-8 pr-3 text-xs font-medium text-ink-soft"
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <Link
              href="/survey"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              {t("nav.startMyInvite")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
