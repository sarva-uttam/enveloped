export type TierId = "bronze" | "silver" | "gold" | "platinum";

export type EventCategory =
  | "wedding-hindu"
  | "wedding-christian"
  | "wedding-muslim"
  | "wedding-other"
  | "holiday"
  | "vacation"
  | "hotel-package"
  | "birthday"
  | "other";

export interface TierFeature {
  label: string;
  includedFrom: TierId;
}

export interface Tier {
  id: TierId;
  name: string;
  price: number;
  cadence: "per invite";
  tagline: string;
  colorVar: string;
  softVar: string;
  description: string;
  highlights: string[];
}

export interface GuestEntry {
  id: string;
  name: string;
  slug: string;
  viewed: boolean;
  clickTeaser: string;
}

export interface SurveyAnswers {
  category: EventCategory | null;
  tier: TierId | null;
  partnerNames: string;
  eventDate: string;
  venue: string;
  city: string;
  colorMood: string;
  song: string;
  extraDetails: string;
  guestNames: string;
}

export interface GeneratedInviteContent {
  headline: string;
  subheadline: string;
  welcomeMessage: string;
  eventDetails: {
    label: string;
    value: string;
  }[];
  closingLine: string;
  suggestedPalette: string[];
}
