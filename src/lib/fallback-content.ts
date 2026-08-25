import type { EventCategory, GeneratedInviteContent, SurveyAnswers } from "./types";

const PALETTES: Record<string, string[]> = {
  wedding: ["#c26b7a", "#f8ecd2", "#b8862f", "#faf6f0"],
  holiday: ["#8a4b3e", "#e2c07a", "#2f5d4f", "#faf6f0"],
  vacation: ["#3f8fa6", "#f2d98a", "#f2f7f5", "#e9865b"],
  default: ["#7c3aed", "#b8862f", "#c26b7a", "#f8ecd2"],
};

function paletteFor(category: EventCategory | null) {
  if (!category) return PALETTES.default;
  if (category.startsWith("wedding")) return PALETTES.wedding;
  if (category === "holiday") return PALETTES.holiday;
  if (category === "vacation" || category === "hotel-package") return PALETTES.vacation;
  return PALETTES.default;
}

function titleFor(category: EventCategory | null, names: string) {
  if (!category) return names || "You're Invited";
  if (category.startsWith("wedding")) return names || "Two Hearts, One Celebration";
  if (category === "holiday") return names || "You're Invited to Celebrate";
  if (category === "vacation") return names || "Let's Get Away Together";
  if (category === "hotel-package") return names || "An Escape Worth Booking";
  if (category === "birthday") return names || "A Celebration Awaits";
  return names || "You're Invited";
}

export function buildFallbackContent(answers: SurveyAnswers): GeneratedInviteContent {
  const isWedding = (answers.category || "").startsWith("wedding");
  const details: { label: string; value: string }[] = [];

  if (answers.eventDate) details.push({ label: "Date", value: answers.eventDate });
  if (answers.venue) details.push({ label: "Venue", value: answers.venue });
  if (answers.city) details.push({ label: "City", value: answers.city });
  if (answers.song) details.push({ label: "Our Song", value: answers.song });
  if (details.length === 0) {
    details.push({ label: "Date", value: "To be announced" });
    details.push({ label: "Venue", value: "To be announced" });
  }

  return {
    headline: titleFor(answers.category, answers.partnerNames),
    subheadline: isWedding
      ? "Together with our families, we invite you to share in our joy."
      : "We can't wait to celebrate this moment with you.",
    welcomeMessage:
      answers.extraDetails?.trim() ||
      (isWedding
        ? "Your presence means the world to us. Join us for a day of love, laughter, and the beginning of forever."
        : "A few details are below — we'd love nothing more than to have you there with us."),
    eventDetails: details,
    closingLine: isWedding ? "With love, we can't wait to see you there." : "See you soon!",
    suggestedPalette: paletteFor(answers.category),
  };
}
