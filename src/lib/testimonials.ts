/**
 * Stage 11 — SAMPLE/DEMONSTRATION content only. No real Enveloped
 * customer has been quoted here: there are no verified reviews to show
 * yet. Each entry is clearly labelled as a sample in the UI
 * (Testimonials.tsx), attributed by role rather than a fabricated
 * person's name, and carries no star rating or verification claim.
 * Replace this array with real, consented quotes as they come in — the
 * shape is intentionally small and flat so that's a drop-in change.
 */
export interface SampleTestimonial {
  id: string;
  language: "English" | "Français" | "Kreol Morisien";
  quote: string;
  attribution: string;
}

export const SAMPLE_TESTIMONIALS: SampleTestimonial[] = [
  {
    id: "sample-en",
    language: "English",
    quote:
      "Our guests kept messaging us just to say the invite gave them chills before they'd even RSVP'd. It didn't feel like a link — it felt like we'd handed them something.",
    attribution: "Sample response — a Platinum-tier couple",
  },
  {
    id: "sample-fr",
    language: "Français",
    quote:
      "On a envoyé le lien un lundi soir et les premières réponses sont arrivées en dix minutes. Tellement plus simple qu'un faire-part papier.",
    attribution: "Réponse fictive — un couple en autonomie (Or)",
  },
  {
    id: "sample-mfe",
    language: "Kreol Morisien",
    quote:
      "Nou finn dimann enn konsiltasion ek dan detrwa zour tou ti pare — nou pa ti bizin okip nanye, zot finn fer tou.",
    attribution: "Repons echantiyon — enn kliyan konsierj",
  },
];
