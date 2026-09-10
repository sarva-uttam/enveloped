import type { GeneratedInviteContent, TierId } from "./types";
import type { InvitationComposition } from "./composition/schema";

export interface DemoInvite {
  id: string;
  tier: TierId;
  content: GeneratedInviteContent;
  eventDate: string;
  song?: string;
  /** Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part F/J) — a
   *  real, playable audio URL so the invitation audio player has
   *  something to demonstrate locally. Only `demo-platinum` sets it,
   *  and only to this project's own synthesized, license-free test tone
   *  (public/audio/README.md) — never a real or copyrighted track. */
  musicSrc?: string;
  guestName?: string;
  /** Stage 7 (Part J) — a REAL, pre-authored composition for demos that
   *  need to show something the legacy adapter can't produce (a
   *  non-neutral cultural pack, a richer section set). When set, the
   *  demo route feeds this straight into resolveComposition() instead
   *  of the legacy adapter — see src/app/invite/[id]/page.tsx. Only
   *  `demo-hindu` uses it today. */
  composition?: InvitationComposition;
}

export const DEMO_INVITES: Record<string, DemoInvite> = {
  "demo-bronze": {
    id: "demo-bronze",
    tier: "bronze",
    eventDate: "2026-11-14T16:00:00",
    content: {
      headline: "Maya & Jordan",
      subheadline: "Together with their families, request the pleasure of your company.",
      welcomeMessage:
        "We're tying the knot and would love for you to be part of our day — simple, elegant, and straight to the point.",
      eventDetails: [
        { label: "Date", value: "November 14, 2026" },
        { label: "Venue", value: "The Garden Hall" },
        { label: "City", value: "Austin, TX" },
      ],
      closingLine: "With love, Maya & Jordan.",
      suggestedPalette: ["#9c6b3e", "#f1e4d3"],
    },
  },
  "demo-silver": {
    id: "demo-silver",
    tier: "silver",
    eventDate: "2026-12-05T17:30:00",
    content: {
      headline: "Elena & Marcus",
      subheadline: "Two families, one beautiful beginning.",
      welcomeMessage:
        "We can't wait to celebrate with you — RSVP below and count down the days with us.",
      eventDetails: [
        { label: "Date", value: "December 5, 2026" },
        { label: "Venue", value: "St. Augustine Chapel" },
        { label: "Reception", value: "Harborview Estate" },
        { label: "City", value: "Charleston, SC" },
      ],
      closingLine: "See you on the dance floor.",
      suggestedPalette: ["#6b7280", "#eef0f2", "#c26b7a"],
    },
  },
  "demo-gold": {
    id: "demo-gold",
    tier: "gold",
    eventDate: "2027-01-23T18:00:00",
    song: "Perfect — Ed Sheeran",
    content: {
      headline: "Priya & Devansh",
      subheadline: "Our story, animated — just for you.",
      welcomeMessage:
        "From our first hello to forever — we're so excited to have you witness the next chapter, complete with music, motion, and mehendi.",
      eventDetails: [
        { label: "Mehendi", value: "Jan 21, 2027 · The Courtyard" },
        { label: "Wedding Ceremony", value: "Jan 23, 2027 · Grand Mandap Hall" },
        { label: "Reception", value: "Jan 23, 2027 · 7:00 PM" },
        { label: "City", value: "Jaipur, India" },
      ],
      closingLine: "With all our love, Priya & Devansh.",
      suggestedPalette: ["#b8862f", "#f8ecd2", "#c26b7a", "#7c3aed", "#faf6f0", "#e2c07a"],
    },
  },
  "demo-platinum": {
    id: "demo-platinum",
    tier: "platinum",
    eventDate: "2027-02-14T19:00:00",
    // Title matches what the player will ACTUALLY play — this project's
    // own synthesized test tone, not a real recording (public/audio/
    // README.md). Deliberately not a real song title, so the demo
    // never implies a track it doesn't have the rights to.
    song: "Enveloped sample tone",
    musicSrc: "/audio/sample-test-tone.wav",
    guestName: "Aria",
    content: {
      headline: "Sofia & Adam",
      subheadline: "A love story, delivered as an experience.",
      welcomeMessage:
        "Every guest gets their own invite, addressed by name — because you're not just on a list, you're part of our story. We can't imagine our day without you.",
      eventDetails: [
        { label: "Ceremony", value: "Feb 14, 2027 · 5:00 PM" },
        { label: "Venue", value: "Villa Rosalind" },
        { label: "Reception", value: "Feb 14, 2027 · 7:00 PM" },
        { label: "City", value: "Lake Como, Italy" },
        { label: "Dress Code", value: "Garden Formal" },
      ],
      closingLine: "With every bit of our hearts, Sofia & Adam.",
      suggestedPalette: ["#7c3aed", "#b8862f", "#c26b7a", "#f8ecd2", "#faf6f0", "#e2c07a"],
    },
  },

  // Stage 7 (Part J) — the one demo carrying a REAL, pre-authored
  // composition rather than going through the legacy adapter, so the
  // `hindu-wedding` cultural pack (petal atmosphere, its own suggested
  // section order and ceremony terminology) has something to render
  // for visual review. `content` below is only a fallback the demo
  // route never actually uses for this id (the `composition` wins).
  "demo-hindu": {
    id: "demo-hindu",
    tier: "platinum",
    eventDate: "2027-03-06T17:00:00",
    guestName: "Aria",
    content: {
      headline: "Ananya & Rohan",
      subheadline: "Together with their families",
      welcomeMessage: "We would be honored to have you celebrate with us.",
      eventDetails: [{ label: "Wedding Ceremony", value: "March 6, 2027" }],
      closingLine: "With love and gratitude, Ananya & Rohan.",
      suggestedPalette: ["#b8862f", "#c26b7a"],
    },
    composition: {
      schemaVersion: 1,
      templateId: null,
      designPackId: "hindu-wedding",
      eventCategory: "wedding-hindu",
      weddingContext: { occasionId: "wedding_ceremony", occasionCustomLabel: null, culturalPackId: "hindu-wedding" },
      locale: "en",
      dir: "ltr",
      themeTokens: { paletteId: "hindu-classic" },
      featureConfig: { motion: true, ambientMotif: "full", openingBurst: true, envelopeOpening: true },
      sections: [
        {
          id: "opening",
          type: "opening",
          enabled: true,
          motionPreset: "ceremonial",
          data: { eyebrow: "A Hindu Wedding", headline: "Ananya & Rohan", subheadline: "Together with their families, we invite you" },
        },
        { id: "greeting", type: "greeting", enabled: true, motionPreset: "fade", data: {} },
        {
          id: "welcome",
          type: "welcome",
          enabled: true,
          motionPreset: "fade",
          data: { message: "From haldi to the vidaai, we would be honored to have you beside us for every moment." },
        },
        {
          id: "story",
          type: "story",
          enabled: true,
          motionPreset: "ceremonial",
          data: { title: "Our story", body: "Six years, two cities, one very persistent shared playlist. We can't wait to begin the next chapter surrounded by the people we love." },
        },
        {
          id: "schedule",
          type: "schedule",
          enabled: true,
          motionPreset: "stagger",
          data: {
            entries: [
              { id: "e-haldi", eventTypeId: "haldi", label: "Haldi", value: "March 4, 2027 · 10:00 AM · The Courtyard" },
              { id: "e-mehendi", eventTypeId: "mehendi", label: "Mehendi", value: "March 4, 2027 · 4:00 PM · The Courtyard" },
              { id: "e-sangeet", eventTypeId: "sangeet", label: "Sangeet", value: "March 5, 2027 · 7:00 PM · Grand Ballroom" },
              { id: "e-ceremony", eventTypeId: "wedding_ceremony", label: "Wedding Ceremony", value: "March 6, 2027 · 5:00 PM · Mandap Lawn" },
              { id: "e-reception", eventTypeId: "reception", label: "Reception", value: "March 6, 2027 · 8:00 PM · Grand Ballroom" },
            ],
          },
        },
        {
          id: "date-time",
          type: "dateTime",
          enabled: true,
          motionPreset: "rise",
          data: { eventDate: "2027-03-06T17:00:00", label: "Countdown to the ceremony" },
        },
        {
          id: "venue",
          type: "venue",
          enabled: true,
          motionPreset: "fade",
          data: { name: "Amber Gardens Estate", address: "Jaipur, Rajasthan" },
        },
        {
          id: "dress-code",
          type: "dressCode",
          enabled: true,
          motionPreset: "fade",
          data: { description: "Festive Indian formal. Bright colours warmly encouraged." },
        },
        {
          id: "gallery",
          type: "gallery",
          enabled: true,
          motionPreset: "petals",
          data: {
            items: [
              { id: "g1", imageUrl: null, alt: "A warm gold from the palette", colorFallback: "#b8862f" },
              { id: "g2", imageUrl: null, alt: "A soft rose from the palette", colorFallback: "#c26b7a" },
              { id: "g3", imageUrl: null, alt: "A pale cream from the palette", colorFallback: "#f8ecd2" },
            ],
          },
        },
        { id: "rsvp", type: "rsvp", enabled: true, motionPreset: "rise", data: { prompt: "Kindly let us know by February 1st." } },
        {
          id: "music",
          type: "music",
          enabled: true,
          motionPreset: "none",
          data: { src: "/audio/sample-test-tone.wav", title: "Enveloped sample tone", credit: null, loop: false, startVolume: 0.5 },
        },
        {
          id: "closing",
          type: "closing",
          enabled: true,
          motionPreset: "glow",
          data: { message: "With love and gratitude — Ananya, Rohan, and our families." },
        },
      ],
    },
  },
};
