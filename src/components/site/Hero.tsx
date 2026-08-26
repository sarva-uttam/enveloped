"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { FloatingMotif } from "@/components/site/FloatingMotif";
import { useLocale } from "@/lib/i18n/LocaleContext";

export function Hero() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden border-b border-line">
      <FloatingMotif count={16} />
      <div className="relative mx-auto max-w-4xl px-6 py-28 text-center sm:py-36">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
          <Sparkles className="h-3.5 w-3.5 text-gold" />
          {t("hero.badge")}
        </span>
        <h1 className="mt-8 font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">
          {t("hero.headline1")}
          <br />
          {t("hero.headline2Pre")}
          <span className="italic text-blush">{t("hero.headline2Italic")}</span>
          {t("hero.headline2Post")}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-ink-soft">{t("hero.paragraph")}</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/survey"
            className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            {t("hero.ctaPrimary")}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised px-7 py-3.5 text-sm font-medium text-ink transition hover:border-ink"
          >
            {t("hero.ctaSecondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
