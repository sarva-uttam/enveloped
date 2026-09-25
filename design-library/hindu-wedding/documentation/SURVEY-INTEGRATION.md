# Survey Integration

`survey-mapping.json` maps all 22 steps and separates visual, content, functional, privacy, pricing and administrative data. Not every answer is an asset: names and dates are structured content, RSVP is functional configuration, and privacy choices belong to access control.

Each visual option card must show a 9:16 thumbnail, name, description, tier, actual configured price or quotation state, selected state, disabled reason and preview connection. Browsing never changes price. “Let Enveloped choose” selects a compatible included option and cannot silently add a charge.

On submit, validate mappings again server-side. Store stable IDs rather than display names so renamed options do not corrupt saved drafts.
