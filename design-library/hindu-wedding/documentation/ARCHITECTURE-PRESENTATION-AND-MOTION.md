# Architecture Presentation and Motion Contract

Architectural assets are transparent source components. Their approved appearance is controlled by the trusted HTML invitation template rather than baked permanently into the artwork. Claude Code may implement this contract, but neither the browser nor the client may invent unrestricted values or arbitrary layer combinations.

## Layer and placement

Architecture occupies visual layer 2 above the selected background and below editable HTML invitation content. One primary architectural component may be active at a time. It is bottom-centred, uniformly scaled, and may never be cropped through a pillar or arch.

The centre remains reserved for semantic HTML: invitation introduction, couple names, date, venue, ceremony information and optional RSVP controls. Text is never baked into the architectural image.

## Approved presentation modes

### Edge Frame

The structure remains near the perimeter and guides attention toward the centre. This is the default Bronze treatment and the reduced-motion fallback for every tier.

### Soft Architectural Surround

The structure remains visible but uses a restrained peripheral fade and controlled opacity. This is the default Silver treatment. The centre must remain visually quiet and fully readable.

### Depth Reveal

The structure begins slightly enlarged, then the camera moves forward between the pillars while the architecture travels toward the screen edges and the invitation content settles into view. This is available only to Gold and Platinum templates.

Depth Reveal requirements:

- duration between 1.5 and 2.5 seconds;
- smooth CSS transform or another reviewed renderer-native implementation;
- no distortion of the master asset;
- user-skippable;
- no autoplay loop;
- final text remains stable and readable;
- reduced-motion mode immediately uses the static Edge Frame state.

## Controlled rendering parameters

```ts
type ArchitecturePresentation = {
  assetId: string;
  mode: "EDGE_FRAME" | "SOFT_ARCHITECTURAL_SURROUND" | "DEPTH_REVEAL";
  opacity: number;      // registered range: 0.72–1.00
  scale: number;        // registered range: 0.80–1.08
  edgeFade: number;     // registered range: 0.00–0.16
  blendMode: "normal";
  position: "bottom-center";
};
```

Templates store reviewed values. Client-facing controls select approved presets rather than arbitrary sliders. Claude Code may tune values during template art direction only within the registry limits and must retain contrast, safe-area and reduced-motion validation.

## Background compatibility

The client is not shown every mathematical combination. The survey should:

1. show recommended architecture/background combinations first;
2. allow compatible alternatives;
3. disable poor combinations with a short explanation;
4. offer “Let Enveloped choose” for a reviewed selection;
5. retain admin art-direction control for custom invitations.

General pairing rules:

| Architectural finish | Recommended background direction | Avoid |
|---|---|---|
| Antique or champagne gold | Ivory, burgundy, muted teal | Strong yellow-gold and busy amber |
| Ivory architecture | Sage, burgundy, deep teal | Pale cream without separation |
| Teal and gold | Ivory, champagne, restrained blush | Similar teal values with weak contrast |
| Blackened gold | Pale ivory, blush, luminous neutral gold | Very dark brown or black |
| Burgundy and gold | Ivory, champagne, muted blush | Ruby or burgundy with insufficient separation |

A gold frame may appear on a green background only when the green is muted, the gold remains restrained, and the registered contrast check passes.

## Opacity and fading principles

Opacity is a secondary refinement, not the only solution. Prefer moving pillars toward the edges, controlling scale, using a mild peripheral mask, reducing contrast behind text and applying subtle atmospheric separation. Do not lower opacity until the material looks washed out. Do not use unapproved blend modes or crude colour filters.

## Governance

- No random-layering system.
- No simultaneous primary architectural frames.
- No client-controlled unrestricted opacity, scale or animation values.
- No architecture/background pairing outside compatibility validation.
- No animation that blocks interaction or ignores reduced-motion settings.
- Production templates may use only approved registry assets through declared slots.
