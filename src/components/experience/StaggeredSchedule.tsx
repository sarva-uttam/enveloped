"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { SCHEDULE_STAGGER_INTERVAL } from "@/lib/motion/presets";

/**
 * The "staggered schedule" preset's per-entry reveal — Stage 7 (see
 * PROJECT_STATUS.md's Stage 7 section, Part E). Renders the SAME
 * `<dl>`/`<dt>`/`<dd>` semantic structure `ScheduleSection` renders
 * without it — document order and heading semantics are identical, each
 * label/value pair still a real `<dt>`/`<dd>` inside a `<dl>` — only
 * adding a short sequential fade/rise to each entry once it scrolls
 * into view. The interval is a fixed, trusted constant
 * (SCHEDULE_STAGGER_INTERVAL, src/lib/motion/presets.ts), never
 * composition-supplied.
 *
 * Under reduced motion: renders the plain `<dl>` with no motion
 * wrappers at all — every entry visible immediately, nothing to wait
 * for. `whileInView` with `once: true` means each entry animates a
 * single time and then stays put — "animate each section only once by
 * default," "no content jumping."
 */
export function StaggeredSchedule({
  entries,
  accent,
}: {
  entries: { id: string; label: string; value: string }[];
  accent: string;
}) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <dl className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left">
            <dt className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
              {entry.label}
            </dt>
            <dd className="mt-1 text-sm text-ink">{entry.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <motion.dl
      className="grid gap-3 sm:grid-cols-2"
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: SCHEDULE_STAGGER_INTERVAL } } }}
    >
      {entries.map((entry) => (
        <motion.div
          key={entry.id}
          data-motion-reveal="true"
          className="rounded-2xl border border-line bg-paper-raised/70 p-5 text-left"
          variants={{ hidden: { opacity: 0, y: 16 }, shown: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <dt className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
            {entry.label}
          </dt>
          <dd className="mt-1 text-sm text-ink">{entry.value}</dd>
        </motion.div>
      ))}
    </motion.dl>
  );
}
