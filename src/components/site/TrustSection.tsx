import { ShieldCheck, Lock, EyeOff } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Plain-language descriptions of real, existing safeguards — not new
 * copy claims. Each point maps to an actual mechanism: hashed guest/
 * preview tokens (src/lib/guest-tokens.server.ts and its preview-token
 * counterpart), row-level security scoping every owner's data to
 * themselves, and payment capture that never auto-publishes an
 * invitation (Stage 3's "separate publication from payment"). No new
 * claims are introduced here.
 */
const POINTS = [
  {
    icon: Lock,
    title: "Your data stays yours",
    body: "Every invite, guest list, and RSVP is scoped to your account at the database level — no client of ours can see another client's guests.",
  },
  {
    icon: EyeOff,
    title: "Private links stay private",
    body: "Preview and guest links use one-way hashed tokens — the raw link is never stored anywhere it could leak, and an invalid or expired link simply says so, without hinting at what it would have shown.",
  },
  {
    icon: ShieldCheck,
    title: "Payment never skips review",
    body: "Paying for an invite doesn't publish it automatically. You (or, for concierge work, our team and you together) confirm it's right before it ever goes live.",
  },
];

export function TrustSection() {
  return (
    <Section tone="raised" border="y">
      <SectionHeading eyebrow="Built to be trusted" title="Quietly serious about your privacy." />
      <div className="mt-14 grid gap-10 sm:grid-cols-3">
        {POINTS.map((point, i) => (
          <Reveal key={point.title} delay={i * 0.06}>
            <point.icon className="h-6 w-6 text-burgundy" />
            <h3 className="mt-4 font-medium text-ink">{point.title}</h3>
            <p className="mt-2 text-sm text-ink-soft">{point.body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
