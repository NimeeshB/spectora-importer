// Preservation check: compares hierarchy, text and order read straight from the source sheet
// against what is saved. Not a true round-trip (we never regenerate Spectora's spreadsheet).
import he from "he";
import type { Sheet } from "./importer/xlsx";
import type { LedgerEntry, ImportIssue } from "./importer/types";
import type { TemplateTree } from "./types";

export type PreservationResult = {
  ok: boolean;
  checked: number;
  exact: number;
  sanitizedLogged: number; // body differs from source, and the importer logged why
  mismatches: string[];
};

const norm = (h: string) => he.decode(h).split("(")[0].trim().toLowerCase();

export function preservationCheck(sheet: Sheet, ledger: LedgerEntry[], issues: ImportIssue[], saved: TemplateTree): PreservationResult {
  const header = sheet.rows[0].cells.map((h) => norm(h ?? ""));
  const at = (name: string) => header.indexOf(name);
  const [cs, ci, cn, ct] = ["section name", "item name", "comment name", "comment text"].map(at);
  const imported = new Set(ledger.filter((l) => l.status === "imported").map((l) => l.row));
  const sanitized = new Set(issues.filter((i) => i.reason.startsWith("Sanitizer removed")).map((i) => i.row));

  // expected: per source row, in file order
  const expected = sheet.rows.slice(1).filter((r) => imported.has(r.row)).map((r) => ({
    row: r.row,
    section: he.decode(r.cells[cs] ?? ""),
    item: he.decode(r.cells[ci] ?? ""),
    name: he.decode(r.cells[cn] ?? ""),
    text: r.cells[ct] ?? "",
  }));

  const actual = saved.sections.flatMap((s) =>
    s.items.flatMap((i) =>
      i.comments.map((c) => ({ row: Number(c.extra.source_row ?? -1), section: s.name, item: i.name, name: c.name, text: c.body_html, pos: c.position, secPos: s.position, itemPos: i.position })),
    ),
  );

  const mismatches: string[] = [];
  let exact = 0, sanitizedLogged = 0;
  if (expected.length !== actual.length) mismatches.push(`comment count: source ${expected.length}, saved ${actual.length}`);

  const byRow = new Map(actual.map((a) => [a.row, a]));
  for (const e of expected) {
    const a = byRow.get(e.row);
    if (!a) { mismatches.push(`row ${e.row}: not found in saved data`); continue; }
    if (a.section !== e.section || a.item !== e.item) mismatches.push(`row ${e.row}: hierarchy differs (${e.section} › ${e.item} vs ${a.section} › ${a.item})`);
    if (a.name !== e.name) mismatches.push(`row ${e.row}: name differs`);
    if (a.text === e.text) exact++;
    else if (sanitized.has(e.row)) sanitizedLogged++;
    else mismatches.push(`row ${e.row}: text differs without a logged sanitizer warning`);
  }

  // order: saved sequence by (section, item, position) must equal source first-seen order
  const secOrder = [...new Set(expected.map((e) => e.section))];
  const savedSecs = saved.sections.map((s) => s.name);
  if (JSON.stringify(secOrder) !== JSON.stringify(savedSecs)) mismatches.push("section order differs from source");
  for (const s of saved.sections) {
    const rows = expected.filter((e) => e.section === s.name);
    const itemOrder = [...new Set(rows.map((e) => e.item))];
    if (JSON.stringify(itemOrder) !== JSON.stringify(s.items.map((i) => i.name))) mismatches.push(`item order differs in section "${s.name}"`);
    for (const i of s.items) {
      const src = rows.filter((e) => e.item === i.name).map((e) => e.row);
      if (JSON.stringify(src) !== JSON.stringify(i.comments.map((c) => Number(c.extra.source_row)))) mismatches.push(`comment order differs in "${s.name} › ${i.name}"`);
      if (i.comments.some((c, k) => c.position !== k)) mismatches.push(`positions not contiguous in "${s.name} › ${i.name}"`);
    }
  }
  return { ok: mismatches.length === 0, checked: expected.length, exact, sanitizedLogged, mismatches };
}
