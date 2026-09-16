"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const TEASER_LINE = "There's a little surprise for you. Click to open.";

/**
 * design/public-frontend-premium-v3 — replaces the previous CSS-drawn
 * WhatsApp-chat mockup (fake app chrome, emoji, a green header bar that
 * never existed in any real product) with an editorial reveal: a plain
 * message line the guest actually sees, then the invitation's own
 * typographic identity underneath — no simulated interface standing in
 * for real imagery. The click-to-reveal mechanic itself is preserved.
 */
export function TeaserDemo() {
  const [opened, setOpened] = useState(false);

  return (
    <div className="mx-auto max-w-sm">
      <div className="texture-grain overflow-hidden rounded-sm border border-line bg-paper-raised">
        <div className="flex min-h-[280px] flex-col justify-center p-10 text-center">
          <AnimatePresence mode="wait">
            {!opened ? (
              <motion.button
                key="teaser"
                type="button"
                onClick={() => setOpened(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="focus-ring mx-auto"
              >
                <p className="font-display text-xl italic text-ink">{TEASER_LINE}</p>
                <span className="mt-4 inline-block text-xs font-medium uppercase tracking-[0.18em] text-blush">
                  Tap to open
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="revealed"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-burgundy">
                  Priya &amp; Dev are getting married
                </p>
                <p className="mt-4 font-display text-3xl italic text-ink">Priya &amp; Dev</p>
                <div className="foil-divider mx-auto mt-5 w-16" />
                <p className="mt-5 text-xs text-ink-soft">enveloped.app/priya-dev</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-ink-soft">
        {opened
          ? "That's the moment your guests get — no gibberish links, just intrigue."
          : "This is what shows up in the chat. Tap the line above."}
      </p>
    </div>
  );
}
