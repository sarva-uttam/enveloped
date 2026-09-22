# Scene Specification

| # | Scene | Master | Live-content zone | Light / text | Layer guidance |
|---:|---|---|---|---|---|
| 1 | Palace doors | `IP-OPEN-001`, `002` | Seal/door center; reveal center | warm frontal / dark brown | reveal → doors → arch → seal |
| 2 | Welcome | `IP-MONO-001` | x 18–82%, y 18–68% | golden hour / dark brown | background; optional code petals |
| 3 | Couple introduction | `IP-INTRO-001` | x 18–82%, y 24–69% | sunset / dark brown or ivory after contrast test | left/right edge flora remain background in v1 |
| 4a | Haldi | `IP-HALDI-001` | x 20–80%, y 25–67% | morning upper-left / dark brown | subtle fabric drift only if later separated |
| 4b | Mehendi | `IP-MEHENDI-001` | x 20–80%, y 23–66% | soft afternoon / dark brown | jasmine/petal sprites optional |
| 4c | Sangeet | `IP-SANGEET-001` | x 20–80%, y 24–66% | dusk + lamps / warm ivory | light sprites at ≤18% opacity |
| 4d | Wedding | `IP-WEDDING-001` | x 18–82%, y 23–67% | ceremonial daylight / dark brown | sacred header may sit above text only after review |
| 4e | Reception | `IP-RECEPTION-001` | x 19–81%, y 23–67% | evening / warm ivory | candle ambience optional |
| 5 | Formal invitation | `IP-FORMAL-001` | x 17–83%, y 15–72% | warm daylight / dark brown | long copy: 7–9 lines body maximum before section split |
| 6 | Gallery | `IP-GALLERY-001` | six carved masks | sunset / n/a | client photos sit below frame overlay; crop each independently |
| 7 | Venue/response | `IP-VENUE-001` | text y 18–47%; controls y 52–72% | sunset / dark brown | controls remain HTML, no sacred imagery nearby |
| 8 | Blessing | `IP-BLESSING-001` | x 18–82%, y 18–68% | blue-gold dusk / warm ivory | lower florals form closure |
| 9 | Finale | `IP-FINALE-BG-001` + couple | couple lower center; closing line upper third | twilight / warm ivory | background → couple → foreground depth/petals |

## Name handling

- Inline: keep combined names to approximately 24 display characters at target size; shrink no lower than 42 px on 1080-wide mobile.
- Stacked: name / independent ampersand / name. Ampersand occupies its own line and optical center.
- Never place the ampersand inside either name’s bounding box.
- Long names may wrap once at natural word boundaries; never condense horizontally.

## Gallery slots

Six arched masks: top pair portrait 4:5; middle pair flexible 4:5 or 3:4; lower pair portrait 4:5. Mobile may reveal two slots per scroll beat. Desktop may show the 9:16 document centered or recompose as a 3 × 2 gallery using the same masks. Empty fallback removes photo fills and uses low-contrast ivory texture—not black placeholders.

## Desktop

Desktop review previews demonstrate the approved strategy: center the 9:16 document at a maximum visual height and extend the scene laterally with darkened, blurred derivatives. Do not stretch the mobile master. A future production pass may replace extensions with dedicated painted wings.
