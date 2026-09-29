import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSpectoraExport } from "./importer/parse";
import { readFirstSheet } from "./importer/xlsx";
import { preservationCheck, type PreservationResult } from "./preserve";
import { commitImport, getTemplateTree } from "./templates";

/** Parse, save atomically, then re-read from the DB and compare against the source sheet. */
export async function importBuffer(
  sb: SupabaseClient,
  buffer: Buffer,
  filename: string,
  name?: string,
): Promise<{ templateId: string; preservation: PreservationResult }> {
  const parsed = parseSpectoraExport(buffer, filename);
  const templateId = await commitImport(sb, parsed, name?.trim() || parsed.template.name);
  const saved = await getTemplateTree(sb, templateId);
  if (!saved) throw new Error("Import committed but the template could not be read back.");
  const preservation = preservationCheck(readFirstSheet(buffer), parsed.ledger, parsed.issues, saved);
  const run = await sb.from("import_runs").select("id,counts").eq("template_id", templateId).single();
  if (run.data) await sb.from("import_runs").update({ counts: { ...run.data.counts, preservation } }).eq("id", run.data.id);
  return { templateId, preservation };
}
