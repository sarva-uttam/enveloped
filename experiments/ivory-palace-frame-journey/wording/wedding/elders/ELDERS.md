# Elder blessings and remembrance — independent optional fields

The living elder list is client data: each entry has `displayName`, confirmed relationship to the relevant partner, living status, order and side. Do not assume a surname establishes genealogy. The blessing lead is a complete field chosen after the relationships are known; then display one or more names on separate lines.

| Case | Lead | Example name lines |
| --- | --- | --- |
| Confirmed grandparents | `With the blessings of our grandparents` | `Mahendra and Kamini Rajan` |
| Grandparents and other confirmed elders | `With the blessings of our grandparents and elders` | `{grandparentNames}` / `{otherElderNames}` |
| Confirmed elders, relationship unspecified | `With the blessings of our elders` | `{livingElderNames}` |
| One confirmed grandparent | `With the blessing of our grandparent` | `{grandparentName}` |
| No names supplied | `With the blessings of our elders` only if the family explicitly wants an unnamed blessing line | no name lines |
| Family prefers no blessing language | omit the entire blessing block | no name lines |

The generic template can be recorded as `With the blessings of our {confirmedRelationshipLabel}` followed by `{livingElderNames[]}`. The relationship label must be selected from the actual client data and the singular/plural form must agree. Do not output literal brackets, empty commas or a dangling “and.”

**Deceased relative:** use a separate optional line such as `In loving memory of {rememberedRelativeName}` only after the client confirms the person has died and approves the wording. Never place an unconfirmed deceased person in the living-elder list. Do not infer whether Shanta Devi is Harish Rajan's spouse, whether she is living, or which side either belongs to. Invoking a deceased relative's “blessing” is a family-specific choice and is not the default.
