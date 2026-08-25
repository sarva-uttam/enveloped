"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";

const TEASERS = [
  "There's a little surprise for you. Click me 💌",
  "Sending my best regards. Click me.",
  "Open when you have a moment 🤍",
];

export function TeaserDemo() {
  const [opened, setOpened] = useState(false);

  return (
    <div className="mx-auto max-w-sm">
      <div className="overflow-hidden rounded-[2rem] border border-line bg-[#e5ded3] shadow-xl">
        <div className="bg-[#075e54] px-4 py-3 text-sm font-medium text-white">
          Priya &amp; Dev
        </div>
        <div className="flex min-h-[220px] flex-col justify-end gap-2 p-4">
          <AnimatePresence>
            {!opened ? (
              <motion.button
                key="bubble"
                onClick={() => setOpened(true)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-2.5 text-left text-sm text-ink shadow-sm"
              >
                {TEASERS[0]}
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink-soft/70">
                  10:41 AM <CheckCheck className="h-3 w-3 text-sky-500" />
                </span>
              </motion.button>
            ) : (
              <motion.div
                key="revealed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="ml-auto max-w-[92%] overflow-hidden rounded-2xl rounded-tr-sm bg-white shadow-md"
              >
                <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-blush-soft via-gold-soft to-platinum-soft">
                  <span className="font-display text-lg italic text-ink">
                    Priya &amp; Dev
                  </span>
                  <span className="absolute bottom-2 right-3 text-[10px] uppercase tracking-wide text-ink-soft">
                    are getting married
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-[11px] text-ink-soft">
                  <span>enveloped.app/priya-dev</span>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-ink-soft">
        {opened
          ? "That's the moment your guests get — no gibberish links, just intrigue."
          : "This is what shows up in the chat. Tap the bubble."}
      </p>
    </div>
  );
}
