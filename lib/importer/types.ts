export type IssueSeverity = "skipped" | "unsupported" | "warning";

export type ImportIssue = {
  sheet: string;
  row: number; // 1-based row number in the source sheet
  column: string | null; // column letter, e.g. "D"
  severity: IssueSeverity;
  reason: string;
  raw_content: string | null;
};

export type ParsedComment = {
  name: string;
  body_html: string;
  comment_type: string | null;
  severity: number | null;
  answer_type: string | null;
  choices: string[];
  unit_options: string[];
  recommendation: string | null;
  position: number;
  extra: Record<string, unknown>;
  source_row: number;
};

export type ParsedItem = { name: string; comments: ParsedComment[] };
export type ParsedSection = { name: string; items: ParsedItem[] };

export type RowStatus = "imported" | "skipped" | "unsupported";
export type LedgerEntry = { row: number; status: RowStatus; reason: string | null };

export type ImportStats = {
  rowsRead: number;
  imported: number;
  skipped: number;
  unsupported: number;
  sections: number;
  items: number;
  comments: number;
  warnings: number;
  reconciles: boolean; // rowsRead === imported + skipped + unsupported
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byAnswerType: Record<string, number>;
};

export type ParseResult = {
  template: { name: string; source_filename: string; sections: ParsedSection[] };
  issues: ImportIssue[];
  ledger: LedgerEntry[];
  stats: ImportStats;
  sha256: string;
  sheet: string;
};
