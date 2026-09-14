"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, PartyPopper, Sparkles } from "lucide-react";
import { EVENT_CATEGORIES, CATEGORY_ICONS } from "@/lib/categories";
import { TIERS } from "@/lib/tiers";
import type { EventCategory, SurveyAnswers, TierId } from "@/lib/types";
import { cn, slugify } from "@/lib/utils";
import { buildFallbackContent } from "@/lib/fallback-content";
import { saveInvite, NotAuthenticatedError } from "@/lib/storage";
import { SurveyProgress } from "./SurveyProgress";
import { Field, TextArea, ReviewRow } from "./SurveyFields";
import { GuestListStep } from "./GuestListStep";
import { type GuestRow, buildGuestEntries, guestRowsToNamesString, nonEmptyGuestCount } from "./guest-utils";
import { loadDraft, saveDraft, clearDraft } from "./draft";

const EMPTY_ANSWERS: SurveyAnswers = {
  category: null,
  tier: null,
  partnerNames: "",
  eventDate: "",
  venue: "",
  city: "",
  colorMood: "",
  song: "",
  extraDetails: "",
  guestNames: "",
};

export function SurveyFlow({
  initialCategory,
  initialTier,
}: {
  initialCategory?: EventCategory;
  initialTier?: TierId;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({
    ...EMPTY_ANSWERS,
    category: initialCategory ?? null,
    tier: initialTier ?? null,
  });
  const [guestRows, setGuestRows] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [attemptedAdvance, setAttemptedAdvance] = useState(false);
  const restoredRef = useRef(false);

  const isPlatinum = answers.tier === "platinum";

  const steps = useMemo(
    () =>
      [
        "category",
        "tier",
        "details",
        "vibe",
        isPlatinum ? "guests" : null,
        "review",
      ].filter(Boolean) as string[],
    [isPlatinum]
  );

  const current = steps[step] ?? steps[steps.length - 1];

  // Restore an abandoned draft AFTER mount only — never in the initial
  // render (a lazy useState initializer would run during the client's
  // hydration render too, reading real sessionStorage there while the
  // server's render saw none, which is exactly the hydration-mismatch
  // bug useReducedMotion/useLocale's own comments already guard against
  // elsewhere in this codebase). A genuine one-time, mount-only external
  // read with an empty dependency array — not the cascading-render
  // pattern react-hooks/set-state-in-effect warns about.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const draft = loadDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount restore from sessionStorage, not a cascading update
      setAnswers(draft.answers);
      setGuestRows(draft.guestRows);
      setStep(draft.step);
    }
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    saveDraft({ answers, guestRows, step });
  }, [answers, guestRows, step]);

  // "Adjusting state when a prop changes" done during render (React's own
  // recommended idiom for this), not in an effect — avoids both the
  // extra render pass an effect would cause and the set-state-in-effect
  // lint rule entirely.
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (current !== prevCurrent) {
    setPrevCurrent(current);
    setAttemptedAdvance(false);
  }

  function update<K extends keyof SurveyAnswers>(key: K, value: SurveyAnswers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function canAdvance() {
    if (current === "category") return !!answers.category;
    if (current === "tier") return !!answers.tier;
    if (current === "details") return answers.partnerNames.trim().length > 0;
    if (current === "guests") return nonEmptyGuestCount(guestRows) > 0;
    return true;
  }

  function goNext() {
    if (canAdvance()) {
      setStep((s) => Math.min(steps.length - 1, s + 1));
    } else {
      setAttemptedAdvance(true);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const submittedAnswers: SurveyAnswers = {
      ...answers,
      guestNames: isPlatinum ? guestRowsToNamesString(guestRows) : "",
    };

    let content;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submittedAnswers),
      });
      if (!res.ok) throw new Error("generation failed");
      content = await res.json();
    } catch {
      content = buildFallbackContent(submittedAnswers);
    }

    const id = `${slugify(submittedAnswers.partnerNames || submittedAnswers.category || "invite")}-${Date.now().toString(36)}`;
    const guestList = isPlatinum ? buildGuestEntries(guestRows) : [];

    try {
      await saveInvite({
        id,
        answers: submittedAnswers,
        content,
        guestList,
        createdAt: new Date().toISOString(),
        paid: false,
        // Never published at creation — publication is an administrator
        // action (Stage 3), never automatic on creation or payment.
        publishedAt: null,
        // A self-service invite has no real composition at creation
        // time — it renders through src/lib/composition/legacy-adapter.ts
        // from `content` above until Stage 7's authoring surface (or a
        // future administrator) gives it a real one. See
        // PROJECT_STATUS.md's Stage 6 section.
        composition: null,
      });
    } catch (err) {
      setLoading(false);
      if (err instanceof NotAuthenticatedError) {
        router.push(`/login?next=${encodeURIComponent("/survey")}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save your invite. Please try again.");
      return;
    }

    clearDraft();
    setLoading(false);
    setSubmitted(true);
    window.setTimeout(() => router.push(`/invite/${id}`), 1100);
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-32 text-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-blush/15 text-blush"
        >
          <PartyPopper className="h-7 w-7" />
        </motion.div>
        <h2 className="mt-6 font-display text-3xl">Your invite is ready.</h2>
        <p className="mt-2 text-ink-soft">Taking you there now&hellip;</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      {step === 0 && (
        <p className="mb-6 text-sm text-ink-soft">
          A couple of minutes, {steps.length} short steps — we&apos;ll write and
          design your invite from your answers at the end.
        </p>
      )}

      <SurveyProgress steps={steps} currentIndex={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.25 }}
        >
          {current === "category" && (
            <div>
              <h2 className="font-display text-3xl">What are we celebrating?</h2>
              <p className="mt-2 text-ink-soft">Pick the closest match — you can add details later.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Occasion">
                {EVENT_CATEGORIES.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat.id];
                  const selected = answers.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => update("category", cat.id)}
                      className={cn(
                        "focus-ring flex items-start gap-3 rounded-sm border p-4 text-left transition",
                        selected ? "border-ink bg-paper-raised shadow-sm" : "border-line hover:border-ink-soft"
                      )}
                    >
                      <Icon className={cn("h-5 w-5 shrink-0", selected ? "text-blush" : "text-ink-soft")} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{cat.label}</div>
                        <div className="mt-0.5 text-xs text-ink-soft">{cat.blurb}</div>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-blush" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              {attemptedAdvance && !canAdvance() && (
                <p role="alert" className="mt-4 text-sm text-burgundy">Choose an occasion to continue.</p>
              )}
            </div>
          )}

          {current === "tier" && (
            <div>
              <h2 className="font-display text-3xl">Choose your tier</h2>
              <p className="mt-2 text-ink-soft">You can compare full details on the pricing page anytime.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tier">
                {TIERS.map((tier) => {
                  const selected = answers.tier === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => update("tier", tier.id)}
                      className={cn(
                        "focus-ring rounded-sm border p-5 text-left transition",
                        selected ? "border-ink bg-paper-raised shadow-sm" : "border-line hover:border-ink-soft"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium uppercase tracking-wide" style={{ color: tier.colorVar }}>
                          {tier.name}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-display text-xl">${tier.price}</span>
                          {selected && <Check className="h-4 w-4 text-blush" aria-hidden="true" />}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-ink-soft">{tier.tagline}</p>
                    </button>
                  );
                })}
              </div>
              {attemptedAdvance && !canAdvance() && (
                <p role="alert" className="mt-4 text-sm text-burgundy">Choose a tier to continue.</p>
              )}
            </div>
          )}

          {current === "details" && (
            <div>
              <h2 className="font-display text-3xl">The essentials</h2>
              <p className="mt-2 text-ink-soft">Who, when, and where.</p>
              <div className="mt-8 space-y-4">
                <Field
                  label="Names (e.g. Priya & Devansh)"
                  value={answers.partnerNames}
                  onChange={(v) => update("partnerNames", v)}
                  placeholder="Your names or the guest of honor"
                  required
                  error={attemptedAdvance && !answers.partnerNames.trim() ? "Add a name to continue." : undefined}
                />
                <Field
                  label="Event date"
                  type="datetime-local"
                  value={answers.eventDate}
                  onChange={(v) => update("eventDate", v)}
                />
                <Field
                  label="Venue"
                  value={answers.venue}
                  onChange={(v) => update("venue", v)}
                  placeholder="The Garden Hall"
                />
                <Field
                  label="City"
                  value={answers.city}
                  onChange={(v) => update("city", v)}
                  placeholder="Austin, TX"
                />
              </div>
            </div>
          )}

          {current === "vibe" && (
            <div>
              <h2 className="font-display text-3xl">Set the mood</h2>
              <p className="mt-2 text-ink-soft">Colors, music, and anything else your guests should know.</p>
              <div className="mt-8 space-y-4">
                <Field
                  label="Color / mood"
                  value={answers.colorMood}
                  onChange={(v) => update("colorMood", v)}
                  placeholder="Blush and gold, romantic evening"
                />
                <Field
                  label="A song that means something to you"
                  value={answers.song}
                  onChange={(v) => update("song", v)}
                  placeholder="Perfect — Ed Sheeran"
                />
                <TextArea
                  label="Anything else? (dress code, story, special notes)"
                  value={answers.extraDetails}
                  onChange={(v) => update("extraDetails", v)}
                  placeholder="We met in college and..."
                />
              </div>
            </div>
          )}

          {current === "guests" && (
            <GuestListStep rows={guestRows} onChange={setGuestRows} showValidation={attemptedAdvance} />
          )}

          {current === "review" && (
            <div>
              <h2 className="font-display text-3xl">Ready when you are</h2>
              <p className="mt-2 text-ink-soft">
                We&apos;ll write and design your invite from these answers.
              </p>
              <div className="mt-8 space-y-1 rounded-sm border border-line bg-paper-raised p-6">
                <ReviewRow label="Category" value={EVENT_CATEGORIES.find((c) => c.id === answers.category)?.label} />
                <ReviewRow label="Tier" value={TIERS.find((t) => t.id === answers.tier)?.name} />
                <ReviewRow label="Names" value={answers.partnerNames} />
                <ReviewRow label="Date" value={answers.eventDate} />
                <ReviewRow label="Venue" value={[answers.venue, answers.city].filter(Boolean).join(", ")} />
                {isPlatinum && (
                  <ReviewRow label="Guests" value={`${nonEmptyGuestCount(guestRows)} named invites`} />
                )}
              </div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-burgundy">{error}</p>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="focus-ring mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating your invite…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate my invite
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || loading}
          className="focus-ring inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-soft transition hover:text-ink disabled:pointer-events-none disabled:opacity-0"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {current !== "review" && (
          <button
            type="button"
            onClick={goNext}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
