export type CommentRow = {
  id: string;
  item_id: string;
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
};
export type ItemNode = { id: string; name: string; position: number; comments: CommentRow[] };
export type SectionNode = { id: string; name: string; position: number; items: ItemNode[] };
export type TemplateRow = {
  id: string;
  name: string;
  source_filename: string | null;
  source_template_name: string | null;
  parent_template_id: string | null;
  created_at: string;
  updated_at: string;
};
export type TemplateTree = TemplateRow & { sections: SectionNode[] };
