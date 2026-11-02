# Application

From the repository root, run `npm ci --ignore-scripts` and `npm run build`.
Serve dist with any HTTP server, including VS Code Live Server.
The site automatically loads the five reviewed runtime mappings; users provide
only their army PDF. No source PDFs or card images are included.

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
