import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParseResult } from "./importer/types";
import type { CommentRow, ItemNode, SectionNode, TemplateRow, TemplateTree } from "./types";

const fail = (what: string, e: { message: string } | null) => {
  if (e) throw new Error(`${what}: ${e.message}`);
};

export type TemplateListEntry = TemplateRow & { sections: number; items: number; comments: number; parent_name: string | null };

export async function listTemplates(sb: SupabaseClient): Promise<TemplateListEntry[]> {
  const [t, s] = await Promise.all([
    sb.from("templates").select("*").order("created_at", { ascending: true }),
    sb.from("template_stats").select("*"),
  ]);
  fail("list templates", t.error);
  fail("template stats", s.error);
  const stats = new Map((s.data ?? []).map((x) => [x.template_id, x]));
  const rows = (t.data ?? []) as TemplateRow[];
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return rows.map((r) => ({
    ...r,
    sections: Number(stats.get(r.id)?.sections ?? 0),
    items: Number(stats.get(r.id)?.items ?? 0),
    comments: Number(stats.get(r.id)?.comments ?? 0),
    parent_name: r.parent_template_id ? names.get(r.parent_template_id) ?? "(deleted template)" : null,
  }));
}

export async function getTemplateTree(sb: SupabaseClient, id: string): Promise<TemplateTree | null> {
  const t = await sb.from("templates").select("*").eq("id", id).maybeSingle();
  fail("load template", t.error);
  if (!t.data) return null;
  const secs = await sb.from("sections").select("*").eq("template_id", id).order("position");
  fail("load sections", secs.error);
  const secIds = (secs.data ?? []).map((s) => s.id);
  const items = secIds.length ? await sb.from("items").select("*").in("section_id", secIds).order("position") : { data: [], error: null };
  fail("load items", items.error);
  const itemIds = (items.data ?? []).map((i) => i.id);
  // PostgREST caps rows per request; page through comments.
  const comments: CommentRow[] = [];
  for (let from = 0; itemIds.length; from += 1000) {
    const c = await sb.from("comments").select("*").in("item_id", itemIds).order("position").range(from, from + 999);
    fail("load comments", c.error);
    comments.push(...((c.data ?? []) as CommentRow[]));
    if ((c.data ?? []).length < 1000) break;
  }
  const byItem = new Map<string, CommentRow[]>();
  for (const c of comments) byItem.set(c.item_id, [...(byItem.get(c.item_id) ?? []), c]);
  const itemsBySec = new Map<string, ItemNode[]>();
  for (const i of items.data ?? [])
    itemsBySec.set(i.section_id, [...(itemsBySec.get(i.section_id) ?? []), { id: i.id, name: i.name, position: i.position, comments: byItem.get(i.id) ?? [] }]);
  const sections: SectionNode[] = (secs.data ?? []).map((s) => ({ id: s.id, name: s.name, position: s.position, items: itemsBySec.get(s.id) ?? [] }));
  return { ...(t.data as TemplateRow), sections };
}

export async function commitImport(sb: SupabaseClient, r: ParseResult, name: string): Promise<string> {
  const payload = {
    name,
    source_filename: r.template.source_filename,
    source_template_name: null, // the export does not carry the template's name
    sections: r.template.sections,
    run: { filename: r.template.source_filename, file_sha256: r.sha256, counts: r.stats, issues: r.issues.map((i) => ({ ...i })) },
  };
  const { data, error } = await sb.rpc("import_template", { p: payload });
  fail("import", error);
  return data as string;
}

export async function copyTemplate(sb: SupabaseClient, id: string, name: string): Promise<string> {
  const { data, error } = await sb.rpc("copy_template", { src: id, new_name: name });
  fail("copy", error);
  return data as string;
}

export async function latestImport(sb: SupabaseClient, templateId: string) {
  const run = await sb.from("import_runs").select("*").eq("template_id", templateId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  fail("load import run", run.error);
  if (!run.data) return null;
  const issues = await sb.from("import_issues").select("*").eq("import_run_id", run.data.id).order("row").limit(5000);
  fail("load import issues", issues.error);
  return { run: run.data, issues: issues.data ?? [] };
}

export type FieldKind = "section" | "item" | "comment-name" | "comment-body";
const TARGET = {
  section: { table: "sections", column: "name" },
  item: { table: "items", column: "name" },
  "comment-name": { table: "comments", column: "name" },
  "comment-body": { table: "comments", column: "body_html" },
} as const;

export async function saveField(sb: SupabaseClient, kind: FieldKind, id: string, value: string, templateId: string) {
  const t = TARGET[kind];
  const { data, error } = await sb.from(t.table).update({ [t.column]: value }).eq("id", id).select("id");
  fail("save", error);
  if (!data?.length) throw new Error("Nothing was saved: that record no longer exists.");
  await sb.from("templates").update({ updated_at: new Date().toISOString() }).eq("id", templateId);
}
