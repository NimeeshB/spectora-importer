"use client";

import { useState } from "react";
import { saveFieldAction } from "@/app/actions";
import type { FieldKind } from "@lib/templates";

type State = "idle" | "saving" | "saved" | "failed";

export function EditableField({ kind, id, templateId, initial, label, multiline = false, className = "" }: {
  kind: FieldKind; id: string; templateId: string; initial: string; label: string; multiline?: boolean; className?: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

  async function save() {
    if (value === saved) return;
    setState("saving");
    const r = await saveFieldAction(kind, id, templateId, value);
    if (r.ok) {
      setValue(r.value);
      setSaved(r.value);
      setState("saved");
      setMsg(r.notes.length ? `Saved. ${r.notes.join("; ")}` : "Saved");
    } else {
      setState("failed");
      setMsg(r.error);
    }
  }

  const common = {
    "aria-label": label,
    value,
    onChange: (e: { target: { value: string } }) => { setValue(e.target.value); setState("idle"); },
    onBlur: save,
    className: `w-full rounded border border-neutral-300 px-2 py-1 ${className}`,
  };
  return (
    <div>
      {multiline ? <textarea rows={4} {...common} className={`${common.className} font-mono text-xs`} /> : <input {...common} />}
      <p role="status" aria-live="polite" className={`h-4 text-xs ${state === "failed" ? "text-red-700" : "text-neutral-500"}`}>
        {state === "saving" ? "Saving…" : state === "saved" || state === "failed" ? msg : value !== saved ? "Unsaved changes (saves when you leave the field)" : ""}
      </p>
    </div>
  );
}
