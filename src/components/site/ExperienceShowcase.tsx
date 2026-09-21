import { TeaserDemo } from "@/components/site/TeaserDemo";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Elevates the existing, already-polished TeaserDemo micro-interaction
 * (kept exactly as-is) with a stronger editorial frame around it, per
 * the brief's "invitation experience showcase" homepage item — not a
 * new mockup, just a more deliberate setting for the one that already works well.
 */
export function ExperienceShowcase() {
  return (
    <Section border="y" tone="raised" innerClassName="grid items-center gap-12 lg:grid-cols-2">
      <Reveal>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-burgundy">The experience</p>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl">
          Not a link. <span className="italic text-blush">An invitation.</span>
        </h2>
        <p className="mt-4 max-w-md text-ink-soft">
          Whoever you send it to — WhatsApp, Instagram, Facebook, even
          Vkontakte — your guest sees a warm, human line. Not
          &ldquo;enveloped.app/x83jf&rdquo;. The link preview and message
          text are yours to write.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-ink-soft">
          <li>&ldquo;There&apos;s a little surprise for you. Click me.&rdquo;</li>
          <li>&ldquo;Sending my best regards. Click me.&rdquo;</li>
          <li>&ldquo;Open when you have a moment.&rdquo;</li>
        </ul>
      </Reveal>
      <Reveal delay={0.1}>
        <TeaserDemo />
      </Reveal>
    </Section>
  );
}
