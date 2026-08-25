import type { GeneratedInviteContent, TierId } from "./types";

export interface DemoInvite {
  id: string;
  tier: TierId;
  content: GeneratedInviteContent;
  eventDate: string;
  song?: string;
  guestName?: string;
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
    song: "A Thousand Years — Christina Perri",
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
};
