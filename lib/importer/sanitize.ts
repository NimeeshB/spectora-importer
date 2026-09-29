import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";

const ALLOWED_TAGS = ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4"];
const ALLOWED_ATTRS: Record<string, string[]> = { a: ["href", "title"] };
const ALLOWED_SCHEMES = ["http", "https", "mailto"];

export type Stripped = { what: "tag" | "attribute" | "href"; detail: string };

/** Allowlist-sanitize HTML and report everything removed, so nothing is silently rewritten. */
export function sanitizeBody(html: string): { html: string; stripped: Stripped[] } {
  const stripped: Stripped[] = [];
  const parser = new Parser({
    onopentag(name, attrs) {
      if (!ALLOWED_TAGS.includes(name)) stripped.push({ what: "tag", detail: `<${name}>` });
      else
        for (const [k, v] of Object.entries(attrs)) {
          if (!(ALLOWED_ATTRS[name] ?? []).includes(k)) stripped.push({ what: "attribute", detail: `${name}[${k}]` });
          else if (k === "href" && !ALLOWED_SCHEMES.includes(/^([a-z][a-z0-9+.-]*):/i.exec(v.trim())?.[1]?.toLowerCase() ?? "https"))
            stripped.push({ what: "href", detail: v });
        }
    },
  }, { decodeEntities: false });
  parser.write(html);
  parser.end();
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    disallowedTagsMode: "discard",
  });
  return { html: clean, stripped };
}
