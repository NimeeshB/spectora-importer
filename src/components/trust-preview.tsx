import type { ImportIssue, ImportStats, ParseResult } from "@lib/importer/types";
import type { PreservationResult } from "@lib/preserve";

type Props = {
  stats: ImportStats;
  issues: ImportIssue[];
  sha256: string;
  filename: string;
  tree?: ParseResult["template"]["sections"];
  preservation?: PreservationResult | null;
};

const badge = { skipped: "bg-amber-100 text-amber-900", unsupported: "bg-red-100 text-red-900", warning: "bg-neutral-100 text-neutral-800" };

export function TrustReport({ stats, issues, sha256, filename, tree, preservation }: Props) {
  const notable = issues.filter((i) => i.severity !== "warning");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <section aria-label="Import trust report" className="space-y-5">
      <div className={`rounded border p-4 ${stats.reconciles ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
        <p className="font-medium">
          {stats.rowsRead} source rows read = {stats.imported} imported + {stats.skipped} skipped + {stats.unsupported} unsupported
          {stats.reconciles ? " ✓ every row is accounted for" : " ✗ COUNTS DO NOT RECONCILE"}
        </p>
        <p className="text-sm text-neutral-700">
          {stats.sections} sections · {stats.items} items · {stats.comments} comments · {stats.warnings} warnings
        </p>
        <p className="mt-1 break-all text-xs text-neutral-600">{filename} · SHA-256 {sha256}</p>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Breakdown title="Comment type" data={stats.byType} />
        <Breakdown title="Severity (raw -1/0/1)" data={stats.bySeverity} />
        <Breakdown title="Answer type" data={stats.byAnswerType} />
      </div>

      {preservation && (
        <div className={`rounded border p-4 text-sm ${preservation.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <p className="font-medium">
            Preservation check (source sheet vs saved database): {preservation.ok ? "passed ✓" : "FAILED ✗"}
          </p>
          <p>
            {preservation.checked} comments compared for hierarchy, names, text and order: {preservation.exact} identical,{" "}
            {preservation.sanitizedLogged} differ only by logged sanitizer removals.
          </p>
          {preservation.mismatches.length > 0 && (
            <ul className="list-disc pl-5">{preservation.mismatches.slice(0, 20).map((m) => <li key={m}>{m}</li>)}</ul>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 font-semibold">Skipped and unsupported ({notable.length})</h2>
        {notable.length === 0 ? <p className="text-sm text-neutral-600">None. Every row was imported.</p> : <IssueTable issues={notable} />}
      </div>

      <details>
        <summary className="cursor-pointer font-semibold">Warnings ({warnings.length})</summary>
        <div className="mt-2">{warnings.length ? <IssueTable issues={warnings} /> : <p className="text-sm">None.</p>}</div>
      </details>

      {tree && (
        <details>
          <summary className="cursor-pointer font-semibold">Mapped hierarchy ({stats.sections} sections)</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {tree.map((s) => (
              <li key={s.name}>
                <b>{s.name}</b> <span className="text-neutral-500">({s.items.length} items)</span>
                <ul className="ml-5 list-disc text-neutral-700">
                  {s.items.map((i) => <li key={i.name}>{i.name} <span className="text-neutral-500">({i.comments.length})</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-neutral-600">
        Not visible to this report: Spectora exports one row per comment, so a section or item with no comments cannot appear in the file
        at all. Section icons, report layout and styling are also absent from the export.
      </p>
    </section>
  );
}

export { TrustReport as TrustPreview };

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  return (
    <div className="rounded border border-neutral-200 p-3">
      <p className="mb-1 font-medium">{title}</p>
      <ul>{Object.entries(data).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
    </div>
  );
}

function IssueTable({ issues }: { issues: ImportIssue[] }) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white text-neutral-600"><tr><th className="pr-3">Row</th><th className="pr-3">Col</th><th className="pr-3">Kind</th><th className="pr-3">Reason</th><th>Raw content</th></tr></thead>
        <tbody>
          {issues.map((i, n) => (
            <tr key={n} className="border-t border-neutral-100 align-top">
              <td className="pr-3">{i.row}</td><td className="pr-3">{i.column ?? ""}</td>
              <td className="pr-3"><span className={`rounded px-1.5 py-0.5 text-xs ${badge[i.severity]}`}>{i.severity}</span></td>
              <td className="pr-3">{i.reason}</td>
              <td className="max-w-xs break-words font-mono text-xs text-neutral-600">{(i.raw_content ?? "").slice(0, 200)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
