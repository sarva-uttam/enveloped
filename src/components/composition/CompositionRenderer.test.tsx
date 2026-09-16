import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import { resolveSectionComponent, SECTION_REGISTRY } from "./registry";
import { SECTION_TYPES, InvitationCompositionSchema, COMPOSITION_SCHEMA_VERSION, type InvitationComposition } from "@/lib/composition/schema";

/**
 * Stage 6 (see PROJECT_STATUS.md's Stage 6 section, Part E/I). Same
 * direct-render + renderToStaticMarkup approach as the route-level
 * page.test.tsx files (no jsdom needed — see that file's own header
 * comment for the full reasoning, unchanged here).
 *
 * `baseComposition` takes loose DRAFT input (motionPreset/music-config
 * fields may be omitted — Stage 7's schema defaults fill them in) and
 * returns the fully-parsed, validated composition.
 */

type CompositionDraft = Record<string, unknown>;

function baseComposition(overrides: CompositionDraft = {}): InvitationComposition {
  const draft = {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    templateId: null,
    designPackId: "neutral-classic",
    eventCategory: "wedding-other",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "gold" },
    sections: [{ id: "opening", type: "opening", enabled: true, data: { headline: "Hello" } }],
    featureConfig: { motion: false, ambientMotif: "none", openingBurst: false },
    ...overrides,
  };
  return InvitationCompositionSchema.parse(draft);
}

describe("registry — SECTION_TYPES and SECTION_REGISTRY never drift apart", () => {
  it("every schema-known section type has a registered component", () => {
    for (const type of SECTION_TYPES) {
      expect(SECTION_REGISTRY[type]).toBeDefined();
    }
  });

  it("the registry has exactly the schema's section types, nothing more, nothing fewer", () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...SECTION_TYPES].sort());
  });

  it("resolveSectionComponent returns undefined, never throws, for an unknown type", () => {
    expect(() => resolveSectionComponent("not-a-real-type")).not.toThrow();
    expect(resolveSectionComponent("not-a-real-type")).toBeUndefined();
  });
});

describe("CompositionRenderer — each registered section renders safely", () => {
  const sectionData: Record<string, unknown> = {
    opening: { headline: "Priya & Devansh", subheadline: "sub" },
    greeting: {},
    intro: { title: "The Couple", description: "desc" },
    welcome: { message: "Welcome message text" },
    story: { title: "Our story", body: "Once upon a time" },
    schedule: { entries: [{ id: "e1", eventTypeId: "reception", label: "Reception", value: "7pm at the hall" }] },
    dateTime: { eventDate: "2027-01-01T18:00:00Z" },
    venue: { name: "The Grand Hall", address: "123 Main St" },
    mapLink: { label: "Get directions", url: "https://maps.example.com" },
    dressCode: { description: "Black tie optional" },
    gallery: { items: [{ id: "g1", imageUrl: null, alt: "A color", colorFallback: "#fff" }] },
    rsvp: { prompt: "Will you join us?" },
    music: { label: "Our Song" },
    closing: { message: "With love" },
    customText: { heading: "Note", body: "Extra details here" },
  };

  it.each(SECTION_TYPES)("%s renders without throwing", (type) => {
    const composition = baseComposition({
      sections: [{ id: "s1", type, enabled: true, data: sectionData[type] } as never],
    });
    expect(() =>
      renderToStaticMarkup(<CompositionRenderer composition={composition} inviteId="inv-1" canRsvp={true} guestName="Aria" />)
    ).not.toThrow();
  });

  it("opening section's headline text appears in the rendered HTML", () => {
    const composition = baseComposition({
      sections: [{ id: "s1", type: "opening", enabled: true, data: { headline: "Priya & Devansh" } }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain("Priya &amp; Devansh");
  });

  it("welcome section's message text appears in the rendered HTML", () => {
    const composition = baseComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "Welcome message text" } }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain("Welcome message text");
  });

  it("customText section's heading and body appear", () => {
    const composition = baseComposition({
      sections: [{ id: "s1", type: "customText", enabled: true, data: { heading: "Note", body: "Extra details here" } }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain("Note");
    expect(html).toContain("Extra details here");
  });

  it("mapLink section renders a safe href, never an unsanitized attribute", () => {
    const composition = baseComposition({
      sections: [{ id: "s1", type: "mapLink", enabled: true, data: { label: "Get directions", url: "https://maps.example.com" } }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain('href="https://maps.example.com"');
    expect(html).toContain("Get directions");
  });
});

describe("CompositionRenderer — disabled sections do not render", () => {
  it("a disabled section's content never appears in the HTML", () => {
    const composition = baseComposition({
      sections: [
        { id: "opening", type: "opening", enabled: true, data: { headline: "Visible Headline" } },
        { id: "welcome", type: "welcome", enabled: false, data: { message: "SHOULD NOT APPEAR" } },
      ],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain("Visible Headline");
    expect(html).not.toContain("SHOULD NOT APPEAR");
  });
});

describe("CompositionRenderer — RSVP gating (Stage 5 restriction preserved)", () => {
  it("never renders the RSVP form when canRsvp is false, even if the rsvp section is enabled", () => {
    const composition = baseComposition({
      sections: [{ id: "rsvp", type: "rsvp", enabled: true, data: {} }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).not.toContain("Will you be joining us?");
  });

  it("renders the RSVP form when canRsvp is true and the section is enabled", () => {
    const composition = baseComposition({
      sections: [{ id: "rsvp", type: "rsvp", enabled: true, data: {} }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={true} />);
    expect(html).toContain("Will you be joining us?");
  });
});

describe("CompositionRenderer — greeting personalization from context, never from stored data", () => {
  it("shows the greeting only when guestName is passed via props/context", () => {
    const composition = baseComposition({ sections: [{ id: "greeting", type: "greeting", enabled: true, data: {} }] });

    const withGuest = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} guestName="Aria Thompson" />);
    expect(withGuest).toContain("Dearest Aria Thompson");

    const withoutGuest = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(withoutGuest).not.toContain("Dearest");
  });
});

describe("CompositionRenderer — stable section ordering", () => {
  it("renders sections in the exact order given in the composition", () => {
    const composition = baseComposition({
      sections: [
        { id: "s1", type: "customText", enabled: true, data: { body: "FIRST" } },
        { id: "s2", type: "customText", enabled: true, data: { body: "SECOND" } },
        { id: "s3", type: "customText", enabled: true, data: { body: "THIRD" } },
      ],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html.indexOf("FIRST")).toBeLessThan(html.indexOf("SECOND"));
    expect(html.indexOf("SECOND")).toBeLessThan(html.indexOf("THIRD"));
  });
});

// ---------------------------------------------------------------------
// Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part D/E/F/I).
// ---------------------------------------------------------------------

describe("CompositionRenderer — Stage 7 music section", () => {
  it("renders NO music control when the music section has no src (every legacy/self-service invitation)", () => {
    const composition = baseComposition({
      sections: [{ id: "music", type: "music", enabled: true, data: {} }],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("Play music");
  });

  it("renders a real <audio> element (no autoplay) when the music section carries a trusted src", () => {
    const composition = baseComposition({
      sections: [
        { id: "music", type: "music", enabled: true, data: { src: "/audio/sample-test-tone.wav", title: "Sample" } },
      ],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain('<audio');
    expect(html).toContain('src="/audio/sample-test-tone.wav"');
    expect(html).not.toContain("autoplay");
  });
});

describe("CompositionRenderer — Stage 7 schedule stagger keeps semantics", () => {
  it("the 'stagger' preset still renders a <dl> with real <dt>/<dd> pairs, in order", () => {
    const composition = baseComposition({
      sections: [
        {
          id: "schedule",
          type: "schedule",
          enabled: true,
          motionPreset: "stagger",
          data: {
            entries: [
              { id: "e1", eventTypeId: null, label: "Mehendi", value: "Friday 4pm" },
              { id: "e2", eventTypeId: null, label: "Ceremony", value: "Saturday 11am" },
            ],
          },
        },
      ],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
    expect(html).toContain("Mehendi");
    expect(html).toContain("Friday 4pm");
    expect(html.indexOf("Mehendi")).toBeLessThan(html.indexOf("Ceremony"));
  });
});

describe("CompositionRenderer — Stage 7 atmospheric effect is decorative-only", () => {
  it("the ambient effect layer is aria-hidden and pointer-events-none", () => {
    const composition = baseComposition({
      featureConfig: { motion: true, ambientMotif: "light", openingBurst: false },
      designPackId: "hindu-wedding",
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toMatch(/aria-hidden="true"[^>]*pointer-events-none|pointer-events-none[^>]*aria-hidden="true"/);
  });
});

describe("Stage 12 — legacy compositions (no visual-differentiation tokens set) render unaffected", () => {
  it("a composition with no typographyId/sectionStyleId/densityId still renders the intro/welcome/story cards", () => {
    const composition = baseComposition({
      sections: [
        { id: "welcome", type: "welcome", enabled: true, data: { message: "Welcome message text" } },
        { id: "story", type: "story", enabled: true, data: { body: "Once upon a time" } },
      ],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
    expect(html).toContain("rounded-3xl");
    expect(html).toContain("Welcome message text");
    expect(html).toContain("Once upon a time");
  });
});

describe("Stage 12 — templates produce visibly different rendered output", () => {
  it("each of the six registered templates renders a distinct combination of typography/section-style classes", async () => {
    const { DESIGN_TEMPLATE_IDS, applyDesignTemplate } = await import("@/lib/composition/design-templates");
    const seen = new Set<string>();
    for (const id of DESIGN_TEMPLATE_IDS) {
      const composition = applyDesignTemplate(
        baseComposition({
          sections: [
            { id: "opening", type: "opening", enabled: true, data: { headline: "Amara & Devin" } },
            { id: "welcome", type: "welcome", enabled: true, data: { message: "Welcome" } },
          ],
        }),
        id
      );
      const html = renderToStaticMarkup(<CompositionRenderer composition={composition} canRsvp={false} />);
      // A signature drawn from the actually-applied typography/section-style
      // classes — six distinct templates must not collapse to fewer than
      // six distinct signatures ("not merely renamed colour swaps").
      const signature = [/font-sans[^"]*/, /rounded-\S+/, /shadow-\S+/].map((re) => html.match(re)?.[0] ?? "").join("|");
      seen.add(`${id}:${signature}`);
    }
    expect(seen.size).toBe(6);
  });

  it("applying the 'evening-burgundy' template changes the welcome card's border-radius class vs. an unset composition", () => {
    const plain = baseComposition({ sections: [{ id: "welcome", type: "welcome", enabled: true, data: { message: "Hi" } }] });
    const plainHtml = renderToStaticMarkup(<CompositionRenderer composition={plain} canRsvp={false} />);
    expect(plainHtml).toContain("rounded-3xl");

    const templated = baseComposition({
      themeTokens: { paletteId: "bronze", sectionStyleId: "ornate" },
      sections: [{ id: "welcome", type: "welcome", enabled: true, data: { message: "Hi" } }],
    });
    const templatedHtml = renderToStaticMarkup(<CompositionRenderer composition={templated} canRsvp={false} />);
    expect(templatedHtml).toContain("rounded-[28px]");
    expect(templatedHtml).not.toContain("rounded-3xl");
  });

  it("density scales section spacing to a different, still-fixed Tailwind class", () => {
    const airy = baseComposition({
      themeTokens: { paletteId: "gold", densityId: "airy" },
      featureConfig: { motion: true, ambientMotif: "none", openingBurst: false },
      sections: [
        { id: "opening", type: "opening", enabled: true, data: { headline: "Hi" } },
        { id: "closing", type: "closing", enabled: true, data: { message: "Bye" } },
      ],
    });
    const html = renderToStaticMarkup(<CompositionRenderer composition={airy} canRsvp={false} />);
    expect(html).toContain("mt-24"); // closing's mt-16 base, scaled by "airy"
  });
});
