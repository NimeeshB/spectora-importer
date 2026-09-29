import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@lib/db";
import { latestImport } from "@lib/templates";
import { TrustReport } from "@/components/trust-preview";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: PageProps<"/templates/[id]/report">) {
  const { id } = await params;
  const sb = db();
  const [t, imp] = await Promise.all([sb.from("templates").select("name").eq("id", id).maybeSingle(), latestImport(sb, id)]);
  if (!t.data) notFound();
  return (
    <>
      <p className="mb-2 text-sm"><Link className="text-blue-700 hover:underline" href={`/templates/${id}`}>← Open editor</Link></p>
      <h1 className="mb-4 text-2xl font-semibold">Import report: {t.data.name}</h1>
      {imp ? (
        <TrustReport
          stats={imp.run.counts}
          issues={imp.issues.map((i) => ({ ...i, raw_content: i.raw_content }))}
          sha256={imp.run.file_sha256}
          filename={imp.run.filename}
          preservation={imp.run.counts.preservation}
        />
      ) : (
        <p>This template was not created by an import (it may be a copy). Open the original template to see its report.</p>
      )}
    </>
  );
}
