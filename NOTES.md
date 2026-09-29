# Notes

## Approach
Inspected the real export first (one sheet, one row per comment, Section/Item repeated on every row), then let it drive
the schema and parser. The importer is **deterministic, with no LLM**: it is reproducible, unit-testable, and cannot invent
or drop content. An LLM mapper would need schema validation, a check that every source row is accounted for, and a
rejection path.

## What the export tells us (established from the files)
- Both fixtures are OOXML `.xlsx` zips saved as `.xls`. Detection is by ZIP signature, never extension.
- Cells are inline strings (`t="str"`), some with `xml:space="preserve"` (11 comment names end in a space, e.g. `Temperature `).
- Hierarchy is rebuilt by grouping rows on Section then Item in first-seen order; Order column is monotonic within each item in
  the sample, so file order = Order. Position is the file order; the raw Order value is kept in `extra.source_order`, and a
  warning is logged if it ever goes backwards.
- Section/item/comment names are HTML-entity encoded (`&amp;`) and are decoded. Comment text is HTML and is stored as HTML.
- **Counts observed (InterNACHI):** 13 sections, 69 items, 392 comments; 302 defect / 78 info / 12 limit; severity 281 Med, 21 High,
  90 blank. Two things differ from the brief: 83 rows have empty Comment Text (not 301) and no row has an empty name.
  One duplicate comment name (rows 263/264) is imported and warned about.
- Category column is severity (-1/0/1), stored as `comments.severity`; Comment Type is stored as `comment_type`.

## Missing from export (not in the source file at all)
- A section or item with **zero comments** cannot appear (rows are per comment). Stated in the trust report.
- Section icons, report layout, Spectora-side styling, anything only shown in Spectora's editor.
- The template's own name (taken from the filename; editable in the confirm step).
- Photos, links and conditional logic are absent from *these* files (photo columns exist but are empty). Not confirmed against a richer template.

## Unsupported by the importer (present in the file, kept but not modelled)
All of these are logged in `import_issues` as `unsupported` and preserved in `comments.extra` so nothing is dropped:
populated Default Photo columns, Locked / Simple Format / Disable Photos when set, and unrecognized columns.
Default Value, estimates, unit type, location, Uses and Last Modified are kept in `extra` without a per-row issue
(the InterNACHI file sets estimate 10/1000 on every row, which would be noise). They are not editable in the UI.
Empty cells are not stored in `extra`.

## Row accounting
Every data row is `imported`, `skipped` (blank row, or name/text/options all empty) or `unsupported` (no section or item name, so
it cannot be placed). `rows read = imported + skipped + unsupported` is asserted in tests and displayed in the trust report.

## HTML handling
`sanitize-html` allowlist: p, br, div, span, strong, b, em, i, u, ul, ol, li, a[href,title], h1–h4; links limited to
http/https/mailto. Every removed tag/attribute/href is logged with row, column and raw text. Numeric entities such as `&#13;` are
protected through sanitizing: the preservation check caught sanitize-html silently turning `&#13;` into a carriage return,
so that is now byte-identical. In the InterNACHI file the sanitizer removes only `a[target]` (39), `div[class]` and `div[style]`.
The editor edits raw HTML in a textarea and re-sanitizes on save (removals are reported next to the field).

## Data model
`templates → sections → items → comments`, integer `position`, cascading deletes, plus `import_runs` and `import_issues`
(`row` is the source spreadsheet row). No whole-template blob. `lib/ordering.ts` has `reorder`/`renumber` helpers; there is no
reorder UI (see cuts). Import and copy are Postgres RPCs because supabase-js cannot run a multi-statement transaction;
copy generates new UUIDs for every row so nothing is shared with the original.

## Auth / RLS
None in v1: single-user demo workflow, so account auth is omitted to keep review friction low; production would add
org-scoped auth and RLS. RLS is enabled with no policies so the anon key is useless, and only the server holds the service key.
Anyone with the public URL can edit and import (uploads are capped at 4 MB and content-detected as xlsx).

## Cut, and why
Reorder, add and delete in the editor; "reset demo" button (use `npm run seed`); UI polish beyond readable tables and labelled,
keyboard-usable inputs; editing of comment type/severity/choices (kept in DB, shown read-only). Baseline and trust report were
prioritized per the brief. Binsr trial and Hive sign-up notes are not done here (not code).

## How it was checked
- 21 unit tests: real-file counts, ordering, entity decoding, trailing whitespace, determinism, nested/unsafe HTML, unknown values,
  photos/unknown columns, non-adjacent grouping, blank/orphan/empty rows, and refusal of empty, non-xlsx, corrupt, oversized,
  header-missing and header-only files.
- DB integration test (persistence via fresh client, copy independence, edit-copy-original-unchanged), run through the real
  supabase-js client against a local Postgres 17 + PostgREST and against the hosted Supabase project.
- Browser smoke (`scripts/e2e-smoke.ts`, Playwright, production build, run against the hosted Supabase project): edit → reload → persisted; duplicate → copy shows origin;
  edit copy → original unchanged; bad file → clear error; second export → preview → confirm → report with preservation check.
- Preservation check compares hierarchy, names, text and order read from the source sheet with what is saved
  (392/392 for the seeded file). It is not a true round-trip.
- **Generality is only partly tested.** Both fixtures have identical content. The Room-by-Room export has not been made yet;
  until then generality rests on hand-made fixtures. Add it to `fixtures/` and re-run the tests.

## Credits
Next.js, supabase-js, fflate + fast-xml-parser (xlsx reading), sanitize-html + htmlparser2, he, Vitest, Playwright, Tailwind. Built with Claude Code.
Approximate time: _fill in_.
