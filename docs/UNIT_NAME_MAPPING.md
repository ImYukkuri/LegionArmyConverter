# Unit name mapping

`mappings/unit-names.zh.json` is a names-only runtime file. It contains 117
faction/variant records, 95 distinct English unit names, 67 nonempty title pairs
and 200 weapon-name occurrences. Repeated names across factions are intentional.
The `name`, `title` and each `weapons` item have `en`/`zh` fields; `faction` scopes
the source edition. No statistics, effects, OCR text or card images are included.

The supplied English unit packs cover Empire, Republic, Rebels and Separatists;
the Mandalorian battle-force document was processed last because it also contains
upgrades and command cards. Chinese sources contain ordinary and hero units for
those four factions plus a Mandalorian unit pack. The supplied editions differ.

## Extraction and comparison

1. Extract the text layer of every PDF to an external work directory. English
   PDFs only expose version/copyright text: card lettering is vector outlines.
   Extracting embedded JPEGs alone loses that lettering and inverts CMYK colors.
2. Render English pages at 300 dpi, crop card image bounds, rotate portrait
   placements 90 degrees clockwise, and deduplicate repeated printed cards.
   Store intermediate images and OCR outside the repository. Full-card OCR gives
   context; separate name/title/weapon crops improve recognition. Correct OCR
   spelling against the rendered card before pairing.
3. Extract Chinese front-card text by position and font. Keep full text externally
   to recover mirrored C-3PO/ID10 layouts and mixed Latin/Chinese weapon names.
   Do not treat keyword lines as weapons. Remove repeated fronts/backs. Verify
   digits in R2-D2, 74-Z and 1.4 FD rather than stripping them as card markers.
4. Compare faction, unit name, title and weapon content. Page order only proposes
   candidates: it is insufficient for matching variants. Use Chinese PDF wording,
   including differences from previous temporary translations. Match individual
   weapon names by source text, not just row position or equal weapon counts.
5. Export only confirmed bilingual name fields to the runtime mapping. Keep a
   comparison report with source filenames/pages and unmatched records externally.
   English-only variants include Geonosian Engineers and Clan Kryze Veterans.
   Chinese-only occurrences span newer/mercenary units and are not assigned
   invented English matches. A matching name from another faction does not prove
   that every title or weapon variant matches.
6. Validate all runtime fields, bilingual lookups and actual army imports. Scope
   weapon labels to unit/title; publish a global fallback only when all supplied
   translations agree. Keep PDF originals, unit counts, points and keyword
   parameters unchanged. Different Chinese wording for a shared English term must
   not be resolved by whichever record happens to come first.

The external work directory is `../LegionHelper-name-extraction-20261103`.
It contains text-layer exports, rendered crops, OCR, `unit-mappings.review.json`
and `comparison-report.json`. This directory is private reference material and
must not be copied into Git or Pages. The project requires no reference uploads
from visitors and makes no remote OCR/translation requests.

Regression: `node armylist-app/tests/unit-names-and-states.cjs` checks all 117
entries and weapons against both resolvers, variant handling, numbered copies,
two-state upgrade buttons, old-state migration and reload persistence.
