// Wipes the demo database and imports the InterNACHI fixture. Usage: npm run seed
import { readFileSync } from "node:fs";
import { db } from "../lib/db";
import { importBuffer } from "../lib/import-service";

process.loadEnvFile?.(".env.local");
const FILE = "fixtures/internachi-residential-2026-09-29.xls";

async function main() {
  const sb = db();
  const reset = await sb.rpc("reset_demo");
  if (reset.error) throw new Error(`reset failed: ${reset.error.message}`);
  const { templateId, preservation } = await importBuffer(sb, readFileSync(FILE), FILE.split("/").pop()!, "InterNACHI Residential");
  console.log(`Seeded template ${templateId}`);
  console.log(`Preservation check: ${preservation.ok ? "PASSED" : "FAILED"} (${preservation.checked} comments)`);
  if (!preservation.ok) {
    console.log(preservation.mismatches.slice(0, 20).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
