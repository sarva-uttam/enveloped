"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { HeroVideo } from "@/components/site/HeroVideo";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * The homepage hero. Owner-approved direction: an owner-supplied looping
 * video (see HeroVideo.tsx / public/videos/README.md) of the invitation
 * card replaces the previous emoji-motif background; the headline,
 * description and calls to action stay real semantic HTML, never
 * anything baked into the video itself.
 *
 * The video's own composition — verified against the actual footage, not
 * assumed, and re-verified against the 2026-09-12 "Enveloped" revision
 * (see public/videos/README.md) — keeps the envelope right-of-frame on
 * the LANDSCAPE (desktop) cut, leaving a calm, plain, warm-ivory left
 * side; the PORTRAIT (mobile) cut instead centers the envelope with
 * roses flanking both sides, no comparably "safe" empty column. That's
 * a deliberate compositional difference this layout follows rather than
 * fights:
 *
 *   - DESKTOP (`md:` and up): the content column overlays the video,
 *     anchored left, sitting in that same clear zone — "do not cover the
 *     central invitation artwork unnecessarily." Legibility comes from a
 *     `--paper`-colored gradient (the site's own warm ivory, not black)
 *     fading out behind the text, never a dark scrim over the footage —
 *     "avoid an excessive dark overlay that destroys the warm ivory
 *     visual."
 *   - MOBILE (below `md`): with no equivalent safe zone to overlay onto,
 *     the content sits in its own plain area directly below the video
 *     band instead — the "or dedicated content area" alternative this
 *     brief names explicitly, and the more robust choice regardless of
 *     which exact composition a future video revision uses.
 *
 * This is one content block, not two: the same JSX switches from normal
 * document flow (mobile) to `absolute` overlay (`md:absolute`, anchored
 * to this section's own `relative` positioning) at the same breakpoint
 * HeroVideo itself switches video assets at, so nothing is duplicated in
 * the DOM and nothing can visually disagree with itself.
 */
export function Hero() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="relative h-[64vh] max-h-[620px] min-h-[440px] overflow-hidden md:h-[88vh] md:max-h-[860px] md:min-h-[560px]">
        <HeroVideo />
        {/* Desktop-only legibility scrim — the site's own warm ivory
            (--paper), never black, and only strong near the left text
            column; by ~65% across it has already faded to nothing, well
            clear of the card. */}
        <div
          className="pointer-events-none absolute inset-0 hidden md:block"
          aria-hidden="true"
          style={{
            // rgba() of the site's own --paper (#faf6f0), not color-mix()
            // — same warm-ivory fade, no modern-CSS-function dependency.
            background: "linear-gradient(to right, rgba(250,246,240,1) 0%, rgba(250,246,240,0.55) 32%, rgba(250,246,240,0) 62%)",
          }}
        />
      </div>

      <div className="px-6 py-12 text-center sm:py-14 md:absolute md:inset-0 md:flex md:items-center md:py-0 md:text-left">
        <div className="mx-auto max-w-xl md:mx-0 md:max-w-md md:pl-[7%] lg:max-w-lg lg:pl-[9%]">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised/90 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            {t("hero.badge")}
          </span>
          <h1 className="mt-6 font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl md:text-5xl lg:text-6xl">
            {t("hero.headline1")}
            <br />
            {t("hero.headline2Pre")}
            <span className="italic text-blush">{t("hero.headline2Italic")}</span>
            {t("hero.headline2Post")}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-ink-soft sm:text-lg md:mx-0">{t("hero.paragraph")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row md:justify-start">
            <Link
              href="/survey"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              {t("hero.ctaPrimary")}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/templates"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-raised/90 px-7 py-3.5 text-sm font-medium text-ink backdrop-blur-sm transition hover:border-ink"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
