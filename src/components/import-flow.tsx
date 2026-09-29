"use client";

import { useActionState, useState } from "react";
import { confirmImport, previewImport, type PreviewResult } from "@/app/actions";
import { TrustPreview } from "./trust-preview";

export function ImportFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, previewAction, previewing] = useActionState<PreviewResult | null, FormData>(previewImport, null);
  const [commit, commitAction, committing] = useActionState(confirmImport, { error: "" });

  return (
    <div className="space-y-6">
      <form action={previewAction} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="file">Spectora export (.xls or .xlsx, max 4 MB)</label>
        <input id="file" name="file" type="file" accept=".xls,.xlsx" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block" />
        <p className="text-sm text-neutral-600">In Spectora: open the template → ⋮ → Export to spreadsheet → <b>Export HTML Text</b>. Nothing is saved until you confirm.</p>
        <button disabled={!file || previewing} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{previewing ? "Reading…" : "Preview import"}</button>
      </form>

      {preview && !preview.ok && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-4"><b>Import refused.</b> {preview.error}</p>
      )}

      {preview?.ok && file && (
        <>
          <TrustPreview stats={preview.result.stats} issues={preview.result.issues} sha256={preview.result.sha256} filename={preview.filename} tree={preview.result.template.sections} />
          <form action={commitAction} className="flex flex-wrap items-end gap-3 border-t pt-4">
            <FileCarrier file={file} />
            <div>
              <label htmlFor="name" className="block text-sm font-medium">Template name</label>
              <input id="name" name="name" defaultValue={preview.result.template.name} required className="w-72 rounded border px-2 py-1" />
            </div>
            <button disabled={committing} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">{committing ? "Importing…" : "Confirm and import"}</button>
            {commit.error && <p role="alert" className="text-red-700">{commit.error}</p>}
          </form>
        </>
      )}
    </div>
  );
}

/** Re-attaches the chosen File to the confirm form so the server re-parses the exact same bytes. */
function FileCarrier({ file }: { file: File }) {
  return (
    <input
      type="file"
      name="file"
      className="hidden"
      ref={(el) => {
        if (!el) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        el.files = dt.files;
      }}
    />
  );
}
