/**
 * Fictional representative fixture data for the Ivory Palace —
 * Signature Edition prototype (Mauritian Hindu wedding market, per
 * assets/source-spec/README.md). No real client, guest, or production
 * data is used anywhere in this fixture. Sarvesh and Shakshina are an
 * invented couple created for this implementation only.
 *
 * Gallery photo URLs below are schema-valid placeholder https URLs
 * (not resolvable), matching the same convention
 * ../timeless-editorial-v2/fixture.ts uses for its non-resolvable
 * https://maps.example.com/... / https://example.com/guest/... values
 * — a template fixture demonstrates the *shape* of trusted composition
 * data, not a live network reference. The local preview script
 * (scripts/build-local-preview.mjs) substitutes real local sample
 * images for these specific URLs only when building a preview file to
 * open in a browser; that substitution never touches this file or
 * render.ts's output for real composition data.
 */

import type { IvoryPalaceData } from "./schema";

const SAMPLE_GALLERY_PHOTOS: IvoryPalaceData["gallery"] = [
  { url: "https://images.example.com/gallery/sample-1.jpg", alt: "The couple laughing together in the palace courtyard at golden hour." },
  { url: "https://images.example.com/gallery/sample-2.jpg", alt: "Close-up of hands adorned with Mehendi and gold bangles." },
  { url: "https://images.example.com/gallery/sample-3.jpg", alt: "Family members dancing during the Sangeet celebration." },
  { url: "https://images.example.com/gallery/sample-4.jpg", alt: "The couple exchanging garlands during the wedding ceremony." },
  { url: "https://images.example.com/gallery/sample-5.jpg", alt: "Candlelit reception dinner setting beneath the palace arches." },
  { url: "https://images.example.com/gallery/sample-6.jpg", alt: "The couple walking hand in hand through a marigold-strewn courtyard." },
];

export const IVORY_PALACE_FIXTURE: IvoryPalaceData = {
  coupleName1: "Sarvesh",
  coupleName2: "Shakshina",
  eventDateDisplay: "18–20 December 2026",
  welcomeLine: "Together with their families, with hearts full of joy",
  introLine:
    "From a chance meeting at a Port Louis wedding to a lifetime promised at the Ivory Palace — Sarvesh and Shakshina invite you to walk with them through three days of colour, ceremony, and celebration.",
  ceremonies: {
    haldi: {
      dateDisplay: "Friday, 18 December 2026",
      timeDisplay: "9:00 AM",
      venueName: "The Ivory Palace — Courtyard Pavilion",
      venueDetail: "Morning Haldi with turmeric, song, and family blessing.",
    },
    mehendi: {
      dateDisplay: "Friday, 18 December 2026",
      timeDisplay: "4:00 PM",
      venueName: "The Ivory Palace — Jasmine Terrace",
      venueDetail: "Henna, music, and an afternoon of laughter with the bridal party.",
    },
    sangeet: {
      dateDisplay: "Saturday, 19 December 2026",
      timeDisplay: "7:00 PM",
      venueName: "The Ivory Palace — Grand Hall",
      venueDetail: "An evening of dance and performances from both families.",
    },
    wedding: {
      dateDisplay: "Sunday, 20 December 2026",
      timeDisplay: "10:30 AM",
      venueName: "The Ivory Palace — Main Mandap",
      venueDetail: "The wedding ceremony, followed by blessings from elders.",
    },
    reception: {
      dateDisplay: "Sunday, 20 December 2026",
      timeDisplay: "7:30 PM",
      venueName: "The Ivory Palace — Terrace Gardens",
      venueDetail: "Dinner and dancing beneath the palace lights.",
    },
  },
  formalInvitation: {
    headline: "Together with their families",
    bodyLines: [
      "Mr. & Mrs. Ramgoolam",
      "request the honour of your presence",
      "at the marriage of their daughter",
      "Shakshina",
      "to",
      "Sarvesh",
      "son of Mr. & Mrs. Appadoo",
      "on Sunday, the twentieth of December, Two Thousand Twenty-Six",
      "at The Ivory Palace, Moka, Mauritius",
    ],
  },
  gallery: SAMPLE_GALLERY_PHOTOS,
  venue: {
    name: "The Ivory Palace",
    address: "Royal Road, Moka, Mauritius",
    mapUrl: "https://maps.example.com/?q=The+Ivory+Palace+Moka+Mauritius",
  },
  response: {
    heading: "Will you honour us with your presence?",
    supportingMessage: "We would be so glad to have you with us.",
    deadline: "1 November 2026",
    buttonLabel: "Share your response",
    url: "https://example.com/guest/sample-fixture-token",
  },
  familyBlessingLine:
    "With the blessings of our grandparents and elders, and the love of every family member who shaped this journey, we begin our life together.",
  closingLine: "With love, Sarvesh & Shakshina",
};

/** Same fixture with the optional RSVP section disabled entirely — used to test the RSVP-disabled state. */
export const IVORY_PALACE_FIXTURE_NO_RESPONSE: IvoryPalaceData = {
  ...IVORY_PALACE_FIXTURE,
  response: undefined,
};

/** Same fixture with no gallery photos — exercises the documented empty-arch fallback. */
export const IVORY_PALACE_FIXTURE_EMPTY_GALLERY: IvoryPalaceData = {
  ...IVORY_PALACE_FIXTURE,
  gallery: [],
};

/** Same fixture with only 3 of 6 gallery slots filled — exercises the partial-fallback state. */
export const IVORY_PALACE_FIXTURE_PARTIAL_GALLERY: IvoryPalaceData = {
  ...IVORY_PALACE_FIXTURE,
  gallery: SAMPLE_GALLERY_PHOTOS.slice(0, 3),
};

/**
 * Unusually long names and venue wording — exercises SCENE-SPEC.md's
 * name-handling rules (wrap at word boundaries, never condense
 * horizontally, shrink no lower than the documented floor) and the
 * formal-invitation "7–9 lines body maximum" ceiling.
 */
export const IVORY_PALACE_FIXTURE_LONG_NAMES: IvoryPalaceData = {
  ...IVORY_PALACE_FIXTURE,
  coupleName1: "Sarveshkumar Ramgoolam-Appadoo",
  coupleName2: "Shakshina Devi Ramnarain-Beeharry",
  venue: {
    name: "The Grand Ivory Palace Heritage Estate and Botanical Gardens",
    address: "Lot 14, Royal Road, Moka District, Republic of Mauritius, 80835",
    mapUrl: "https://maps.example.com/?q=Grand+Ivory+Palace+Heritage+Estate+Moka",
  },
  ceremonies: {
    ...IVORY_PALACE_FIXTURE.ceremonies,
    wedding: {
      ...IVORY_PALACE_FIXTURE.ceremonies.wedding,
      venueName: "The Grand Ivory Palace Heritage Estate and Botanical Gardens — Main Mandap Pavilion",
    },
  },
};
