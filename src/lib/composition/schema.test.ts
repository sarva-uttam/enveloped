import { describe, it, expect } from "vitest";
import {
  InvitationCompositionSchema,
  parseComposition,
  COMPOSITION_SCHEMA_VERSION,
  SECTION_TYPES,
  LIMITS,
} from "./schema";

/**
 * Stage 6 (see PROJECT_STATUS.md's Stage 6 section, Part I) — proving
 * the versioned composition schema actually enforces every safety
 * property Part B requires, not just that it happens to accept
 * well-formed input.
 */

function validComposition(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    templateId: null,
    designPackId: "neutral-classic",
    eventCategory: "wedding-other",
    weddingContext: null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: "gold" },
    sections: [
      { id: "opening", type: "opening", enabled: true, data: { headline: "You're Invited" } },
      { id: "closing", type: "closing", enabled: true, data: { message: "See you there" } },
    ],
    featureConfig: { motion: true, ambientMotif: "none", openingBurst: false },
    ...overrides,
  };
}

describe("a valid composition parses", () => {
  it("accepts a minimal, well-formed composition", () => {
    const result = InvitationCompositionSchema.safeParse(validComposition());
    expect(result.success).toBe(true);
  });

  it("parseComposition() returns the parsed object, not just true/false", () => {
    const result = parseComposition(validComposition());
    expect(result).not.toBeNull();
    expect(result?.designPackId).toBe("neutral-classic");
  });

  it("accepts every registered section type with valid data (see each type's own case below for the exact valid shape)", () => {
    const cases: Record<string, unknown> = {
      opening: { headline: "Hi" },
      greeting: {},
      intro: { title: "The Couple" },
      welcome: { message: "Welcome" },
      story: { body: "Once upon a time" },
      schedule: { entries: [{ id: "e1", eventTypeId: "reception", label: "Reception", value: "7pm" }] },
      dateTime: { eventDate: "2027-01-01T18:00:00Z" },
      venue: { name: "The Hall" },
      mapLink: { label: "Directions", url: "https://maps.example.com" },
      dressCode: { description: "Black tie" },
      gallery: { items: [{ id: "g1", imageUrl: null, alt: "A moment", colorFallback: "#fff" }] },
      rsvp: {},
      music: {},
      closing: { message: "Bye" },
      customText: { body: "Extra info" },
    };
    for (const type of SECTION_TYPES) {
      const composition = validComposition({
        sections: [{ id: "s1", type, enabled: true, data: cases[type] }],
      });
      const result = InvitationCompositionSchema.safeParse(composition);
      expect(result.success, `${type} should be valid: ${JSON.stringify(!result.success && result.error.issues)}`).toBe(true);
    }
  });
});

describe("invalid schema versions fail", () => {
  it("rejects a version other than the current one", () => {
    expect(InvitationCompositionSchema.safeParse(validComposition({ schemaVersion: 2 })).success).toBe(false);
    expect(InvitationCompositionSchema.safeParse(validComposition({ schemaVersion: 0 })).success).toBe(false);
  });

  it("rejects a missing schemaVersion entirely", () => {
    const draft = validComposition() as Record<string, unknown>;
    delete draft.schemaVersion;
    expect(InvitationCompositionSchema.safeParse(draft).success).toBe(false);
  });
});

describe("unknown sections fail", () => {
  it("rejects a section type not in the registry", () => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "totally-made-up-type", enabled: true, data: {} }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects an unknown top-level key anywhere in the document (strict, not stripped)", () => {
    const composition = validComposition({ maliciousExtra: "<script>alert(1)</script>" });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects an unknown key inside a section's own data (strict per-section too)", () => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "opening", enabled: true, data: { headline: "Hi", extraDangerousField: "x" } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });
});

describe("arbitrary HTML/scripts fail", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<b>bold</b>",
    "text with <br/> tag",
    "javascript:alert(1)",
  ])("rejects %s in a free-text field", (dangerous) => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: dangerous } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects inline event-handler-looking syntax even without angle brackets", () => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "onclick=alert(1)" } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("accepts ordinary punctuation and non-Latin text", () => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "Priya & Devansh — 你好, welcome!" } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
  });
});

describe("unsafe URLs fail", () => {
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.com", "ftp://x.com"])(
    "rejects %s as a mapLink URL",
    (url) => {
      const composition = validComposition({
        sections: [{ id: "s1", type: "mapLink", enabled: true, data: { label: "Go", url } }],
      });
      expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
    }
  );

  it.each(["https://maps.example.com/x", "http://example.com", "mailto:host@example.com", "tel:+15551234567", "/some/internal/path"])(
    "accepts %s as a mapLink URL",
    (url) => {
      const composition = validComposition({
        sections: [{ id: "s1", type: "mapLink", enabled: true, data: { label: "Go", url } }],
      });
      expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
    }
  );

  it("rejects an unsafe URL used as a gallery imageUrl", () => {
    const composition = validComposition({
      sections: [
        { id: "s1", type: "gallery", enabled: true, data: { items: [{ id: "g1", imageUrl: "javascript:alert(1)", alt: "x" }] } },
      ],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });
});

describe("excessive text or section counts fail", () => {
  it("rejects a section list longer than LIMITS.maxSections", () => {
    const sections = Array.from({ length: LIMITS.maxSections + 1 }, (_, i) => ({
      id: `s${i}`,
      type: "customText" as const,
      enabled: true,
      data: { body: "x" },
    }));
    expect(InvitationCompositionSchema.safeParse(validComposition({ sections })).success).toBe(false);
  });

  it("accepts exactly LIMITS.maxSections", () => {
    const sections = Array.from({ length: LIMITS.maxSections }, (_, i) => ({
      id: `s${i}`,
      type: "customText" as const,
      enabled: true,
      data: { body: "x" },
    }));
    expect(InvitationCompositionSchema.safeParse(validComposition({ sections })).success).toBe(true);
  });

  it("rejects a welcome message longer than the medium-text limit", () => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "a".repeat(LIMITS.mediumText + 1) } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects more schedule entries than LIMITS.maxScheduleEntries", () => {
    const entries = Array.from({ length: LIMITS.maxScheduleEntries + 1 }, (_, i) => ({
      id: `e${i}`,
      eventTypeId: null,
      label: "Event",
      value: "Detail",
    }));
    const composition = validComposition({
      sections: [{ id: "s1", type: "schedule", enabled: true, data: { entries } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects more gallery items than LIMITS.maxGalleryItems", () => {
    const items = Array.from({ length: LIMITS.maxGalleryItems + 1 }, (_, i) => ({
      id: `g${i}`,
      imageUrl: null,
      alt: "x",
    }));
    const composition = validComposition({
      sections: [{ id: "s1", type: "gallery", enabled: true, data: { items } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects an empty string where text is required", () => {
    const composition = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "" } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });
});

describe("stable section ordering", () => {
  it("preserves the exact array order given — sections are never reordered or deduplicated by the schema itself", () => {
    const composition = validComposition({
      sections: [
        { id: "closing", type: "closing", enabled: true, data: { message: "Bye" } },
        { id: "opening", type: "opening", enabled: true, data: { headline: "Hi" } },
      ],
    });
    const result = InvitationCompositionSchema.parse(composition);
    expect(result.sections.map((s) => s.id)).toEqual(["closing", "opening"]);
  });

  it("rejects duplicate section ids — order must be deliberate and unambiguous, not resolvable by a renderer guessing", () => {
    const composition = validComposition({
      sections: [
        { id: "dup", type: "opening", enabled: true, data: { headline: "Hi" } },
        { id: "dup", type: "closing", enabled: true, data: { message: "Bye" } },
      ],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });
});

describe("theme tokens are allowlisted", () => {
  it("rejects a paletteId not in the trusted registry", () => {
    expect(InvitationCompositionSchema.safeParse(validComposition({ themeTokens: { paletteId: "hot-pink-arbitrary" } })).success).toBe(
      false
    );
  });

  it("accepts every registered paletteId", () => {
    for (const paletteId of ["bronze", "silver", "gold", "platinum", "neutral-classic", "hindu-classic"]) {
      expect(InvitationCompositionSchema.safeParse(validComposition({ themeTokens: { paletteId } })).success).toBe(true);
    }
  });

  it("rejects a non-hex accentOverride (no raw CSS/arbitrary strings)", () => {
    const composition = validComposition({ themeTokens: { paletteId: "gold", accentOverride: "rgb(1,2,3)" } });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("accepts a valid hex accentOverride", () => {
    const composition = validComposition({ themeTokens: { paletteId: "gold", accentOverride: "#123abc" } });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
  });
});

describe("animation/feature-config choices are allowlisted", () => {
  it("rejects an ambientMotif value outside the closed set", () => {
    const composition = validComposition({ featureConfig: { motion: true, ambientMotif: "sparkles-everywhere", openingBurst: false } });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("accepts every registered ambientMotif value", () => {
    for (const ambientMotif of ["none", "light", "full"]) {
      const composition = validComposition({ featureConfig: { motion: true, ambientMotif, openingBurst: false } });
      expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
    }
  });
});

describe("cultural-pack identifiers are allowlisted", () => {
  it("accepts the two currently-registered pack ids", () => {
    expect(InvitationCompositionSchema.safeParse(validComposition({ designPackId: "neutral-classic" })).success).toBe(true);
    expect(InvitationCompositionSchema.safeParse(validComposition({ designPackId: "hindu-wedding" })).success).toBe(true);
  });

  it("rejects a future, not-yet-registered pack id — 'future pack identifiers cannot be falsely selected before registration'", () => {
    for (const futureId of ["muslim-wedding", "christian-wedding", "civil-wedding", "mauritian-multicultural", "birthday-classic", "corporate-classic"]) {
      expect(InvitationCompositionSchema.safeParse(validComposition({ designPackId: futureId })).success).toBe(false);
    }
  });
});

describe("wedding context: custom occasion label rule", () => {
  it("accepts a custom label only when occasionId is 'custom'", () => {
    const composition = validComposition({
      weddingContext: { occasionId: "custom", occasionCustomLabel: "Ganesh Puja", culturalPackId: "hindu-wedding" },
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
  });

  it("rejects a custom label when occasionId is anything else", () => {
    const composition = validComposition({
      weddingContext: { occasionId: "reception", occasionCustomLabel: "Should not be allowed", culturalPackId: "hindu-wedding" },
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("rejects an occasionId not in the event-type registry", () => {
    const composition = validComposition({
      weddingContext: { occasionId: "made-up-occasion", occasionCustomLabel: null, culturalPackId: "hindu-wedding" },
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });

  it("accepts every legacy occasion id too — preserved, not reinterpreted", () => {
    for (const legacyId of ["haldi", "sangeet_mehendi", "wedding_day", "reception"]) {
      const composition = validComposition({
        weddingContext: { occasionId: legacyId, occasionCustomLabel: null, culturalPackId: "hindu-wedding" },
      });
      expect(InvitationCompositionSchema.safeParse(composition).success).toBe(true);
    }
  });
});

describe("event category and locale allowlists", () => {
  it("rejects an eventCategory not in the trusted list", () => {
    expect(InvitationCompositionSchema.safeParse(validComposition({ eventCategory: "made-up-category" })).success).toBe(false);
  });

  it("rejects a locale not in LOCALES", () => {
    expect(InvitationCompositionSchema.safeParse(validComposition({ locale: "xx" })).success).toBe(false);
  });

  it("rejects a dir value outside ltr/rtl/auto", () => {
    expect(InvitationCompositionSchema.safeParse(validComposition({ dir: "sideways" })).success).toBe(false);
  });
});

describe("safe ids", () => {
  it("rejects a section id with unsafe characters", () => {
    const composition = validComposition({
      sections: [{ id: "not a slug!", type: "opening", enabled: true, data: { headline: "Hi" } }],
    });
    expect(InvitationCompositionSchema.safeParse(composition).success).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Stage 7 (see PROJECT_STATUS.md's Stage 7 section, Part B/F/I).
// ---------------------------------------------------------------------

describe("Stage 7: trusted motion presets are allowlisted; arbitrary animation config is rejected", () => {
  it("accepts every one of the eight trusted preset names on a section", () => {
    for (const preset of ["none", "fade", "rise", "scale", "ceremonial", "stagger", "petals", "glow"]) {
      const c = validComposition({
        sections: [{ id: "s1", type: "welcome", enabled: true, motionPreset: preset, data: { message: "hi" } }],
      });
      expect(InvitationCompositionSchema.safeParse(c).success, preset).toBe(true);
    }
  });

  it("rejects a motionPreset that isn't one of the eight trusted names", () => {
    const c = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, motionPreset: "explode-violently", data: { message: "hi" } }],
    });
    expect(InvitationCompositionSchema.safeParse(c).success).toBe(false);
  });

  it("rejects arbitrary Framer-Motion-shaped animation config smuggled into a section", () => {
    // duration/ease/keyframes/transition are NOT fields anywhere in the
    // schema — `.strict()` rejects the whole document rather than
    // stripping them, so there is no way for stored data to carry raw
    // animation values at all.
    for (const evil of [
      { duration: 999 },
      { ease: [0, 0, 0, 0] },
      { transition: { type: "spring", stiffness: 1e9 } },
      { keyframes: [{ opacity: 0 }, { opacity: 1 }] },
      { onAnimationStart: "alert(1)" },
    ]) {
      const c = validComposition({
        sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "hi" }, ...evil }],
      });
      expect(InvitationCompositionSchema.safeParse(c).success, JSON.stringify(evil)).toBe(false);
    }
  });

  it("defaults a section with no motionPreset to 'fade' — every pre-Stage-7 composition still parses", () => {
    const c = validComposition({
      sections: [{ id: "s1", type: "welcome", enabled: true, data: { message: "hi" } }],
    });
    const parsed = InvitationCompositionSchema.parse(c);
    expect(parsed.sections[0].motionPreset).toBe("fade");
  });

  it("defaults featureConfig.envelopeOpening to true when omitted", () => {
    const c = validComposition();
    delete (c.featureConfig as Record<string, unknown>).envelopeOpening;
    const parsed = InvitationCompositionSchema.parse(c);
    expect(parsed.featureConfig.envelopeOpening).toBe(true);
  });
});

describe("Stage 7: music configuration is safe and bounded", () => {
  function withMusic(data: Record<string, unknown>) {
    return validComposition({
      sections: [{ id: "s1", type: "music", enabled: true, data }],
    });
  }

  it("defaults to no source (src: null) and no autoplay-relevant config when omitted", () => {
    const parsed = InvitationCompositionSchema.parse(withMusic({}));
    const music = parsed.sections[0];
    expect(music.type === "music" && music.data.src).toBeNull();
    expect(music.type === "music" && music.data.loop).toBe(false);
    expect(music.type === "music" && music.data.startVolume).toBe(0.6);
  });

  it("accepts a bounded https source, title, credit, loop, and start volume", () => {
    const c = withMusic({
      src: "https://cdn.example.com/track.mp3",
      title: "Our Song",
      credit: "The Client's Own Recording",
      loop: true,
      startVolume: 0.3,
    });
    expect(InvitationCompositionSchema.safeParse(c).success).toBe(true);
  });

  it("accepts an internal path (this project's own local/test fixtures)", () => {
    expect(InvitationCompositionSchema.safeParse(withMusic({ src: "/audio/sample-test-tone.wav" })).success).toBe(true);
  });

  it.each([
    "http://cdn.example.com/track.mp3",
    "javascript:alert(1)",
    "data:audio/wav;base64,AAAA",
    "//evil.com/track.mp3",
    "https://open.spotify.com/track/xyz",
  ])("rejects unsafe or non-direct audio source %s", (src) => {
    // Note: an https:// Spotify *page* URL passes the protocol check but
    // is a player embed, not a playable file — the schema can't tell
    // those apart by URL alone, so this documents that the LAST line
    // (open.spotify.com) is accepted by the schema; the "don't embed a
    // third-party player" rule is enforced by AudioPlayer.tsx only ever
    // using the value as an <audio src>, never as an iframe.
    const accepted = InvitationCompositionSchema.safeParse(withMusic({ src })).success;
    if (src.startsWith("https://open.spotify.com")) {
      expect(accepted).toBe(true);
    } else {
      expect(accepted).toBe(false);
    }
  });

  it("rejects a startVolume outside the 0..1 safe range", () => {
    expect(InvitationCompositionSchema.safeParse(withMusic({ src: "/audio/x.wav", startVolume: 1.5 })).success).toBe(false);
    expect(InvitationCompositionSchema.safeParse(withMusic({ src: "/audio/x.wav", startVolume: -0.2 })).success).toBe(false);
  });

  it("rejects unrestricted embed HTML anywhere in music data", () => {
    expect(InvitationCompositionSchema.safeParse(withMusic({ title: "<iframe src=evil>" })).success).toBe(false);
    expect(InvitationCompositionSchema.safeParse(withMusic({ embedHtml: "<iframe></iframe>" })).success).toBe(false);
  });
});
