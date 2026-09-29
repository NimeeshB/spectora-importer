import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@lib/db";
import { getTemplateTree } from "@lib/templates";
import { EditableField } from "@/components/editable-field";
import { DuplicateForm } from "@/components/duplicate-form";

export const dynamic = "force-dynamic";

const SEVERITY: Record<number, string> = { [-1]: "Low", 0: "Medium", 1: "High" };

export default async function TemplatePage({ params }: PageProps<"/templates/[id]">) {
  const { id } = await params;
  const sb = db();
  const t = await getTemplateTree(sb, id);
  if (!t) notFound();
  const parent = t.parent_template_id ? await sb.from("templates").select("id,name").eq("id", t.parent_template_id).maybeSingle() : null;
  return (
    <>
      <div className="mb-4 space-y-2">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        {parent && (
          <p className="text-sm text-neutral-600">
            Copy of {parent.data ? <Link className="underline" href={`/templates/${parent.data.id}`}>{parent.data.name}</Link> : "a deleted template"}
          </p>
        )}
        {t.source_filename && <p className="text-sm text-neutral-600">Source file: {t.source_filename}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <DuplicateForm id={t.id} name={t.name} />
          <Link className="text-sm text-blue-700 hover:underline" href={`/templates/${t.id}/report`}>Import report</Link>
        </div>
      </div>

      <div className="space-y-3">
        {t.sections.map((s) => (
          <details key={s.id} className="rounded border border-neutral-200" open={t.sections.length === 1}>
            <summary className="cursor-pointer bg-neutral-50 px-3 py-2 font-medium">
              {s.name} <span className="text-sm font-normal text-neutral-500">({s.items.length} items)</span>
            </summary>
            <div className="space-y-4 p-3">
              <div className="max-w-md"><EditableField kind="section" id={s.id} templateId={t.id} initial={s.name} label={`Section name: ${s.name}`} /></div>
              {s.items.map((i) => (
                <details key={i.id} className="rounded border border-neutral-200">
                  <summary className="cursor-pointer px-3 py-2">
                    {i.name} <span className="text-sm text-neutral-500">({i.comments.length} comments)</span>
                  </summary>
                  <div className="space-y-4 p-3">
                    <div className="max-w-md"><EditableField kind="item" id={i.id} templateId={t.id} initial={i.name} label={`Item name: ${i.name}`} /></div>
                    <table className="w-full text-left text-sm">
                      <thead className="text-neutral-600"><tr><th className="w-1/4 pb-1 pr-3">Comment</th><th className="pb-1 pr-3">Text (HTML)</th><th className="w-32 pb-1">Kind</th></tr></thead>
                      <tbody>
                        {i.comments.map((c) => (
                          <tr key={c.id} className="border-t border-neutral-100 align-top">
                            <td className="py-2 pr-3"><EditableField kind="comment-name" id={c.id} templateId={t.id} initial={c.name} label={`Comment name: ${c.name}`} /></td>
                            <td className="py-2 pr-3"><EditableField multiline kind="comment-body" id={c.id} templateId={t.id} initial={c.body_html} label={`Comment text for ${c.name}`} /></td>
                            <td className="py-2 text-xs text-neutral-600">
                              {c.comment_type ?? "—"}
                              {c.severity !== null && ` · ${SEVERITY[c.severity] ?? c.severity}`}
                              {c.answer_type && <><br />{c.answer_type}</>}
                              {c.choices.length > 0 && <><br />{c.choices.length} choices</>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
