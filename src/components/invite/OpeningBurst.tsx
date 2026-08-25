"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

export function OpeningBurst({ colors }: { colors: string[] }) {
  useEffect(() => {
    const duration = 2200;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 65,
        origin: { x: 0, y: 0.3 },
        colors,
        scalar: 1.1,
        gravity: 0.7,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 65,
        origin: { x: 1, y: 0.3 },
        colors,
        scalar: 1.1,
        gravity: 0.7,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();

    confetti({
      particleCount: 60,
      spread: 100,
      origin: { y: 0.2 },
      colors,
      scalar: 1,
      gravity: 0.6,
      startVelocity: 35,
    });
  }, [colors]);

  return null;
}
