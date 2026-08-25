import type { EventCategory } from "./types";

export const EVENT_CATEGORIES: {
  id: EventCategory;
  label: string;
  blurb: string;
  emoji: string;
}[] = [
  { id: "wedding-hindu", label: "Hindu Wedding", blurb: "Mandap, mehendi, and mangalsutra motifs", emoji: "🪔" },
  { id: "wedding-christian", label: "Christian Wedding", blurb: "Church ceremony and reception elegance", emoji: "⛪" },
  { id: "wedding-muslim", label: "Muslim Wedding", blurb: "Nikah and walima styled invites", emoji: "🌙" },
  { id: "wedding-other", label: "Wedding — Other / Interfaith", blurb: "Any tradition, any blend", emoji: "💍" },
  { id: "holiday", label: "Holiday Gathering", blurb: "Festive season get-togethers", emoji: "🎄" },
  { id: "vacation", label: "Vacation Invite", blurb: "Group trips and getaways", emoji: "🏝️" },
  { id: "hotel-package", label: "Hotel Package Deal", blurb: "Promote a stay or package", emoji: "🏨" },
  { id: "birthday", label: "Birthday / Milestone", blurb: "Birthdays, anniversaries, celebrations", emoji: "🎉" },
  { id: "other", label: "Something Else", blurb: "Tell us what you're planning", emoji: "✨" },
];

export const CLICK_TEASERS = [
  "There's a little surprise for you. Click me 💌",
  "Click me — I promise it's worth it.",
  "Sending my best regards. Click me.",
  "Open when you have a moment 🤍",
  "This one's just for you. Click me.",
  "A little something arrived for you.",
  "You're invited. Tap to see.",
];
