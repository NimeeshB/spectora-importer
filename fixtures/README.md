# Fixtures: Spectora "Export to spreadsheet → Export HTML Text"

Real exports used as importer input and test data. No customer information: both are
stock templates from a free Spectora trial account.

| File | Template | Source | Exported |
|---|---|---|---|
| `internachi-residential-2026-09-29.xls` | InterNACHI Residential | Added from Spectora Template Center | 2026-09-29 |
| `residential-template-2026-09-29.xls` | Residential Template (account default) | Spectora account default | 2026-09-29 |

Export path in Spectora: open the template → ⋮ menu → Export to spreadsheet → Export HTML Text.

## Things to know about these files
- They are really `.xlsx` (OOXML zip) files that Spectora saves with an `.xls` extension.
  The importer detects the format from the file contents, not the extension.
- The two files have identical content and differ only in the `Last Modified` column, so they
  do not test whether the importer works beyond one template.

## Still to add
`room-by-room-residential-2026-09-29.xls` (My Templates → Room-by-Room → ⋮ → Export to spreadsheet → Export HTML Text)
to test the importer against a genuinely different template.
