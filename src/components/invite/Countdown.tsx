"use client";

import { useEffect, useState } from "react";

function getParts(target: number) {
  const diff = Math.max(0, target - Date.now());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds };
}

export function Countdown({ date, accent }: { date: string; accent: string }) {
  const target = new Date(date).getTime();
  const [parts, setParts] = useState<ReturnType<typeof getParts> | null>(() =>
    Number.isFinite(target) ? getParts(target) : null
  );
  // Tracks the target we last computed `parts` for, so a changed `date`
  // prop updates the displayed countdown immediately (during render, not
  // via a synchronous setState inside the effect below) rather than
  // waiting up to 1s for the interval to catch up.
  const [trackedTarget, setTrackedTarget] = useState(target);
  if (target !== trackedTarget) {
    setTrackedTarget(target);
    setParts(Number.isFinite(target) ? getParts(target) : null);
  }

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const id = setInterval(() => setParts(getParts(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const cells = [
    { label: "Days", value: parts?.days },
    { label: "Hours", value: parts?.hours },
    { label: "Minutes", value: parts?.minutes },
    { label: "Seconds", value: parts?.seconds },
  ];

  return (
    <div className="flex justify-center gap-4">
      {cells.map((c) => (
        <div key={c.label} className="flex w-16 flex-col items-center rounded-xl border border-line bg-paper-raised/70 py-3">
          <span className="font-display text-2xl" style={{ color: accent }}>
            {c.value === undefined ? "--" : String(c.value).padStart(2, "0")}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-ink-soft">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
