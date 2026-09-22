/**
 * EXPERIMENTAL — NOT PRODUCTION READY
 *
 * Fictional fixture content for the Continuous Journey prototype.
 * No real client, guest, or production data is used anywhere here.
 */

export interface JourneyFixture {
  coupleNames: [string, string];
  state1Intro: string;
  haldi: { title: string; date: string; time: string; venue: string; note: string };
  wedding: {
    phaseA: { blessing: string; name1: string; name2: string };
    phaseB: { date: string; time: string; venue: string; address: string };
  };
  finale: { closing: string; directionsLabel: string; rsvpLabel: string };
}

export const JOURNEY_FIXTURE: JourneyFixture = {
  coupleNames: ["Sarvesh", "Shakshina"],
  state1Intro: "Together with their families invite you to celebrate their wedding journey.",
  haldi: {
    title: "Haldi Ceremony",
    date: "Friday, 18 December 2026",
    time: "10:30 AM",
    venue: "The Ivory Garden, Moka",
    note: "Traditional or yellow attire welcomed",
  },
  wedding: {
    phaseA: { blessing: "With the blessings of our families", name1: "Sarvesh", name2: "Shakshina" },
    phaseB: { date: "Saturday, 19 December 2026", time: "4:00 PM", venue: "The Ivory Palace", address: "Moka, Mauritius" },
  },
  finale: {
    closing: "Your presence will make our celebration complete.",
    directionsLabel: "View directions",
    rsvpLabel: "Share your response",
  },
};

/** Long-name stress case, matching the source package's own proof pair (TEXT-SAFE-AREA-SPEC.md). */
export const JOURNEY_FIXTURE_LONG_NAMES: JourneyFixture = {
  ...JOURNEY_FIXTURE,
  coupleNames: ["Venkateshwaran", "Anushriyadevi"],
  wedding: {
    phaseA: { blessing: "With the blessings of our families", name1: "Venkateshwaran", name2: "Anushriyadevi" },
    phaseB: { ...JOURNEY_FIXTURE.wedding.phaseB, venue: "The Grand Ivory Palace and Heritage Gardens" },
  },
};
