"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * Generic marketing-site scroll reveal for the new Stage 11 homepage
 * sections. Deliberately separate from src/components/invite/AnimateIn.tsx
 * — that component's `preset` indirection exists to keep untrusted
 * composition DATA from ever reaching Framer Motion's config directly;
 * nothing here renders composition data, so a plain fixed fade+lift is
 * fine. Reuses the same useReducedMotion() primitive so this respects the
 * viewer's OS preference exactly like every other motion in the app, and
 * degrades to a plain, immediately-visible div with no JS-dependent
 * content hiding (server-rendered children are real content either way).
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
