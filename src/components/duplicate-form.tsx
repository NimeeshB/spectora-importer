"use client";

import { useActionState, useState } from "react";
import { duplicateTemplate } from "@/app/actions";

export function DuplicateForm({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(duplicateTemplate, { error: "" });
  if (!open) return <button onClick={() => setOpen(true)} className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-50">Duplicate</button>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="copy-name" className="text-sm">Name for the copy</label>
      <input id="copy-name" name="name" defaultValue={`Copy of ${name}`} required autoFocus className="w-64 rounded border px-2 py-1 text-sm" />
      <button disabled={pending} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">{pending ? "Copying…" : "Create copy"}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm underline">Cancel</button>
      {state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
    </form>
  );
}
