// Compares a source export against a saved template. Usage: npm run preserve -- <file.xls> <template-id>
import { readFileSync } from "node:fs";
import { db } from "../lib/db";
import { parseSpectoraExport } from "../lib/importer/parse";
import { readFirstSheet } from "../lib/importer/xlsx";
import { preservationCheck } from "../lib/preserve";
import { getTemplateTree } from "../lib/templates";

process.loadEnvFile?.(".env.local");
const [file, id] = process.argv.slice(2);
if (!file || !id) throw new Error("usage: npm run preserve -- <file.xls> <template-id>");
const buf = readFileSync(file);
const parsed = parseSpectoraExport(buf, file);
const saved = await getTemplateTree(db(), id);
if (!saved) throw new Error(`template ${id} not found`);
const r = preservationCheck(readFirstSheet(buf), parsed.ledger, parsed.issues, saved);
console.log(`${r.ok ? "PASSED" : "FAILED"}: ${r.checked} comments, ${r.exact} identical, ${r.sanitizedLogged} logged sanitizer differences`);
r.mismatches.slice(0, 50).forEach((m) => console.log(" -", m));
process.exit(r.ok ? 0 : 1);
