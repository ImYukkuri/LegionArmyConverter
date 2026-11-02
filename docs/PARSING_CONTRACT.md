# PDF parsing contract

This document defines the Legion HQ Stat Reference adapter. Changes must identify
the affected stage, preserve the remaining stages and add a regression example.
Never replace layout parsing with card-specific or filename-specific guesses.

1. Read PDF text and geometry locally. Classify pages as unit panels, command
   panels or glossary columns. A glossary continuation may omit its title; require
   the preceding glossary page and at least two bold `Heading.` entries.
2. Read each panel within its own bounds. Keep wrapped command title/pip and owner
   columns separate. Unit stats have seven columns, weapons four columns. The
   three tail labels Keywords, From upgrades and Upgrades are independently
   optional. Empty labels do not invalidate a panel.
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
   Unit display names use the explicit DISPLAY lookup shared by both adapters.
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

Python and browser adapters must agree on family tables, split boundaries,
canonical identifiers, parameter values and reviewed PDF outcomes. Reference PDFs
and generated test output stay outside the repository. Existing regression suites
cover points, command wrapping, fallback text, tolerant import and layout; new
parameter/glossary tests extend them instead of replacing them.

Symbol contract: operative uses the chevron `b` glyph and block uses the shield
`s` glyph of the retained Legion font. SVG ids and accessible labels retain their
semantic names; change the outline mapping, not game data or token names.
