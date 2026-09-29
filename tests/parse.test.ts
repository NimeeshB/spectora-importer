import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSpectoraExport, ImportError } from "../lib/importer/parse";
import { HEADER, makeXlsx } from "./make-xlsx";

const fx = (n: string) => readFileSync(`fixtures/${n}`);
const row = (o: Partial<Record<number, string>>): (string | null)[] => HEADER.map((_, i) => o[i] ?? "");

describe("InterNACHI export", () => {
  const r = parseSpectoraExport(fx("internachi-residential-2026-09-29.xls"), "internachi-residential-2026-09-29.xls");

  it("matches source counts and reconciles", () => {
    expect(r.stats).toMatchObject({ rowsRead: 392, imported: 392, skipped: 0, unsupported: 0, sections: 13, items: 69, comments: 392, reconciles: true });
    expect(r.stats.byType).toEqual({ info: 78, defect: 302, limit: 12 });
    expect(r.stats.byAnswerType).toEqual({ boolean: 315, checkbox: 72, number: 4, text: 1 });
    expect(r.stats.bySeverity).toEqual({ "0": 281, "1": 21, "(none)": 90 });
    expect(r.ledger).toHaveLength(392);
  });

  it("decodes entity-encoded names and keeps trailing whitespace", () => {
    const items = r.template.sections.flatMap((s) => s.items.map((i) => i.name));
    expect(items).toContain("Siding, Flashing & Trim");
    expect(items.some((n) => n.includes("&amp;"))).toBe(false);
    const names = r.template.sections.flatMap((s) => s.items.flatMap((i) => i.comments.map((c) => c.name)));
    expect(names.filter((n) => /\s$/.test(n)).length).toBe(11);
  });

  it("keeps file order as contiguous positions", () => {
    for (const s of r.template.sections) for (const i of s.items) expect(i.comments.map((c) => c.position)).toEqual(i.comments.map((_, k) => k));
    expect(r.template.sections[0].name).toBe("Inspection Details");
    expect(r.template.sections[0].items[0].comments[0].name).toBe("In Attendance");
  });

  it("splits choices and logs sanitizer removals with location", () => {
    expect(r.template.sections[0].items[0].comments[0].choices).toEqual(["Listing Agent", "Home Owner", "Client", "Client's Agent"]);
    const w = r.issues.find((i) => i.reason.includes("a[target]"));
    expect(w).toMatchObject({ severity: "warning", column: "D" });
    expect(w!.row).toBeGreaterThan(1);
  });

  it("flags the duplicate comment name", () => {
    expect(r.issues.find((i) => i.reason.startsWith("Duplicate"))?.row).toBe(264);
  });

  it("is deterministic", () => {
    const again = parseSpectoraExport(fx("internachi-residential-2026-09-29.xls"), "internachi-residential-2026-09-29.xls");
    expect(again).toEqual(r);
  });

  it("parses the second fixture too", () => {
    const r2 = parseSpectoraExport(fx("residential-template-2026-09-29.xls"), "residential-template-2026-09-29.xls");
    expect(r2.stats.reconciles).toBe(true);
    expect(r2.stats.comments).toBe(r.stats.comments);
  });
});

describe("Room-by-Room export (a genuinely different template)", () => {
  const buf = fx("room-by-room-residential-2026-09-29.xls");
  const r = parseSpectoraExport(buf, "room-by-room-residential-2026-09-29.xls");

  it("reconciles with its own structure", () => {
    expect(r.stats).toMatchObject({ rowsRead: 798, imported: 798, skipped: 0, unsupported: 0, sections: 22, items: 136, comments: 798, reconciles: true });
    expect(r.stats.byType).toEqual({ info: 114, defect: 661, limit: 23 });
    expect(r.stats.bySeverity).toEqual({ "-1": 1, "0": 639, "1": 21, "(none)": 137 });
    expect(r.template.name).toBe("room by room residential");
  });

  it("differs from InterNACHI in structure, and preserves against the source", async () => {
    const { readFirstSheet } = await import("../lib/importer/xlsx");
    const { preservationCheck } = await import("../lib/preserve");
    const nachi = parseSpectoraExport(fx("internachi-residential-2026-09-29.xls"), "x.xls");
    expect(r.template.sections.map((s) => s.name)).not.toEqual(nachi.template.sections.map((s) => s.name));
    const tree = {
      sections: r.template.sections.map((s, si) => ({
        name: s.name, position: si,
        items: s.items.map((i, ii) => ({ name: i.name, position: ii, comments: i.comments })),
      })),
    };
    expect(preservationCheck(readFirstSheet(buf), r.ledger, r.issues, tree as never).mismatches).toEqual([]);
  });
});

describe("hand-made fixtures", () => {
  it("accounts for blank, unplaceable and empty rows", () => {
    const buf = makeXlsx([
      HEADER,
      row({ 0: "S", 1: "I", 2: "A", 3: "text" }),
      HEADER.map(() => ""), // blank
      row({ 0: "S", 1: "", 2: "orphan", 3: "x" }), // no item
      row({ 0: "S", 1: "I", 2: "", 3: "" }), // nothing to import
      row({ 0: "S", 1: "I", 2: "B", 3: "" }), // empty text is fine
    ]);
    const r = parseSpectoraExport(buf, "x.xlsx");
    expect(r.stats).toMatchObject({ rowsRead: 5, imported: 2, skipped: 2, unsupported: 1, reconciles: true });
    expect(r.ledger.map((l) => [l.row, l.status])).toEqual([[2, "imported"], [3, "skipped"], [4, "unsupported"], [5, "skipped"], [6, "imported"]]);
    expect(r.issues.filter((i) => i.severity !== "warning").every((i) => i.reason && i.row >= 3)).toBe(true);
  });

  it("handles special characters, entities and whitespace", () => {
    const r = parseSpectoraExport(makeXlsx([HEADER, row({ 0: "Crawlspace &amp; Structure", 1: "Café “Ω”", 2: "Temperature ", 3: "<p>5 &lt; 6 &amp; ünï</p>" })]), "x.xlsx");
    const c = r.template.sections[0].items[0].comments[0];
    expect(r.template.sections[0].name).toBe("Crawlspace & Structure");
    expect(r.template.sections[0].items[0].name).toBe("Café “Ω”");
    expect(c.name).toBe("Temperature ");
    expect(c.body_html).toBe("<p>5 &lt; 6 &amp; ünï</p>");
  });

  it("sanitizes nested HTML, keeps links, and logs what was stripped", () => {
    const html = `<p>Hi <strong>there <em>you</em></strong><script>alert(1)</script> <a href="javascript:evil()" onclick="x()">bad</a> <a href="https://ok.example">ok</a></p>`;
    const r = parseSpectoraExport(makeXlsx([HEADER, row({ 0: "S", 1: "I", 2: "C", 3: html })]), "x.xlsx");
    const body = r.template.sections[0].items[0].comments[0].body_html;
    expect(body).not.toMatch(/script|onclick|javascript:/);
    expect(body).toContain('<a href="https://ok.example">ok</a>');
    expect(body).toContain("<strong>there <em>you</em></strong>");
    const reasons = r.issues.map((i) => i.reason).join("\n");
    expect(reasons).toContain("<script>");
    expect(reasons).toContain("a[onclick]");
    expect(reasons).toContain("javascript:evil()");
  });

  it("keeps unusual values and logs them; preserves photos as unsupported", () => {
    const head = [...HEADER, "Default Photo 1", "Default Photo 1 Caption", "Mystery"];
    const r = parseSpectoraExport(
      makeXlsx([head, [..."S I C t weird 7 a b 3 sparkle".split(" ").slice(0, 3), "t", "weird", "7", "", "", "", "3", "sparkle", "http://img/1.png", "cap", "zzz"]]),
      "x.xlsx",
    );
    const c = r.template.sections[0].items[0].comments[0];
    expect(c.comment_type).toBe("weird");
    expect(c.severity).toBeNull();
    expect(c.extra).toMatchObject({ severity_raw: "7", photos: [{ n: 1, url: "http://img/1.png", caption: "cap" }], unknown_columns: { Mystery: "zzz" } });
    const kinds = r.issues.map((i) => `${i.severity}:${i.reason.slice(0, 20)}`);
    expect(kinds.some((k) => k.startsWith("unsupported:Column \"Mystery\""))).toBe(true);
    expect(kinds.some((k) => k.startsWith("unsupported:1 default photo"))).toBe(true);
    expect(r.stats.reconciles).toBe(true);
  });

  it("groups non-adjacent rows of the same item and keeps first-seen order", () => {
    const r = parseSpectoraExport(
      makeXlsx([HEADER, row({ 0: "S1", 1: "I1", 2: "a" }), row({ 0: "S2", 1: "I2", 2: "b" }), row({ 0: "S1", 1: "I1", 2: "c" })]),
      "x.xlsx",
    );
    expect(r.template.sections.map((s) => s.name)).toEqual(["S1", "S2"]);
    expect(r.template.sections[0].items[0].comments.map((c) => c.name)).toEqual(["a", "c"]);
  });
});

describe("failure cases", () => {
  it.each([
    ["empty file", Buffer.alloc(0), /empty/i],
    ["not an xlsx", Buffer.from("Section Name,Item Name\nA,B"), /not an \.xlsx/i],
    ["corrupt zip", Buffer.concat([Buffer.from("PK"), Buffer.from("garbage garbage")]), /ZIP|corrupt/i],
    ["oversized", Buffer.concat([Buffer.from("PK"), Buffer.alloc(6 * 1024 * 1024)]), /limit/i],
    ["missing columns", makeXlsx([["Foo", "Bar"], ["1", "2"]]), /Missing column\(s\): Section Name, Item Name, Comment Name, Comment Text/],
    ["header only", makeXlsx([HEADER]), /no data rows/i],
  ])("rejects %s with a clear message", (_n, buf, msg) => {
    expect(() => parseSpectoraExport(buf, "x")).toThrowError(ImportError);
    expect(() => parseSpectoraExport(buf, "x")).toThrowError(msg);
  });
});

describe("preservation check (in-memory tree)", () => {
  it("passes on the real export and fails when text is altered", async () => {
    const { readFirstSheet } = await import("../lib/importer/xlsx");
    const { preservationCheck } = await import("../lib/preserve");
    const buf = fx("internachi-residential-2026-09-29.xls");
    const r = parseSpectoraExport(buf, "x.xls");
    const toTree = () => ({
      sections: r.template.sections.map((s, si) => ({
        name: s.name, position: si,
        items: s.items.map((i, ii) => ({ name: i.name, position: ii, comments: i.comments.map((c) => ({ ...c, body_html: c.body_html })) })),
      })),
    });
    const res = preservationCheck(readFirstSheet(buf), r.ledger, r.issues, toTree() as never);
    expect(res.mismatches).toEqual([]);
    expect(res.checked).toBe(392);
    const bad = toTree() as never as { sections: { items: { comments: { name: string }[] }[] }[] };
    bad.sections[0].items[0].comments[0].name = "changed";
    bad.sections[1].items[0].comments.reverse();
    expect(preservationCheck(readFirstSheet(buf), r.ledger, r.issues, bad as never).ok).toBe(false);
  });
});
