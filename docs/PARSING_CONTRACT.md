# PDF parsing contract

This document defines the Legion HQ Stat Reference adapter. Changes must identify
the affected stage, preserve the remaining stages and add a regression example.
Never replace layout parsing with card-specific or filename-specific guesses.

1. Read PDF text and geometry locally. PDF text items are encoding/font fragments,
   not words. Reconstruct lines within each glossary column and reconstruct table
   headers within their smallest enclosing cell; retain raw fragments/geometry.
   Never concatenate an entire page to recover words or merge neighbouring cells.
   Classify pages using reconstructed labels, not individual TextItem strings.
   Learn the glossary heading font group from its reconstructed title. Compare
   letters before the first period against that group; digits and punctuation can
   use separate subsets. Require a short label and matching letter styles; ordinary
   body sentences and mixed-style prefixes are not new headings. Do not hardcode
   a font name, resource id, browser or catalog keyword list. A glossary continuation
   may omit its title; require the preceding glossary page and at least two styled
   `Heading.` entries. Preserve original English spacing and unknown headings.
   Page roles are not mutually exclusive: if a glossary title follows unit panels
   on the same page, parse the panels wholly above the title before reading the
   glossary below it. Never feed unit rows into glossary entries. Continuation
   pages without a title retain the existing previous-page/style requirement.
   If all readable pages lack text and no units are found, report missing text
   separately from an unsupported text-bearing layout. Do not start OCR or guess
   units from vector paths. Return the re-export guidance in both adapters.
2. Read each panel within its own bounds. Keep wrapped command title/pip and owner
   columns separate. Unit stats have seven columns, weapons four columns. The
   three tail labels Keywords, From upgrades and Upgrades are independently
   optional. Detect them on reconstructed panel-local lines. Empty labels do not
   invalidate a panel. Separate title/subtitle and rank/points by relative type size
   when the smaller role contains an explicit price; use the existing spatial split
   only when that evidence is absent. Never clip a long title to a fixed width when
   its role is distinguishable. Keep the full English name/title for catalog scope.
3. Split lists at commas outside parentheses/brackets. Equip can carry a list of
   upgrade/slot names: Armament, Doctrine and the existing Bad Batch personnel
   continuations stay with Equip. Mercenary factions stay together. A following
   ordinary keyword starts a new item. Never apply equipment-list continuation
   to an unrelated keyword. Original tail text remains in provenance.
4. Resolve known exact identifiers first, then numeric X forms and the explicit
   parameter-family table. Only accept a complete family name followed by a colon
   or whitespace; Direct must not match Direction or Indirect. Families include
   Direct, Entourage, Retinue, Detachment, Associate, Teamwork, Coordinate, Aid,
   Compel, Equip, Mercenary, Independent, Hover, Fixed, Sidearm, AI, Advanced
   Targeting and Eyes on the Prize. Arm/Detonate keep their separate count/type
   grammar. Immune variants require exact known identifiers, never a guessed
   universal Immune rule. Unknown families remain original text for review.
5. Store the canonical id plus parameter and parameterKind for parameterized
   references. Display `Chinese rule name：original English parameter`. Unit names
   and equipment names are preserved verbatim, including commas. Different
   parameter values never merge. Generic unparameterized references must not
   replace a qualified reference. Resolve rule body/timing from existing mappings;
   PDF glossary is the fallback, including continuation pages. Do not invent rules.
6. Resolve upgrades by name and exact required-unit name before substring scope.
   Preserve ambiguity if it is not unique. Enrich catalog keyword references by
   the same parameter display rule without rewriting stored catalogs/card bodies.
   Unit display names first use mappings/unit-names.zh.json shared by both adapters,
   matched by English unit name and title. Weapons are scoped to those variants;
   global lookup contains only unambiguous Chinese names. Legacy DISPLAY entries
   remain fallback for names not present in the supplied reference PDFs.
   A missing translation preserves the English name; it is not a parsing failure.
   Keep numbered-copy suffixes and original names. Unit-name translations never
   translate unit parameters in Entourage/Direct or change lookup/scoping keys.
7. Divide repeated group prices only for complete identical numbered groups.
   Incomplete structural parsing leaves original text and unknown fields; no
   invented zero stats or guessed costs. Unrelated panels continue importing.
8. reviewItems and diagnostics belong to the extraction page and JSON output.
   The army viewer and offline HTML show game content, original fallback text and
   ordinary empty values; they do not render review panels or parsing warnings.
   Keep review records in JSON so returning to extraction loses no information.

File acquisition is an entry-page responsibility, separate from the parser.
Read selected/dropped files immediately and cache their bytes in browser memory;
do not wait for module downloads before reading an OS-backed File reference.
Allow a second FileReader attempt for transient read failures. Denied, missing or
invalidated files require re-selection, not a PDF-layout fallback. Clear stale
army data on new PDF selection and prevent an older asynchronous read from
replacing a newer selection. Reset the picker so choosing the same file retries.
Pass a fresh byte copy into each parser call because PDF.js may transfer its
buffer to a worker; repeated extraction must not reuse a detached buffer.
File-size limits apply before reading, and no file bytes are sent to a server.

Python and browser adapters must agree on family tables, split boundaries,
canonical identifiers, parameter values and reviewed PDF outcomes. Reference PDFs
and generated test output stay outside the repository. Existing regression suites
cover points, command wrapping, fallback text, tolerant import and layout; new
parameter/glossary tests extend them instead of replacing them.

Text-fragment regression: `tests/text-fragments.cjs` exercises shuffled character
fragments, separate number/punctuation fonts, scaled cells, long titles, optional
tails, unknown glossary headings and wrapped command headers. `LEGION_MOBILE_PDF`
can supply the private Android Type3-font sample: 10 units, 27 weapons, 1000 points,
44 glossary entries, no structural review items. It contains no command pages;
never infer missing selected cards from the catalog. Existing desktop fixtures must
retain their results. Both Python and browser share these observable rules, even
though pdfplumber already assembles table text. See BROWSER_PRINT_COMPATIBILITY.md
for tested boundaries and future compatibility tiers.

`tests/import-reliability.cjs` covers cached bytes, transferred buffers, transient
read fallback, denied access, stale selection, same-file retry and size limits.
Optional private `LEGION_MIXED_PDF` covers a one-page unit/glossary export: 3 units,
4 weapons, 307 points, 9 glossary entries with Python/browser parity. Optional
`LEGION_OUTLINED_PDF` verifies a no-text document gets the specific diagnosis and
does not load OCR. Source files and generated armies remain outside Git.

Symbol contract: operative uses the chevron `b` glyph and block uses the shield
`s` glyph of the retained Legion font. SVG ids and accessible labels retain their
semantic names; change the outline mapping, not game data or token names.
