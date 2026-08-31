# Third-party notices

## simple-icons

- Project: https://github.com/simple-icons/simple-icons
- License: CC0 1.0 Universal (the icons; the project's own code is MIT)

Most logomarks in `src/renderer/components/yeaboi/provider-icon.tsx` are read
from the installed `simple-icons` package at build time. Five are **embedded**
as path data instead, because the versions we depend on no longer publish them:

| Mark | Last published in | Constant |
|---|---|---|
| OpenAI | (dropped) | `OPENAI_PATH` |
| Slack | (dropped) | `SLACK_PATH` |
| Azure DevOps | (dropped) | `AZURE_DEVOPS_PATH` |
| Amazon Web Services | v14.15.0 | `AWS_PATH` |
| Microsoft Azure | v12.4.0 | `AZURE_PATH` |

Each is unmodified CC0 path data from the release named above, rendered
monochrome at the size the surrounding component asks for. Grok's swirl
(`GROK_PATH`) has never shipped in simple-icons and is not from it.

## SVG Logos

- Project: https://github.com/gilbarbara/logos
- License: CC0 1.0 Universal

`INCIDENTIO_PATH` is unmodified path data for the incident.io mark, which
simple-icons has never published at any version. It does not normalise to a
24-square, so its own viewBox travels with it in `ICON_VIEWBOXES`.

## Trademarks

Every mark identifies its owner's service and is used nominatively — to label a
connection to that service, in a list of several — never to suggest endorsement,
affiliation or a partnership. Amazon's and Microsoft's brand guidelines restrict
third-party use of their marks, which is why simple-icons stopped publishing
them; the two are embedded here on that nominative basis.

`provider-icon.tsx` keeps two tiers underneath every mark — a per-family glyph
(`FAMILY_GLYPHS`) and a two-letter monogram — so removing any mark above is a
one-line change that leaves the surface rendering correctly. A vendor with no
shippable mark uses those tiers rather than a reconstruction: a logo redrawn
from memory would be a wrong mark rather than an absent one.
