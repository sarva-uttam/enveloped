"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { EVENT_CATEGORIES, CLICK_TEASERS } from "@/lib/categories";
import { TIERS } from "@/lib/tiers";
import type { EventCategory, GuestEntry, SurveyAnswers, TierId } from "@/lib/types";
import { cn, slugify } from "@/lib/utils";
import { buildFallbackContent } from "@/lib/fallback-content";
import { saveInvite } from "@/lib/storage";

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

function buildGuestList(raw: string): GuestEntry[] {
  const names = raw
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean);

  return names.map((name, i) => ({
    id: `${slugify(name)}-${i}`,
    name,
    slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
    viewed: false,
    clickTeaser: CLICK_TEASERS[i % CLICK_TEASERS.length],
  }));
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const current = steps[step];

  function update<K extends keyof SurveyAnswers>(key: K, value: SurveyAnswers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function canAdvance() {
    if (current === "category") return !!answers.category;
    if (current === "tier") return !!answers.tier;
    if (current === "details") return answers.partnerNames.trim().length > 0;
    return true;
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    let content;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error("generation failed");
      content = await res.json();
    } catch {
      content = buildFallbackContent(answers);
    }

    const id = `${slugify(answers.partnerNames || answers.category || "invite")}-${Date.now().toString(36)}`;
    const guestList = isPlatinum ? buildGuestList(answers.guestNames) : [];

    await saveInvite({
      id,
      answers,
      content,
      guestList,
      createdAt: new Date().toISOString(),
      paid: false,
    });

    setLoading(false);
    router.push(`/invite/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-10 flex items-center gap-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-ink" : "bg-line"
            )}
          />
        ))}
      </div>

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
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {EVENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => update("category", cat.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
                      answers.category === cat.id
                        ? "border-ink bg-paper-raised shadow-sm"
                        : "border-line hover:border-ink-soft"
                    )}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <div>
                      <div className="text-sm font-medium">{cat.label}</div>
                      <div className="mt-0.5 text-xs text-ink-soft">{cat.blurb}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {current === "tier" && (
            <div>
              <h2 className="font-display text-3xl">Choose your tier</h2>
              <p className="mt-2 text-ink-soft">You can compare full details on the pricing page anytime.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => update("tier", tier.id)}
                    className={cn(
                      "rounded-2xl border p-5 text-left transition",
                      answers.tier === tier.id
                        ? "border-ink bg-paper-raised shadow-sm"
                        : "border-line hover:border-ink-soft"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium uppercase tracking-wide" style={{ color: tier.colorVar }}>
                        {tier.name}
                      </span>
                      <span className="font-display text-xl">${tier.price}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-soft">{tier.tagline}</p>
                  </button>
                ))}
              </div>
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
            <div>
              <h2 className="font-display text-3xl">Your guest list</h2>
              <p className="mt-2 text-ink-soft">
                Platinum generates a uniquely named invite for each person here — one name per line or comma-separated.
              </p>
              <TextArea
                label="Guest names"
                value={answers.guestNames}
                onChange={(v) => update("guestNames", v)}
                placeholder={"Aria Thompson\nRohan Mehta\nThe Alvarez Family"}
                rows={8}
              />
            </div>
          )}

          {current === "review" && (
            <div>
              <h2 className="font-display text-3xl">Ready when you are</h2>
              <p className="mt-2 text-ink-soft">
                We&apos;ll write and design your invite from these answers.
              </p>
              <div className="mt-8 space-y-2 rounded-2xl border border-line bg-paper-raised p-6 text-sm">
                <ReviewRow label="Category" value={EVENT_CATEGORIES.find((c) => c.id === answers.category)?.label} />
                <ReviewRow label="Tier" value={TIERS.find((t) => t.id === answers.tier)?.name} />
                <ReviewRow label="Names" value={answers.partnerNames} />
                <ReviewRow label="Date" value={answers.eventDate} />
                <ReviewRow label="Venue" value={[answers.venue, answers.city].filter(Boolean).join(", ")} />
                {isPlatinum && (
                  <ReviewRow
                    label="Guests"
                    value={`${answers.guestNames.split(/[\n,]/).filter((s) => s.trim()).length} named invites`}
                  />
                )}
              </div>
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
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
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || loading}
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-ink disabled:opacity-0"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {current !== "review" && (
          <button
            onClick={() => canAdvance() && setStep((s) => Math.min(steps.length - 1, s + 1))}
            disabled={!canAdvance()}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-line bg-paper-raised px-4 py-3 text-sm outline-none transition focus:border-ink"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1.5 w-full rounded-xl border border-line bg-paper-raised px-4 py-3 text-sm outline-none transition focus:border-ink"
      />
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 py-1.5 last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium text-ink">{value || "—"}</span>
    </div>
  );
}
