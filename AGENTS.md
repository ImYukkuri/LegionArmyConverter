# Publication boundaries

Keep this repository to reviewed runtime code, five explicitly approved mapping
JSON files and the MIT-licensed symbol font with its notices. The user uploads
only an army PDF; do not add a separate catalog-upload requirement.

Never commit or publish source PDFs, official card art, OCR output, screenshots,
scraped HTML, manual translation corpora, generated army lists, personal absolute
paths, archives, backup directories, dependencies or build output. Store private
reference materials outside the repository. Do not restore the old initial Git
history or merge an older clone: it contains removed source material.

Full game text and translations in the retained mappings are not covered by the
code license and are not represented as authorized. Do not add new complete
rulebooks or card corpora. Read docs/PUBLICATION.md before changing runtime data.

Run `python tools/public_audit.py --staged` before commit, and `npm run build`
plus `python tools/public_audit.py --dist` before publishing. CI must gate Pages
on these checks. Update publication-policy.json only after reviewing every added
file and every changed mapping. Never bypass a guard by broadening directory
allowlists. Preserve the font and PDF.js licenses in deployment artifacts.
