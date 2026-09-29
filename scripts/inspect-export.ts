// @ts-nocheck
// Dumps structure of a Spectora export so the parser is driven by the real file.
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

const file = process.argv[2];
const files = unzipSync(new Uint8Array(readFileSync(file)));
console.log("zip entries:", Object.keys(files).join(", "));
const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
console.log("bytes:", sheet.length, "| merges:", (sheet.match(/<mergeCell /g) ?? []).length, "| t= types:",
  [...new Set([...sheet.matchAll(/ t="(\w+)"/g)].map((m) => m[1]))]);
const p = new XMLParser({ ignoreAttributes: false, preserveOrder: false, parseTagValue: false, trimValues: false });
const j = p.parse(sheet);
const rows = [].concat(j.worksheet.sheetData.row);
console.log("rows:", rows.length, "dimension:", j.worksheet.dimension?.["@_ref"]);
const cell = (c: any) => (typeof c.is === "object" ? c.is.t?.["#text"] ?? c.is.t : c.v);
for (const r of rows.slice(0, 3)) console.log(r["@_r"], JSON.stringify([].concat(r.c).map((c: any) => [c["@_r"], cell(c)])).slice(0, 900));
console.log(sheet.slice(0, 1500));
