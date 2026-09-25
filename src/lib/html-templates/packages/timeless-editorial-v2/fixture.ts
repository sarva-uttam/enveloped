/**
 * Fictional representative fixture data for the Timeless Editorial
 * Wedding (V2) prototype test. No real client, guest, or production
 * data is used anywhere in this fixture.
 */

import type { TimelessEditorialData } from "./schema";

export const TIMELESS_EDITORIAL_FIXTURE: TimelessEditorialData = {
  partner1Name: "Eleanor Whitfield",
  partner2Name: "Julian Marsh",
  eventDateDisplay: "Saturday, the twentieth of June, Two Thousand Twenty-Six",
  openingLine: "Together with their families",
  introLine:
    "Two families, two stories, one quiet Saturday in June — we would be so glad for you to be there when we begin our next chapter.",
  schedule: [
    { time: "4:00 PM", title: "Ceremony", description: "The Orangery Lawn" },
    { time: "5:00 PM", title: "Cocktail Hour", description: "The Rose Terrace" },
    { time: "6:30 PM", title: "Reception & Dinner", description: "The Orangery" },
    { time: "9:00 PM", title: "Dancing" },
  ],
  venueName: "The Old Orangery at Hartsdale Manor",
  venueAddress: "14 Hartsdale Lane, Bramwell, Surrey",
  mapUrl: "https://maps.example.com/?q=Hartsdale+Manor+Bramwell+Surrey",
  dressCode: "Garden formal — soft neutrals encouraged",
  response: {
    heading: "Will you celebrate with us?",
    supportingMessage: "Kindly let us know by 1 May 2026.",
    buttonLabel: "Share your response",
    url: "https://example.com/guest/sample-fixture-token",
  },
  closingLine: "We can't wait to celebrate with you.",
};

/** Same fixture with the optional guest-response section disabled entirely. */
export const TIMELESS_EDITORIAL_FIXTURE_NO_RESPONSE: TimelessEditorialData = {
  ...TIMELESS_EDITORIAL_FIXTURE,
  response: undefined,
};
