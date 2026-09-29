"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@lib/db";
import { importBuffer } from "@lib/import-service";
import { ImportError, parseSpectoraExport } from "@lib/importer/parse";
import { sanitizeBody } from "@lib/importer/sanitize";
import type { ParseResult } from "@lib/importer/types";
import { copyTemplate, saveField, type FieldKind } from "@lib/templates";

export type PreviewResult = { ok: true; result: ParseResult; filename: string } | { ok: false; error: string };

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportError("Choose a file to import.");
  return { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name };
}

const message = (e: unknown) => (e instanceof ImportError ? e.message : `Unexpected error: ${(e as Error).message}`);

/** Step 1 of the import flow: parse only, nothing is written. */
export async function previewImport(_prev: unknown, formData: FormData): Promise<PreviewResult> {
  try {
    const { buffer, filename } = await readUpload(formData);
    return { ok: true, result: parseSpectoraExport(buffer, filename), filename };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Step 2: the file is re-parsed server-side and committed; the client never sends parsed data. */
export async function confirmImport(_prev: unknown, formData: FormData): Promise<{ error: string }> {
  let id: string;
  try {
    const { buffer, filename } = await readUpload(formData);
    ({ templateId: id } = await importBuffer(db(), buffer, filename, String(formData.get("name") ?? "")));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/");
  redirect(`/templates/${id}/report`);
}

export async function duplicateTemplate(_prev: unknown, formData: FormData): Promise<{ error: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the copy a name." };
  let id: string;
  try {
    id = await copyTemplate(db(), String(formData.get("id")), name);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/");
  redirect(`/templates/${id}`);
}

export type SaveResult = { ok: true; value: string; notes: string[] } | { ok: false; error: string };

export async function saveFieldAction(kind: FieldKind, id: string, templateId: string, value: string): Promise<SaveResult> {
  try {
    let v = value;
    const notes: string[] = [];
    if (kind === "comment-body") {
      const s = sanitizeBody(value);
      v = s.html;
      notes.push(...s.stripped.map((x) => `Removed ${x.what} ${x.detail}`));
    } else if (!value.trim()) return { ok: false, error: "Name cannot be empty." };
    await saveField(db(), kind, id, v, templateId);
    return { ok: true, value: v, notes };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
