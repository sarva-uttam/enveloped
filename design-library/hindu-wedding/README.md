# Hindu Wedding Component Registry

This registry maps Hindu wedding survey answers to controlled templates, visual components, logical 9:16 placements, compatibility decisions, tier metadata and pricing configuration. It supports fixed-price templates and custom Bronze–Platinum invitations without changing Enveloped's existing checkout prices.

The HTML Invitation Studio architecture remains authoritative for rendering. Every finished template is a reviewed, trusted whole-document package. Registry components are catalogue records that may be supplied only to asset slots explicitly declared by that package; they are not arbitrary PNG layers from which the browser invents a page.

The approved library includes eleven background families with four moods, twelve architectural frames, ten Ganesha options, four sacred motifs and one neutral header. Botanical generation is paused at its recorded checkpoint; review-file presence does not imply approval. Later layers and H01–H08 remain planned. Sacred imagery, music and motion remain optional, and client text remains editable HTML.

Before artwork work, read [`documentation/MASTER-ASSET-PRODUCTION-BLUEPRINT.md`](documentation/MASTER-ASSET-PRODUCTION-BLUEPRINT.md) and complete [`documentation/GENERATION-BRIEF-TEMPLATE.md`](documentation/GENERATION-BRIEF-TEMPLATE.md).

## Commands

```bash
npm run build:design-library
npm run validate:design-library
npm run report:design-library
npm test
```

The build script deterministically generates the registry files, schemas, template manifests and tracked asset-storage folders. Edit the generator and rebuild rather than hand-editing generated JSON.

See `documentation/HTML-STUDIO-INTEGRATION.md` for the trust boundary and implementation sequence.
