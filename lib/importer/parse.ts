// Deterministic Spectora "Export HTML Text" parser. No DB access, no network, no LLM.
import { createHash } from "node:crypto";
import he from "he";
import { readFirstSheet, ImportError, type Sheet } from "./xlsx";
import { sanitizeBody } from "./sanitize";
import type { ImportIssue, IssueSeverity, LedgerEntry, ParseResult, ParsedComment, ParsedSection, RowStatus } from "./types";

export { ImportError };

const KNOWN_TYPES = ["info", "limit", "defect"];
const KNOWN_ANSWERS = ["boolean", "checkbox", "date", "number", "range", "text"];

// header (normalized) -> field. Headers are matched on the text before " (", case-insensitive.
const FIELD_BY_HEADER: Record<string, string> = {
  "section name": "section",
  "item name": "item",
  "comment name": "name",
  "comment text": "text",
  "comment type": "type",
  category: "severity",
  "multiple choice options": "choices",
  "unit type options": "units",
  "recommendation": "recommendation",
  order: "order",
  "answer type": "answer",
  "default value": "default_value",
  "default value 2": "default_value_2",
  "default unit type": "default_unit_type",
  "default location": "default_location",
  "default estimate min": "estimate_min",
  "default estimate max": "estimate_max",
  locked: "locked",
  "simple format": "simple_format",
  "disable photos": "disable_photos",
  uses: "uses",
  "last modified": "last_modified",
};
const REQUIRED = ["section", "item", "name", "text"];
const REQUIRED_LABEL: Record<string, string> = { section: "Section Name", item: "Item Name", name: "Comment Name", text: "Comment Text" };
const EXTRA_FIELDS = ["default_value", "default_value_2", "default_unit_type", "default_location", "estimate_min", "estimate_max", "locked", "simple_format", "disable_photos", "uses", "last_modified"];
const FLAG_FIELDS = ["locked", "simple_format", "disable_photos"];

const colLetter = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const normHeader = (h: string) => he.decode(h).split("(")[0].trim().toLowerCase().replace(/\s+/g, " ");
const decodeName = (s: string) => he.decode(s);
const splitList = (s: string) => (s.trim() ? he.decode(s).split(",").map((x) => x.trim()).filter(Boolean) : []);

export function templateNameFromFilename(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_ ]*\d{4}-\d{2}-\d{2}$/, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Imported template";
}

export function parseSpectoraExport(buffer: Buffer | Uint8Array, filename = "upload.xlsx"): ParseResult {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const sheet = readFirstSheet(buffer);
  return parseSheet(sheet, filename, sha256);
}

export function parseSheet(sheet: Sheet, filename: string, sha256 = ""): ParseResult {
  const issues: ImportIssue[] = [];
  const ledger: LedgerEntry[] = [];
  const issue = (row: number, column: string | null, severity: IssueSeverity, reason: string, raw: string | null = null) =>
    issues.push({ sheet: sheet.name, row, column, severity, reason, raw_content: raw });

  const [header, ...dataRows] = sheet.rows;
  if (!header || header.cells.every((c) => !c)) throw new ImportError("The first row is empty, so no column headers were found.");

  const fieldCol: Record<string, number> = {};
  header.cells.forEach((h, i) => {
    if (h == null || h === "") return;
    const isPhoto = /^default photo \d+( caption)?$/i.test(normHeader(h));
    const f = FIELD_BY_HEADER[normHeader(h)];
    if (f && !(f in fieldCol)) fieldCol[f] = i;
    else if (!isPhoto)
      issue(header.row, colLetter(i), "unsupported", `Column "${h}" is not recognized by the importer; its values are kept in comment.extra.unknown_columns.`, h);
  });
  const missing = REQUIRED.filter((f) => !(f in fieldCol));
  if (missing.length)
    throw new ImportError(
      `This does not look like a Spectora "Export HTML Text" file. Missing column(s): ${missing.map((m) => REQUIRED_LABEL[m]).join(", ")}.`,
    );
  for (const f of ["type", "severity", "answer", "order"].filter((f) => !(f in fieldCol)))
    issue(header.row, null, "warning", `Optional column "${f}" is absent from this export; comments get null for it.`);

  const photoCols: { url: number; caption: number | null; n: number }[] = [];
  header.cells.forEach((h, i) => {
    const m = /^default photo (\d+)$/i.exec(normHeader(h ?? ""));
    if (m) {
      const capIdx = header.cells.findIndex((c) => c && normHeader(c) === `default photo ${m[1]} caption`);
      photoCols.push({ url: i, caption: capIdx >= 0 ? capIdx : null, n: Number(m[1]) });
    }
  });
  const unknownCols = header.cells
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => h && !Object.values(fieldCol).includes(i) && !photoCols.some((p) => p.url === i || p.caption === i));

  const get = (cells: string[], f: string) => (f in fieldCol ? cells[fieldCol[f]] ?? "" : "");
  const sections: ParsedSection[] = [];
  const secIdx = new Map<string, ParsedSection>();
  const itemIdx = new Map<string, ParsedSection["items"][number]>();
  const seenNames = new Map<string, number>();
  const orderSeen = new Map<string, number>();
  const lastOrderWarned = new Set<string>();
  const setStatus = (row: number, status: RowStatus, reason: string | null) => ledger.push({ row, status, reason });
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byAnswerType: Record<string, number> = {};
  let commentCount = 0;

  for (const r of dataRows) {
    const c = r.cells;
    if (c.every((v) => !v || !v.trim())) {
      issue(r.row, null, "skipped", "Blank row.");
      setStatus(r.row, "skipped", "Blank row.");
      continue;
    }
    const secRaw = get(c, "section");
    const itemRaw = get(c, "item");
    if (!secRaw.trim() || !itemRaw.trim()) {
      const col = colLetter(fieldCol[!secRaw.trim() ? "section" : "item"]);
      const reason = `${!secRaw.trim() ? "Section" : "Item"} name is empty, so this row cannot be placed in the hierarchy.`;
      issue(r.row, col, "unsupported", reason, JSON.stringify(c.filter(Boolean)));
      setStatus(r.row, "unsupported", reason);
      continue;
    }
    const nameRaw = get(c, "name");
    const textRaw = get(c, "text");
    const choicesRaw = get(c, "choices");
    if (!nameRaw.trim() && !textRaw.trim() && !choicesRaw.trim()) {
      const reason = "Comment name, text and options are all empty; nothing to import.";
      issue(r.row, colLetter(fieldCol.name), "skipped", reason, JSON.stringify(c.filter(Boolean)));
      setStatus(r.row, "skipped", reason);
      continue;
    }

    const secName = decodeName(secRaw);
    const itemName = decodeName(itemRaw);
    let sec = secIdx.get(secName);
    if (!sec) sections.push((sec = { name: secName, items: [] })), secIdx.set(secName, sec);
    const ik = `${secName}\u0000${itemName}`;
    let item = itemIdx.get(ik);
    if (!item) sec.items.push((item = { name: itemName, comments: [] })), itemIdx.set(ik, item);

    const name = decodeName(nameRaw);
    if (!nameRaw.trim()) issue(r.row, colLetter(fieldCol.name), "warning", "Comment name is empty; imported with a blank name.", textRaw);

    const { html, stripped } = sanitizeBody(textRaw);
    for (const s of stripped)
      issue(r.row, colLetter(fieldCol.text), "warning", `Sanitizer removed ${s.what} ${s.detail} from comment text.`, textRaw);

    const typeRaw = get(c, "type").trim().toLowerCase();
    if (typeRaw && !KNOWN_TYPES.includes(typeRaw))
      issue(r.row, colLetter(fieldCol.type), "warning", `Unknown comment type "${typeRaw}"; kept as-is.`, typeRaw);
    const answerRaw = get(c, "answer").trim().toLowerCase();
    if (answerRaw && !KNOWN_ANSWERS.includes(answerRaw))
      issue(r.row, colLetter(fieldCol.answer), "warning", `Unknown answer type "${answerRaw}"; kept as-is.`, answerRaw);
    const sevRaw = get(c, "severity").trim();
    let severity: number | null = null;
    if (sevRaw) {
      if (["-1", "0", "1"].includes(sevRaw)) severity = Number(sevRaw);
      else issue(r.row, colLetter(fieldCol.severity), "warning", `Unrecognized severity "${sevRaw}" (expected -1, 0 or 1); stored as null, raw value kept in extra.`, sevRaw);
    }

    const extra: Record<string, unknown> = { source_row: r.row };
    for (const f of EXTRA_FIELDS) {
      const v = get(c, f);
      if (v.trim()) extra[f] = v;
    }
    if (sevRaw && severity === null) extra.severity_raw = sevRaw;
    if (choicesRaw.trim()) extra.choices_raw = choicesRaw;
    const photos = photoCols
      .map((p) => ({ n: p.n, url: c[p.url] ?? "", caption: p.caption != null ? c[p.caption] ?? "" : "" }))
      .filter((p) => p.url.trim() || p.caption.trim());
    if (photos.length) {
      extra.photos = photos;
      issue(r.row, colLetter(photoCols[0].url), "unsupported", `${photos.length} default photo(s) are kept in comment.extra.photos but not imported as images.`, JSON.stringify(photos));
    }
    for (const f of FLAG_FIELDS)
      if (get(c, f).trim() && !["0", "false"].includes(get(c, f).trim().toLowerCase()))
        issue(r.row, colLetter(fieldCol[f]), "unsupported", `"${f.replace(/_/g, " ")}" is set but the editor does not model it; value kept in extra.`, get(c, f));
    const unknown: Record<string, string> = {};
    for (const { h, i } of unknownCols) if (c[i]?.trim()) unknown[h] = c[i];
    if (Object.keys(unknown).length) extra.unknown_columns = unknown;

    const orderRaw = get(c, "order").trim();
    if (orderRaw !== "") {
      extra.source_order = Number(orderRaw);
      const prev = orderSeen.get(ik);
      if (prev !== undefined && Number(orderRaw) < prev && !lastOrderWarned.has(ik)) {
        lastOrderWarned.add(ik);
        issue(r.row, colLetter(fieldCol.order), "warning", `Order value goes backwards within item "${itemName}"; file order was used for position.`, orderRaw);
      }
      orderSeen.set(ik, Number(orderRaw));
    }

    const dupKey = `${ik}\u0000${name}`;
    if (seenNames.has(dupKey))
      issue(r.row, colLetter(fieldCol.name), "warning", `Duplicate comment name "${name}" in the same item (first seen at row ${seenNames.get(dupKey)}); both imported.`, name);
    else seenNames.set(dupKey, r.row);

    const comment: ParsedComment = {
      name,
      body_html: html,
      comment_type: typeRaw || null,
      severity,
      answer_type: answerRaw || null,
      choices: splitList(choicesRaw),
      unit_options: splitList(get(c, "units")),
      recommendation: get(c, "recommendation").trim() ? get(c, "recommendation") : null,
      position: item.comments.length,
      extra,
      source_row: r.row,
    };
    item.comments.push(comment);
    commentCount++;
    const bump = (m: Record<string, number>, k: string | null) => (m[k ?? "(none)"] = (m[k ?? "(none)"] ?? 0) + 1);
    bump(byType, comment.comment_type);
    bump(bySeverity, severity === null ? null : String(severity));
    bump(byAnswerType, comment.answer_type);
    setStatus(r.row, "imported", null);
  }

  const count = (s: RowStatus) => ledger.filter((l) => l.status === s).length;
  const imported = count("imported"), skipped = count("skipped"), unsupported = count("unsupported");
  if (imported === 0)
    throw new ImportError(
      dataRows.length === 0 ? "The sheet has headers but no data rows." : `No rows could be imported (${skipped} skipped, ${unsupported} unsupported). See the ledger for reasons.`,
    );
  return {
    template: { name: templateNameFromFilename(filename), source_filename: filename, sections },
    issues,
    ledger,
    sha256,
    sheet: sheet.name,
    stats: {
      rowsRead: dataRows.length,
      imported,
      skipped,
      unsupported,
      sections: sections.length,
      items: sections.reduce((n, s) => n + s.items.length, 0),
      comments: commentCount,
      warnings: issues.filter((i) => i.severity === "warning").length,
      reconciles: dataRows.length === imported + skipped + unsupported,
      byType,
      bySeverity,
      byAnswerType,
    },
  };
}
