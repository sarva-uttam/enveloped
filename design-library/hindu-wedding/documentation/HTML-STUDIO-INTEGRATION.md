# HTML Invitation Studio Integration

## Authoritative boundary

`docs/html-invitation-studio/ARCHITECTURE.md` defines the rendering security model. A finished Hindu wedding template is a versioned, code-reviewed HTML document package selected through a closed registry. The database stores structured facts and stable IDs—not executable HTML, CSS or JavaScript.

The Hindu Wedding Registry has four responsibilities:

1. catalogue approved templates, assets, palettes, typography, motion and music;
2. map survey answers to stable IDs and pricing classifications;
3. reject culturally, visually or technically incompatible selections;
4. supply approved values only to slots and parameters declared by the chosen document package.

It does not synthesize a template from arbitrary layers. A component being compatible with `H02` means the reviewed `H02` package declares a matching slot and knows how to render that record safely. Unknown slots, parameters and component IDs are rejected.

## Trust flow

1. Survey values are validated and reduced to stable registry IDs.
2. The chosen template ID resolves through a compile-time document-package registry.
3. Compatibility validation confirms every component is approved, supported by the template and permitted for its declared slot.
4. The package receives escaped content, allowlisted asset URLs and closed-enum theme values only.
5. The independent HTML output validator rejects scripts, inline event handlers, dangerous URL schemes and unapproved network origins.
6. Guest-specific values are inserted at serve time and are never persisted in the reusable artifact.

## Current integration state

The Timeless Editorial V2 package proves the secure renderer and asset-handling model. The eight Hindu wedding templates are registered as planned document packages with `documentPackageId: null` and `documentPackageStatus: NOT_IMPLEMENTED`. This is deliberate: no Hindu visual package or asset has yet been produced or approved.

The registry may be integrated into survey and preview code only after at least one Hindu document package and its required assets pass technical, visual, cultural, licensing and accessibility review.

## Prohibited shortcuts

- No database-supplied markup, styles or scripts.
- No dynamic imports derived directly from stored strings.
- No universal canvas that freely stacks any registered PNG.
- No asset selection outside a template-declared slot.
- No approved status without a real reviewed file and provenance.
- No runtime fallback that silently substitutes rejected or missing artwork.
