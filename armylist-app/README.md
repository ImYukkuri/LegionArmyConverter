# Application

Parsing changes follow ../docs/PARSING_CONTRACT.md.

From the repository root, run `npm ci --ignore-scripts` and `npm run build`.
Serve dist with any HTTP server, including VS Code Live Server.
The site automatically loads the five game mappings and the reviewed unit-name
mapping; users provide
only their army PDF. No source PDFs or card images are included.

Unit/name/title/weapon translation sources and maintenance are documented in
../docs/UNIT_NAME_MAPPING.md. Upgrade cards have one ready/unavailable button;
older exhausted/expended/removed browser states migrate to unavailable. Command
card play states retain their separate game flow.

See ../README.md and ../docs/PUBLICATION.md before publishing.

Command headers are two independent columns. Locate the first wide interior
orders bar, then read the larger title/pip text and smaller owner text above it
separately. Join wrapped lines within each column before recognizing `(N-pip)`;
allow whitespace around its hyphen. Keep the original mixed lines in rawText,
and start pdfDescription at the orders bar. If that structure cannot be confirmed,
retain the previous first-line interpretation without guessing from a card name.
The Python and browser adapters implement the same rule; roster rendering remains
independent. Regression: `node armylist-app/tests/command-header.cjs`.
Supply an optional external reference using LEGION_HEADER_PDF; never commit PDFs.

Unit tail labels (Keywords, From upgrades, Upgrades) are independent optional
sections. Exporters omit empty sections; absence means an empty list, not failure.
Weapon-table boundaries use the first present tail label, or the panel bottom
when the entire tail is absent. Match required unit names exactly before trying
substring matches for upgrades with identical names.

A malformed unit panel produces a partial unit with unknown statistics and
weapons left empty, unknown points null, and its original text kept for review.
Other units continue parsing. A partially parsed numbered group is not divided.
Unsupported pages retain extracted text and page numbers; an entirely unsupported
or scanned PDF still reports that no unit table could be recognized.

Optional reviewItems in legion-army/v2 groups parsing failures and unmatched
keywords/upgrades/commands. Each item has category, code, title, message, rawText,
and locations (page, unitId/unitName where relevant, context). Repeated occurrences
share an item and retain every location. PDF glossary text is used for untranslated
keywords; absent rules keep the source name without inventing rules or timings.
totals.incomplete flags structural failures; a missing translation alone does not.
The extraction page shows the downloadable review list. The roster and offline
HTML retain it in JSON but do not render parsing warnings.
Regression: `node armylist-app/tests/tolerant-import.cjs`; optional external PDF
via LEGION_TOLERANT_PDF. No user PDFs or generated reviews belong in the repository.
