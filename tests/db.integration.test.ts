// Runs against a real Supabase project. Skipped unless SUPABASE env vars are set.
import { readFileSync } from "node:fs";
import { describe, expect, it, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { importBuffer } from "../lib/import-service";
import { copyTemplate, getTemplateTree, saveField } from "../lib/templates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = () => createClient(url!, key!, { auth: { persistSession: false } });

describe.skipIf(!url || !key)("database", () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await client().from("templates").delete().in("id", ids); });

  it("imports, persists across a fresh client, and copies independently", async () => {
    const buf = readFileSync("fixtures/internachi-residential-2026-09-29.xls");
    const { templateId, preservation } = await importBuffer(client(), buf, "internachi.xls", "IT original");
    ids.push(templateId);
    expect(preservation.ok).toBe(true);

    const fresh = await getTemplateTree(client(), templateId); // fresh client = persistence check
    expect(fresh!.sections).toHaveLength(13);

    const copyId = await copyTemplate(client(), templateId, "IT copy");
    ids.push(copyId);
    const copy = await getTemplateTree(client(), copyId);
    expect(copy!.parent_template_id).toBe(templateId);
    const origIds = new Set(fresh!.sections.flatMap((s) => [s.id, ...s.items.flatMap((i) => [i.id, ...i.comments.map((c) => c.id)])]));
    const copyAll = copy!.sections.flatMap((s) => [s.id, ...s.items.flatMap((i) => [i.id, ...i.comments.map((c) => c.id)])]);
    expect(copyAll.some((x) => origIds.has(x))).toBe(false);

    const c = copy!.sections[0].items[0].comments[0];
    await saveField(client(), "comment-body", c.id, "<p>edited in copy</p>", copyId);
    await saveField(client(), "section", copy!.sections[0].id, "Renamed in copy", copyId);
    const after = await getTemplateTree(client(), templateId);
    expect(after!.sections[0].name).toBe(fresh!.sections[0].name);
    expect(after!.sections[0].items[0].comments[0].body_html).toBe(fresh!.sections[0].items[0].comments[0].body_html);
    const copyAfter = await getTemplateTree(client(), copyId);
    expect(copyAfter!.sections[0].items[0].comments[0].body_html).toBe("<p>edited in copy</p>");
  });
});
