export interface FaqEntry {
  question: string;
  answer: string;
}

/** Pricing answers cite the real, existing tier prices in src/lib/tiers.ts — no new numbers invented here. */
export const FAQ: FaqEntry[] = [
  {
    question: "What exactly does Enveloped create?",
    answer:
      "A digital invitation — a designed, personalized web page for your event, complete with your event details, wording, and (depending on tier) motion, music, and per-guest personalization. It's shared as a link, not printed or mailed.",
  },
  {
    question: "What's the difference between concierge and self-service?",
    answer:
      "Self-service is the survey you can complete right now: answer a few questions, choose a tier, pay, and your invite is generated instantly for you to review and publish. Concierge is hands-on — you tell us what you're picturing, our team builds it, and you approve a private preview before it ever goes live.",
  },
  {
    question: "What is a private preview link?",
    answer:
      "For concierge work, before anything is public, you get a private link only you can use to review the invitation and approve it or request changes. It's separate from the guest-facing link and never appears in search engines or link previews.",
  },
  {
    question: "How personalized can an invite really get?",
    answer:
      "Wording, event schedule, palette, and — on Platinum — a uniquely addressed invite and link for every single guest on your list, each with their own quiet \"click me\" style teaser instead of a raw URL.",
  },
  {
    question: "Can guests RSVP through it?",
    answer:
      "Yes, from Silver tier upward. Responses (attending, plus-ones, dietary notes where relevant) come back to your dashboard in real time.",
  },
  {
    question: "What kinds of events does this work for?",
    answer:
      "Weddings first — Hindu, Christian, Muslim, interfaith, and civil ceremonies are all supported categories — plus holiday gatherings, vacations, hotel packages, birthdays, and general celebrations.",
  },
  {
    question: "How is the invite delivered?",
    answer:
      "As a link you share however you already talk to your guests — WhatsApp, Instagram, SMS, email. There's nothing to install and nothing for your guests to download.",
  },
  {
    question: "Can I add music or a slideshow?",
    answer:
      "From Gold tier upward you can include a background song and a photo gallery section as part of the invite.",
  },
  {
    question: "How is my data and my guests' data handled?",
    answer:
      "Your invites, guest lists, and RSVP responses are scoped to your account at the database level. Guest and preview links use one-way hashed tokens rather than storing anything an invalid link could expose.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Self-service pricing is fixed per invite and shown upfront — Bronze from $19 through Platinum at $149, all on the Pricing page. Concierge work is scoped and quoted individually during your consultation, since it depends on what you're asking us to build.",
  },
];
