import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const root = process.cwd();
const base = path.join(root, "design-library/hindu-wedding/review/minimum-viable-tier-path");

const records = [
  {
    id: "HW-CANOPY-001-V2", stableId: "HW-CANOPY-001", name: "Mango Leaf Toran", tier: "SILVER", file: "hw-canopy-001-v2-master.png", delivery: "hw-canopy-001-v2-delivery.webp", slot: "upper-canopy", anchor: "TOP_CENTER", maximumRenderedSize: [880, 260], scaleLimits: [0.82, 1, 1.06], altText: "Supported mango-leaf toran with a braided cord, tied end loops and coherent green leaves.", compatibility: ["HW-BG-001", "HW-ARCH-001", "HW-HEADER-001", "PAL-IVORY-GOLD"],
    prompt: "Transparent PNG cutout asset only. Create ONE complete supported mango-leaf toran as a clean premium editorial illustration isolated on a fully transparent RGBA canvas. OUTSIDE THE PHYSICAL CORD, LOOPS, BINDINGS, STEMS, AND LEAVES, EVERY PIXEL MUST HAVE ZERO ALPHA. Absolutely no ambient haze, aura, vignette, gradient, coloured glow, cast background, floor, wall, scene, or shadow field. Wide 8:3 canvas. One clearly visible braided natural-fibre support cord in a shallow downward arc, secure tied hanging loops fully visible at both ends, and exactly 21 individually readable mango leaves attached by short coherent stems and small antique-gold thread bindings. Mango leaves are long lance-shaped blades with tapered tips and coherent midribs, varied deep green to sage, subtle natural variation, no cloned stamping. Symmetric overall balance but independently shaped leaves. Soft highlights may exist only on the physical leaf/cord pixels. Entire object fully inside frame with generous empty transparent padding. Crisp clean anti-aliased alpha edges. NO text, watermark, logo, invitation, flowers, fruit, beads, bells, vines, banana leaves, betel leaves, floating leaves, disconnected parts, impossible knots, duplicates, crop, border, checkerboard, white/black/green background, matte, halo, smoke, fake script, sacred symbol.",
    reviewNotes: "Corrected v2 after v1 failed clean-alpha QA. Count/support/botanical coherence require Owner confirmation."
  },
  {
    id: "HW-CEREM-002-V1", stableId: "HW-CEREM-002", name: "Paired Brass Standing Lamps", tier: "SILVER", file: "hw-cerem-002-v1-master.png", delivery: "hw-cerem-002-v1-delivery.webp", slot: "lower-ceremonial", anchor: "BOTTOM_CENTER", maximumRenderedSize: [580, 300], scaleLimits: [0.82, 1, 1.05], altText: "Pair of complete grounded brass standing oil lamps with a clear central gap.", compatibility: ["HW-BG-001", "HW-ARCH-001", "HW-FLORAL-010-V1-BASE", "PAL-IVORY-GOLD"],
    prompt: "Transparent PNG cutout asset only. Create exactly TWO complete matching tall brass standing oil lamps as one reusable premium wedding-invitation component, isolated on a fully transparent RGBA canvas. OUTSIDE THE TWO PHYSICAL LAMPS, FLAMES, AND SMALL CONTACT SHADOWS, EVERY PIXEL MUST HAVE ZERO ALPHA: no background, haze, aura, vignette, gradient, floor, scene, or shadow field. Wide 8:5 canvas. Both lamps are equal scale and height, upright, separated by a large clear central gap, facing front in the same perspective. Each lamp must be physically plausible and complete from top to bottom: exactly one modest flame on one visible wick, one symmetric oil bowl with continuous rim, one joined central finial and straight turned shaft, and one stable broad circular foot resting on the same horizontal baseline. Polished aged brass with restrained champagne-gold highlights, refined editorial realism, soft warm light from upper centre. All joints visibly connected; both full flames and both full feet inside frame; subtle contact shadow directly beneath each foot only. No deity figure and no claim of a specific ritual tradition. NO extra lamps or flames, fused bowls, bent shafts, floating feet, unsupported fire, cropped base, ritual clutter, flowers, text, fake script, sacred symbol, watermark, logo, invitation, checkerboard, white/black/colour matte, halo, smoke, duplicate objects, impossible perspective.",
    reviewNotes: "Complete pair, equal scale and grounded. Ritual correctness remains a human-review gate."
  },
  {
    id: "HW-ANIMAL-002-V2", stableId: "HW-ANIMAL-002", name: "Illustrated Paired Peacocks", tier: "GOLD", file: "hw-animal-002-v2-master.png", delivery: "hw-animal-002-v2-delivery.webp", slot: "lower-corners", anchor: "BOTTOM_CENTER", maximumRenderedSize: [930, 430], scaleLimits: [0.78, 1, 1.04], altText: "Two equal-scale illustrated peacocks standing inward-facing on one baseline.", compatibility: ["HW-BG-001", "HW-ARCH-001", "HW-FLORAL-010-V1-BASE", "PAL-IVORY-GOLD", "H08"],
    prompt: "Transparent PNG cutout asset only. Create exactly TWO refined hand-painted editorial ILLUSTRATIONS of adult male Indian peafowl, not photoreal cutout photos, isolated on a fully transparent RGBA canvas. Outside the physical birds and tiny contact shadows, every pixel must be zero alpha: no background, plants, haze, aura, gradient, floor, scene, or shadow field. Wide 5:3 canvas. One bird at lower left faces inward right; one at lower right faces inward left. Equal scale and height, same baseline, large clear central gap. ANATOMY MUST BE ACCURATE: each has exactly one small head, one beak, one eye, a slender S-curved blue neck, one torso, two separate legs and two grounded feet with coherent toes, one folded wing, and one complete low trailing folded train. Each crown crest consists of several THIN UPRIGHT FEATHER SHAFTS ending in small spatulate tips—never a broad fan, mohawk, horn, halo or solid plume. Calm elegant independent poses; not copy-mirrored. Teal/ultramarine neck, muted green train with restrained ocelli, antique-gold ink accents; watercolor and fine ink on the bird only. Tails are not display fans and preserve central text. Entire crests, feet and all tail feathers fully inside frame. NO fan-shaped crest, photographic style, outward-facing birds, unequal scale, extra heads/eyes/legs/feet/wings, fused feet, impossible feathers, jewellery, riders, deity association, flowers, architecture, text, fake script, sacred symbols, watermark, invitation, checkerboard, matte, halo, crop or duplicates.",
    reviewNotes: "Pair/count/grounding/inward orientation pass. Broad stylised crests remain an explicit Owner/biological review point."
  },
  {
    id: "HW-EFFECT-004-V1", stableId: "HW-EFFECT-004", name: "Gold Sparkles", tier: "GOLD", file: "hw-effect-004-v1-master.png", delivery: "hw-effect-004-v1-delivery.webp", slot: "ambient-perimeter", anchor: "CENTER", maximumRenderedSize: [1000, 1778], scaleLimits: [1, 1, 1], altText: "Sparse decorative champagne-gold sparkles around the invitation perimeter.", compatibility: ["HW-BG-001", "HW-ARCH-001", "PAL-IVORY-GOLD"],
    prompt: "Transparent PNG overlay asset only for a vertical 9:16 premium digital invitation. Create a very sparse field of exactly 32 tiny restrained champagne-gold sparkles distributed mostly in the outer left and right edges, with the central 60 percent text column almost completely empty. Sparkles are a mix of minute points and a few delicate four-point glints, varied subtly in size and opacity, refined warm metallic light. Outside the physical sparkle pixels, every pixel must have zero alpha. No background, haze, aura, vignette, gradient, bokeh wash, fog, visible circle, lens flare, spotlight, or colour matte. Vertical 1000:1778 composition. The overlay must preserve text readability and feel quiet, premium, and sparse. NO glitter carpet, confetti, stars as symbols, constellations, large bursts, dense particles, text, fake script, flower, object, watermark, logo, invitation, checkerboard, white/black/colour background, seam, border or cropped glints.",
    reviewNotes: "Sparse edge placement passes trial readability review."
  },
  {
    id: "HW-EFFECT-002-V2", stableId: "HW-EFFECT-002", name: "Rose Petal Sprite Set", tier: "GOLD", file: "hw-effect-002-v2-petal-sprite-master.png", delivery: "hw-effect-002-v2-petal-sprite-delivery.webp", slot: "ambient-overlay", anchor: "TOP", maximumRenderedSize: [34, 34], scaleLimits: [0.6, 1, 1.2], altText: "Six isolated deep-red rose petals for a restrained decorative motion effect.", compatibility: ["HW-FLORAL-010-V1-BASE", "ANIM-PETALS", "PAL-IVORY-GOLD"],
    prompt: "ALPHA CUTOUT SPRITE SHEET, fully transparent background. Create exactly SIX separate individual deep-red rose petals arranged 3 across by 2 rows, generous empty space, no touching. IMPORTANT: all empty canvas pixels must be RGBA alpha 0. Do not render any red glow, dark red haze, vignette, gradient, surface, floor, backing card, shadow field, aura, or coloured matte. Only the six petal shapes may have visible pixels. Each petal is a distinct natural orientation and mild curl, botanically plausible with rounded softly notched upper edge, tapered attachment base, subtle vein, crimson-to-ruby shading contained inside the petal. Fine clean anti-aliased transparent edges. Landscape 3:2 canvas. NO whole flower, stem, leaf, extra petal, torn/confetti shape, motion blur, text, labels, grid lines, watermark, logo, checkerboard, white/black/red background, halo or crop.",
    reviewNotes: "Dependency remains blocked on botanical family approval; trial-only static/motion use."
  },
  {
    id: "HW-PEOPLE-005-V2", stableId: "HW-PEOPLE-005", name: "Rear-Facing Cinematic Couple", tier: "PLATINUM", file: "hw-people-005-v2-master.png", delivery: "hw-people-005-v2-delivery.webp", slot: "centre-artwork", anchor: "BOTTOM_CENTER", maximumRenderedSize: [380, 570], scaleLimits: [0.8, 1, 1.04], altText: "Rear-facing fictional couple holding hands in ivory-and-gold and deep-red formal wedding attire.", compatibility: ["HW-BG-001", "HW-ARCH-001", "HW-FLORAL-010-V1-BASE", "PAL-IVORY-GOLD", "H08"],
    prompt: "Edit this exact image only to create a clean transparent-background cutout. Preserve the two people, their anatomy, joined hands, hair, jewellery, garment embroidery, drape, hems, trousers, footwear, proportions, pose, scale, spacing and rim highlights exactly as shown. Do not redraw or change either person. Remove every atmospheric/background pixel: delete the brown/black/red haze, vignette, glow field, floor and all surrounding backdrop so that every pixel outside the physical figures and very small contact shadows immediately beneath their feet has alpha 0. Keep complete heads, hands, garments and feet. Produce clean anti-aliased edges with no coloured fringe or halo. No added objects, text, symbols, scene or crop.",
    sourcePrompt: "Transparent PNG cutout asset only. Create exactly TWO fictional adult people seen fully from behind as a refined cinematic editorial illustration for a premium digital wedding invitation, isolated on a fully transparent RGBA canvas. OUTSIDE THE TWO PHYSICAL FIGURES AND SMALL CONTACT SHADOWS, EVERY PIXEL MUST HAVE ZERO ALPHA: no background, architecture, floor, sky, haze, aura, vignette, gradient, scene, or shadow field. Vertical 2:3 canvas. Full-length rear view from head to footwear. They stand side-by-side on the same baseline with a small natural gap, calm upright posture, gently joining only their inner hands at comfortable hip height. ANATOMY MUST BE COHERENT: each person has one head, neck, two shoulders, torso, two arms, two hands, two legs and two grounded feet; the joined hands remain visibly two distinct anatomically plausible hands, five fingers where visible; no fused bodies or missing limbs. One figure wears elegant ivory Indian wedding formalwear described neutrally: a long tailored coat with subtle antique-gold embroidery, straight trousers and complete formal footwear. The other wears a deep red draped Indian formal ensemble with an ivory-and-antique-gold border, coherent folds, complete hem and footwear; elegant but not labelled as any particular family tradition. Restrained attached earrings and bangles only. Warm soft upper-centre rim light contained on garments and hair. Faces are not visible, no celebrity likeness. Entire heads, hands, garment hems and feet fully inside frame with generous transparent padding; open transparent area above shoulders. Small contact shadow immediately below each foot only. NO front or side faces, extra/missing fingers, arms, legs, feet or heads, fused hands, impossible posture, floating feet, broken drape, clipped garments, specific community label, sacred mark, ritual object, text, fake script, watermark, logo, invitation, checkerboard, white/black/colour matte, halo or crop.",
    reviewNotes: "Rear view, complete anatomy, hands, feet and garments pass initial visual QA. Cultural clothing interpretation remains human-review only; no family-tradition label is asserted."
  }
];

for (const child of [
  { parent: "HW-CEREM-002-V1", id: "HW-CEREM-002-V1-LEFT", name: "Brass Standing Lamp — Left", file: "hw-cerem-002-v1-left-master.png", delivery: "hw-cerem-002-v1-left-delivery.webp", slot: "lower-left", anchor: "BOTTOM_LEFT", maximumRenderedSize: [280, 300], altText: "Complete grounded brass standing oil lamp for the left side of the invitation." },
  { parent: "HW-CEREM-002-V1", id: "HW-CEREM-002-V1-RIGHT", name: "Brass Standing Lamp — Right", file: "hw-cerem-002-v1-right-master.png", delivery: "hw-cerem-002-v1-right-delivery.webp", slot: "lower-right", anchor: "BOTTOM_RIGHT", maximumRenderedSize: [280, 300], altText: "Complete grounded brass standing oil lamp for the right side of the invitation." },
  { parent: "HW-ANIMAL-002-V2", id: "HW-ANIMAL-002-V2-LEFT", name: "Illustrated Peacock — Left", file: "hw-animal-002-v2-left-master.png", delivery: "hw-animal-002-v2-left-delivery.webp", slot: "lower-left", anchor: "BOTTOM_LEFT", maximumRenderedSize: [450, 430], altText: "Illustrated grounded peacock for the left side, facing inward toward the invitation centre." },
  { parent: "HW-ANIMAL-002-V2", id: "HW-ANIMAL-002-V2-RIGHT", name: "Illustrated Peacock — Right", file: "hw-animal-002-v2-right-master.png", delivery: "hw-animal-002-v2-right-delivery.webp", slot: "lower-right", anchor: "BOTTOM_RIGHT", maximumRenderedSize: [450, 430], altText: "Illustrated grounded peacock for the right side, facing inward toward the invitation centre." }
]) {
  const parent = records.find((record) => record.id === child.parent);
  records.push({ ...parent, ...child, parentCandidateId: child.parent, derivation: "Lossless directional split from the reviewed combined transparent master; no mirroring, redrawing or generative modification.", reviewNotes: `${parent.reviewNotes} Directional child retains the parent's original anatomy, lighting and orientation.` });
}

async function technical(filePath) {
  const buffer = await fs.readFile(filePath);
  const image = sharp(buffer).ensureAlpha();
  const { width, height } = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * info.channels + 3] > 0) {
      if (x < left) left = x; if (x + 1 > right) right = x + 1;
      if (y < top) top = y; if (y + 1 > bottom) bottom = y + 1;
    }
  }
  return { dimensions: [width, height], alphaBounds: right > left ? [left, top, right, bottom] : null, colourSpace: "sRGB", alpha: true, bytes: buffer.byteLength, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}

for (const record of records) {
  record.status = "UNDER_REVIEW";
  record.productionEligible = false;
  record.model = "ChatGPT built-in image generation";
  record.provenance = record.derivation || "Original candidate generated for Enveloped in this trial; no downloaded reference pixels or client likeness.";
  record.master = `masters/${record.file}`;
  record.deliveryFile = `delivery/${record.delivery}`;
  record.optionCard = `option-cards/${record.delivery.replace("-delivery.webp", "-option-card.webp")}`;
  record.thumbnail = `thumbnails/${record.delivery.replace("-delivery.webp", "-thumbnail.webp")}`;
  record.detailCrop = `details/${record.file.replace("-master.png", "-detail.png")}`;
  record.technical = await technical(path.join(base, record.master));
}

const manifest = {
  schemaVersion: "1.0.0",
  trial: "Ivory Palace Progression",
  baseCommit: "9259f25f2b0c68ab18d6bce8ff5abe1e62c02252",
  approvalStatus: "UNDER_REVIEW",
  productionSelectable: false,
  foundation: ["HW-BG-001:PALE", "HW-ARCH-001-V2", "HW-HEADER-001", "HW-FLORAL-010-V1-BASE:UNDER_REVIEW_TRIAL_DEPENDENCY"],
  codeNativeAssets: [
    { id: "HW-LIGHT-007-V1", tier: "SILVER", status: "UNDER_REVIEW", implementation: "trial.css .central-glow", staticFallback: "Identical CSS glow; no motion", note: "Broad feathered glow, no visible circle." },
    { id: "TRIAL-FALLING-PETALS-V1", tier: "GOLD", status: "UNDER_REVIEW", implementation: "trial.css fixed six-path animation", staticFallback: "Three petals at registered lower coordinates", reducedMotion: "Transforms disabled by prefers-reduced-motion." },
    { id: "HW-EFFECT-008-V1", tier: "PLATINUM", status: "UNDER_REVIEW", implementation: "trial.css opacity/clip reveal", staticFallback: "Exact HW-FLORAL-010-V1-BASE final placement", reducedMotion: "Final state shown immediately." },
    { id: "TRIAL-CINEMATIC-LIGHT-V1", tier: "PLATINUM", status: "UNDER_REVIEW", implementation: "trial.css .cinematic-light", staticFallback: "Identical static light", note: "Warm source aligned to couple and architecture." }
  ],
  typography: { status: "TRIAL_FALLBACK_NOT_FINAL_BRAND_APPROVAL", names: "Alex Brush 400, OFL-1.1", headingsDateVenue: "Playfair Display 400/600, OFL-1.1", body: "System serif", uiAccessibility: "System sans", prohibitedPendingLicence: ["Mozart Script", "Slight", "Ms Claudy", "Ecatherina", "Modern Symphony"] },
  assets: records
};

await fs.mkdir(path.join(base, "metadata"), { recursive: true });
await fs.writeFile(path.join(base, "metadata/review-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${records.length} raster records to metadata/review-manifest.json`);
