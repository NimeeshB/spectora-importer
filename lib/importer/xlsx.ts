// Minimal xlsx reader: first worksheet only, returns rows of strings keyed by 1-based row number.
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export const MAX_BYTES = 5 * 1024 * 1024;

export class ImportError extends Error {}

export type SheetRow = { row: number; cells: string[] };
export type Sheet = { name: string; rows: SheetRow[] };

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false, // keep xml:space="preserve" whitespace such as "Temperature "
  isArray: (name) => ["row", "c", "si", "r", "sheet", "Relationship"].includes(name),
});

const text = (t: unknown): string => {
  if (t == null) return "";
  if (typeof t === "string") return t;
  if (typeof t === "object") return String((t as Record<string, unknown>)["#text"] ?? "");
  return String(t);
};

// Rich text and plain <si>/<is> both reduce to concatenated <t> runs.
const richText = (n: any): string =>
  n?.r ? n.r.map((r: any) => text(r.t)).join("") : text(n?.t);

export function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export function readFirstSheet(buffer: Buffer | Uint8Array): Sheet {
  if (buffer.length === 0) throw new ImportError("The file is empty.");
  if (buffer.length > MAX_BYTES)
    throw new ImportError(`The file is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB.`);
  // Detect by content, not extension: Spectora saves .xlsx data as .xls.
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b))
    throw new ImportError("This is not an .xlsx file (no ZIP signature). Export from Spectora with Export to spreadsheet → Export HTML Text.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new ImportError("The file looks like a ZIP but could not be opened; it may be corrupt.");
  }
  const get = (p: string) => (files[p] ? strFromU8(files[p]) : undefined);
  const wb = get("xl/workbook.xml");
  if (!wb) throw new ImportError("This ZIP is not a spreadsheet (xl/workbook.xml is missing).");

  const sheets = xml.parse(wb).workbook?.sheets?.sheet ?? [];
  const first = sheets[0];
  if (!first) throw new ImportError("The workbook has no sheets.");
  const rid = first["@_r:id"];
  const rels: any[] = xml.parse(get("xl/_rels/workbook.xml.rels") ?? "").Relationships?.Relationship ?? [];
  const target = rels.find((r) => r["@_Id"] === rid)?.["@_Target"] ?? "worksheets/sheet1.xml";
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheetXml = get(path);
  if (!sheetXml) throw new ImportError(`Worksheet ${path} is missing from the file.`);

  const sst = get("xl/sharedStrings.xml");
  const shared: string[] = sst ? (xml.parse(sst).sst?.si ?? []).map(richText) : [];

  const data = xml.parse(sheetXml).worksheet?.sheetData;
  const rows: SheetRow[] = [];
  for (const r of data?.row ?? []) {
    const cells: string[] = [];
    let next = 0;
    for (const c of r.c ?? []) {
      const i = c["@_r"] ? colIndex(c["@_r"]) : next;
      const t = c["@_t"];
      let v = "";
      if (t === "inlineStr") v = richText(c.is);
      else if (t === "s") v = shared[Number(text(c.v))] ?? "";
      else v = text(c.v);
      cells[i] = v;
      next = i + 1;
    }
    rows.push({ row: Number(r["@_r"]) || rows.length + 1, cells });
  }
  return { name: String(first["@_name"] ?? "Sheet1"), rows };
}
