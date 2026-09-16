#!/usr/bin/env node
// Disposable, local-only fixture seeding for Stage 12 visual review and
// the tests/browser/ Playwright suite. Never imports anything from src/
// — plain @supabase/supabase-js only, so it runs standalone with `node`
// against the LOCAL Supabase stack. Never touches production:
// getLocalEnv() below refuses anything whose resolved hostname isn't
// loopback, the same guarantee tests/integration/helpers/local-env.ts
// gives the vitest integration suite.
//
// Idempotent: re-running this deletes and recreates every
// "stage12review-*" row first, so it's safe to run repeatedly during a
// review session. Everything it creates is disposable — never seed data
// meant to persist; re-run `npm run db:reset` to wipe it all.
//
// Usage: node scripts/seed-visual-review.mjs
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function getLocalEnv() {
  const raw = execFileSync("supabase", ["status", "-o", "json"], { cwd: process.cwd(), encoding: "utf8" });
  const json = JSON.parse(raw);
  const apiUrl = json.API_URL;
  const serviceRoleKey = json.SERVICE_ROLE_KEY;
  const host = new URL(apiUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Refusing to seed: API_URL "${apiUrl}" is not loopback.`);
  }
  return { apiUrl, serviceRoleKey };
}

const { apiUrl, serviceRoleKey } = getLocalEnv();
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

const RUN = "stage12review";
const ADMIN_EMAIL = `${RUN}-owner@example.test`;
const ADMIN_PASSWORD = `Stage12Review!${Date.now()}`;

function sectionsFor(kind) {
  if (kind === "neutral") {
    return [
      { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { eyebrow: "Together with their families", headline: "Amara & Devin" } },
      { id: "welcome", type: "welcome", enabled: true, motionPreset: "fade", data: { message: "We would be honored to have you join us as we begin our life together." } },
      { id: "story", type: "story", enabled: true, motionPreset: "fade", data: { title: "How it started", body: "We met on a rainy Tuesday at a bookshop neither of us usually visited — five years later, here we are." } },
      { id: "schedule", type: "schedule", enabled: true, motionPreset: "fade", data: { entries: [
        { id: "ceremony", eventTypeId: "wedding_ceremony", label: "Ceremony", value: "4:00 PM — Garden Pavilion" },
        { id: "reception", eventTypeId: "reception", label: "Reception", value: "6:30 PM — The Ivy Room" },
      ] } },
      { id: "date-time", type: "dateTime", enabled: true, motionPreset: "fade", data: { eventDate: "2027-06-12T16:00:00", label: "Countdown to our ceremony" } },
      { id: "venue", type: "venue", enabled: true, motionPreset: "fade", data: { name: "The Ivy Room at Fairhaven Gardens", address: "214 Willow Lane, Fairhaven" } },
      { id: "dress-code", type: "dressCode", enabled: true, motionPreset: "fade", data: { description: "Garden formal — soft, warm tones welcome." } },
      { id: "gallery", type: "gallery", enabled: true, motionPreset: "fade", data: { items: [
        { id: "g1", imageUrl: null, alt: "Amara and Devin at the lake, autumn", colorFallback: "#cba36b" },
        { id: "g2", imageUrl: null, alt: "Engagement portrait, golden hour", colorFallback: "#e2c07a" },
        { id: "g3", imageUrl: null, alt: "The two of them laughing at dinner", colorFallback: "#c26b7a" },
      ] } },
      { id: "rsvp", type: "rsvp", enabled: true, motionPreset: "fade", data: { prompt: "Kindly reply by May 1st." } },
      { id: "music", type: "music", enabled: true, motionPreset: "fade", data: { src: "/audio/sample-test-tone.wav", title: "A Thousand Years (instrumental)", credit: "Local test fixture — royalty-free sample tone", loop: true, startVolume: 0.5 } },
      { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "We can't wait to celebrate with you." } },
    ];
  }
  return [
    { id: "opening", type: "opening", enabled: true, motionPreset: "fade", data: { eyebrow: "With the blessings of our families", headline: "Priya & Karan" } },
    { id: "welcome", type: "welcome", enabled: true, motionPreset: "fade", data: { message: "We joyfully invite you to celebrate our wedding festivities with us." } },
    { id: "story", type: "story", enabled: true, motionPreset: "fade", data: { title: "Our journey", body: "Introduced by mutual friends at a Diwali gathering, we knew within the year this was forever." } },
    { id: "schedule", type: "schedule", enabled: true, motionPreset: "fade", data: { entries: [
      { id: "haldi", eventTypeId: "haldi", label: "Haldi", value: "Thursday, 11:00 AM — Family residence" },
      { id: "mehendi", eventTypeId: "mehendi", label: "Mehendi", value: "Thursday, 4:00 PM — Family residence" },
      { id: "sangeet", eventTypeId: "sangeet", label: "Sangeet", value: "Friday, 7:00 PM — Banquet Hall" },
      { id: "ceremony", eventTypeId: "wedding_ceremony", label: "Wedding Ceremony", value: "Saturday, 10:00 AM — Grand Mandap Lawns" },
      { id: "reception", eventTypeId: "reception", label: "Reception", value: "Saturday, 7:00 PM — Grand Mandap Lawns" },
    ] } },
    { id: "date-time", type: "dateTime", enabled: true, motionPreset: "fade", data: { eventDate: "2027-11-20T10:00:00", label: "Countdown to the ceremony" } },
    { id: "venue", type: "venue", enabled: true, motionPreset: "fade", data: { name: "Grand Mandap Lawns", address: "88 Marigold Road, Rosedale" } },
    { id: "dress-code", type: "dressCode", enabled: true, motionPreset: "fade", data: { description: "Festive traditional attire — gold and jewel tones encouraged." } },
    { id: "gallery", type: "gallery", enabled: true, motionPreset: "fade", data: { items: [
      { id: "g1", imageUrl: null, alt: "Priya and Karan at the mehendi ceremony", colorFallback: "#b8862f" },
      { id: "g2", imageUrl: null, alt: "Engagement portrait with marigold garlands", colorFallback: "#f8ecd2" },
      { id: "g3", imageUrl: null, alt: "Family celebrating at the sangeet", colorFallback: "#7a2632" },
    ] } },
    { id: "rsvp", type: "rsvp", enabled: true, motionPreset: "fade", data: { prompt: "Please RSVP by October 1st." } },
    { id: "music", type: "music", enabled: true, motionPreset: "fade", data: { src: "/audio/sample-test-tone.wav", title: "Mehendi Laga Ke Rakhna (instrumental)", credit: "Local test fixture — royalty-free sample tone", loop: true, startVolume: 0.5 } },
    { id: "closing", type: "closing", enabled: true, motionPreset: "fade", data: { message: "With love and joy, we look forward to celebrating with you." } },
  ];
}

const TEMPLATES = {
  "timeless-ivory": { pack: "neutral-classic", palette: "neutral-classic", typography: "classic-serif", sectionStyle: "soft", density: "comfortable", motif: "soft-glow", envelope: "classic", motion: "fade", ambient: "light", burst: false },
  "modern-editorial": { pack: "neutral-classic", palette: "silver", typography: "editorial-sans", sectionStyle: "minimal", density: "airy", motif: "botanical-line", envelope: "bordered-frame", motion: "rise", ambient: "light", burst: false },
  "evening-burgundy": { pack: "neutral-classic", palette: "bronze", typography: "royal-display", sectionStyle: "ornate", density: "compact", motif: "soft-glow", envelope: "monogram-seal", motion: "ceremonial", ambient: "full", burst: true },
  "golden-marigold": { pack: "hindu-wedding", palette: "hindu-classic", typography: "classic-serif", sectionStyle: "soft", density: "comfortable", motif: "marigold-drift", envelope: "classic", motion: "petals", ambient: "full", burst: false },
  "rose-mandap": { pack: "hindu-wedding", palette: "hindu-classic", typography: "editorial-sans", sectionStyle: "framed", density: "comfortable", motif: "lotus-geometric", envelope: "bordered-frame", motion: "stagger", ambient: "light", burst: false },
  "royal-sangeet": { pack: "hindu-wedding", palette: "gold", typography: "royal-display", sectionStyle: "ornate", density: "comfortable", motif: "diya-warmth", envelope: "monogram-seal", motion: "glow", ambient: "full", burst: true },
};

function compositionFor(templateId) {
  const t = TEMPLATES[templateId];
  const kind = t.pack === "hindu-wedding" ? "hindu" : "neutral";
  const sections = sectionsFor(kind).map((s) => ({ ...s, motionPreset: t.motion }));
  return {
    schemaVersion: 1,
    templateId,
    designPackId: t.pack,
    eventCategory: kind === "hindu" ? "wedding-hindu" : "wedding-other",
    weddingContext: kind === "hindu" ? { occasionId: "wedding_ceremony", occasionCustomLabel: null, culturalPackId: "hindu-wedding" } : null,
    locale: "en",
    dir: "ltr",
    themeTokens: { paletteId: t.palette, typographyId: t.typography, sectionStyleId: t.sectionStyle, densityId: t.density },
    featureConfig: { motion: true, ambientMotif: t.ambient, openingBurst: t.burst, envelopeOpening: true, decorativeMotifId: t.motif, envelopeTreatmentId: t.envelope },
    sections,
  };
}

async function cleanup() {
  await admin.from("invites").delete().like("slug", `${RUN}-%`);
  const { data: users } = await admin.auth.admin.listUsers();
  const existing = users?.users.find((u) => u.email === ADMIN_EMAIL);
  if (existing) {
    await admin.from("app_admins").delete().eq("user_id", existing.id);
    await admin.auth.admin.deleteUser(existing.id);
  }
}

async function main() {
  console.log("Cleaning up any previous run...");
  await cleanup();

  console.log("Creating disposable admin user...");
  const { data: signUp, error: signUpError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (signUpError) throw new Error(`createUser failed: ${signUpError.message}`);
  const userId = signUp.user.id;

  const { error: grantError } = await admin.from("app_admins").insert({ user_id: userId, note: "Stage 12 disposable visual-review admin" });
  if (grantError) throw new Error(`grant admin failed: ${grantError.message}`);

  const slugs = {};
  for (const templateId of Object.keys(TEMPLATES)) {
    const slug = `${RUN}-${templateId}`;
    const composition = compositionFor(templateId);
    const { data, error } = await admin
      .from("invites")
      .insert({
        slug,
        category: composition.eventCategory,
        tier: "platinum",
        answers: {},
        content: { headline: composition.sections[0].data.headline },
        paid: true,
        generator_kind: templateId === "royal-sangeet" ? "concierge" : "self-service",
        composition,
        occasion: composition.weddingContext?.occasionId ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`insert invite ${slug} failed: ${error.message}`);
    slugs[templateId] = { id: data.id, slug };
    console.log(`  created ${slug} -> ${data.id}`);
  }

  // Publish one (timeless-ivory) so a real /invite/[id] view is reachable
  // without going through the admin publish button.
  await admin.from("invites").update({ published_at: new Date().toISOString() }).eq("id", slugs["timeless-ivory"].id);

  // Give the concierge (royal-sangeet) fixture a couple of guests so the
  // Guests & RSVP tab summary has real numbers.
  await admin.from("invite_guests").insert([
    { invite_id: slugs["royal-sangeet"].id, name: "Ananya Rao", slug: "ananya-rao", click_teaser: "A little something for you.", permitted_attendees: 2, allow_plus_one: true, is_active: true },
    { invite_id: slugs["royal-sangeet"].id, name: "Rohan Mehta", slug: "rohan-mehta", click_teaser: "Open me!", permitted_attendees: 1, allow_plus_one: false, is_active: true },
  ]);

  console.log("\nDone.");
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log("(Password auth isn't exposed in the UI — sign in via a generated magic link; see tests/browser/global-setup.ts or REVIEW_ACCESS.md.)");
  console.log("Invitation ids:", JSON.stringify(slugs, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
