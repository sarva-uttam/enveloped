import type { ComponentType } from "react";
import { SECTION_TYPES, type CompositionSection, type SectionType } from "@/lib/composition/schema";
import {
  OpeningSection,
  GreetingSection,
  IntroSection,
  WelcomeSection,
  StorySection,
  ScheduleSection,
  DateTimeSection,
  VenueSection,
  MapLinkSection,
  DressCodeSection,
  GallerySection,
  RsvpSection,
  MusicSection,
  ClosingSection,
  CustomTextSection,
  type SectionRenderContext,
} from "./sections";

/**
 * The trusted renderer registry — Stage 6 (see PROJECT_STATUS.md's Stage
 * 6 section, Part E). A plain, static object literal mapping a known
 * `SectionType` string to a known, statically-imported React component
 * — NEVER a dynamic import, NEVER `require(someDatabaseString)`, never
 * any mechanism that could resolve an arbitrary component name from
 * data. Every value here is a component this file itself imports by
 * name at the top; there is no code path from a jsonb string to an
 * arbitrary function call.
 *
 * `SECTION_TYPES` (from the schema itself) and this registry's own key
 * set are asserted identical by registry.test.ts — "a type is
 * validated" and "a type has a registered component" can never
 * silently drift apart from each other.
 */
export type SectionComponent<T extends SectionType = SectionType> = ComponentType<{
  data: Extract<CompositionSection, { type: T }>["data"];
  ctx: SectionRenderContext;
}>;

export const SECTION_REGISTRY: { [K in SectionType]: SectionComponent<K> } = {
  opening: OpeningSection,
  greeting: GreetingSection,
  intro: IntroSection,
  welcome: WelcomeSection,
  story: StorySection,
  schedule: ScheduleSection,
  dateTime: DateTimeSection,
  venue: VenueSection,
  mapLink: MapLinkSection,
  dressCode: DressCodeSection,
  gallery: GallerySection,
  rsvp: RsvpSection,
  music: MusicSection,
  closing: ClosingSection,
  customText: CustomTextSection,
};

/**
 * Resolves a section's component, unconditionally safely: an unknown
 * type — impossible through the normal, Zod-validated path, but this is
 * the LAST line of defense, not merely a consequence of validation
 * upstream — resolves to `undefined` rather than throwing. Callers
 * (CompositionRenderer) treat `undefined` as "render nothing for this
 * section" instead of crashing the whole page. Typed to accept any
 * string (not just SectionType) specifically so a defensive/adversarial
 * caller — and registry.test.ts's "unknown registry types fail safely"
 * test — can exercise this exact path without a TypeScript cast hiding
 * what's being tested.
 */
export function resolveSectionComponent(type: string): SectionComponent | undefined {
  return (SECTION_REGISTRY as Record<string, SectionComponent>)[type];
}

export { SECTION_TYPES };
