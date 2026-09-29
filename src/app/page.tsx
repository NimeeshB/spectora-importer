import Link from "next/link";
import { db } from "@lib/db";
import { listTemplates } from "@lib/templates";

export const dynamic = "force-dynamic";

export default async function Home() {
  let templates;
  try {
    templates = await listTemplates(db());
  } catch (e) {
    return <p role="alert" className="rounded border border-red-300 bg-red-50 p-4">Could not load templates: {(e as Error).message}</p>;
  }
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <Link href="/import" className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800">Import Spectora export</Link>
      </div>
      {templates.length === 0 ? (
        <p className="text-neutral-600">No templates yet. Import a Spectora “Export HTML Text” spreadsheet, or run <code>npm run seed</code>.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-300 text-neutral-600">
              <tr><th className="py-2 pr-4">Name</th><th className="pr-4">Sections</th><th className="pr-4">Items</th><th className="pr-4">Comments</th><th className="pr-4">Origin</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4"><Link className="text-blue-700 hover:underline" href={`/templates/${t.id}`}>{t.name}</Link></td>
                  <td className="pr-4">{t.sections}</td><td className="pr-4">{t.items}</td><td className="pr-4">{t.comments}</td>
                  <td className="pr-4 text-neutral-600">
                    {t.parent_name ? <>Copy of <Link className="underline" href={`/templates/${t.parent_template_id}`}>{t.parent_name}</Link></> : t.source_filename ? `Imported from ${t.source_filename}` : "—"}
                  </td>
                  <td className="text-neutral-600">{new Date(t.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
