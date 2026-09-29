import { zipSync, strToU8 } from "fflate";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (i: number) => String.fromCharCode(65 + i);

/** Build a minimal xlsx (inline strings, like Spectora's) from a 2D array. null = absent cell. */
export function makeXlsx(rows: (string | null)[][], sheetName = "Sheet1"): Buffer {
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => (v == null ? "" : `<c r="${col(ci)}${ri + 1}" t="str"><v xml:space="preserve">${esc(v)}</v></c>`))
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return Buffer.from(zipSync(files));
}

export const HEADER = [
  "Section Name", "Item Name", "Comment Name", "Comment Text", "Comment Type (info, limit, defect)",
  "Category (-1: Low, 0: Med, 1: High)", "Multiple Choice Options (comma-separated)",
  "Unit Type Options (numeric answers only, comma-separated)", "Recommendation (from list)", "Order (w/i item)",
  "Answer Type (boolean, checkbox, date, number, range, text)",
];
