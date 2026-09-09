"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The ONLY reason any part of the invitation's static content tree
 * touches framer-motion — a thin scroll-reveal wrapper, not a content
 * generator. `children` is normal React content (server-rendered when
 * this is composed from a Server Component, per React's children-as-
 * server-content pattern: a Client Component's `children` prop, when it
 * originates from a parent Server Component's render, is NOT re-executed
 * on the client — it's already-rendered content this component only
 * wraps with motion behavior). This is what keeps Framer Motion off the
 * actual CONTENT-rendering path (Stage 4, see PROJECT_STATUS.md) while
 * still preserving the existing entrance animation: the text is present
 * in the initial server HTML either way, this only controls when it
 * becomes visually revealed once JS hydrates.
 *
 * `active=false` renders a plain <div> with no animation at all — same
 * as the pre-Stage-4 `hasMotion` flag on Bronze tier.
 */
export function AnimateIn({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!active) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
