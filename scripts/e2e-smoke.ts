// Manual-flow smoke test against a running app: BASE=http://localhost:3111 npx tsx scripts/e2e-smoke.ts
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ok = (m: string) => console.log("✓", m);

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(BASE);
  await p.getByRole("link", { name: "InterNACHI Residential" }).first().click();
  await p.waitForURL(/templates\//);
  const origUrl = p.url();

  // edit -> reload -> persisted
  await p.locator("summary", { hasText: "Inspection Details" }).first().click();
  const secInput = p.getByLabel(/^Section name: Inspection Details/);
  await secInput.fill("Inspection Details (edited)");
  await secInput.blur();
  await p.getByText("Saved").first().waitFor();
  await p.reload();
  await p.locator("summary", { hasText: "Inspection Details (edited)" }).waitFor();
  ok("section rename persisted after reload");

  // duplicate, edit copy, original unchanged
  await p.getByRole("button", { name: "Duplicate" }).click();
  await p.getByLabel("Name for the copy").fill("Smoke copy");
  await p.getByRole("button", { name: "Create copy" }).click();
  await p.waitForURL((u) => u.toString() !== origUrl && /templates\/[0-9a-f-]+$/.test(u.pathname));
  await p.getByText("Copy of").first().waitFor();
  ok("duplicate opens the copy showing its origin");
  await p.locator("summary", { hasText: "Inspection Details (edited)" }).first().click();
  const s2 = p.getByLabel(/^Section name: Inspection Details \(edited\)/);
  await s2.fill("Only in copy");
  await s2.blur();
  await p.getByText("Saved").first().waitFor();
  await p.goto(origUrl);
  await p.locator("summary", { hasText: "Inspection Details (edited)" }).waitFor();
  if (await p.getByText("Only in copy").count()) throw new Error("copy edit leaked into original");
  ok("edit in copy left the original unchanged");

  // bad file -> honest error
  writeFileSync("/tmp/bad.xls", "not a spreadsheet");
  await p.goto(`${BASE}/import`);
  await p.setInputFiles("#file", "/tmp/bad.xls");
  await p.getByRole("button", { name: "Preview import" }).click();
  await p.getByRole("alert").filter({ hasText: "not an .xlsx" }).waitFor();
  ok("bad file refused with a clear message");

  // good file -> preview -> confirm
  await p.setInputFiles("#file", "fixtures/residential-template-2026-09-29.xls");
  await p.getByRole("button", { name: "Preview import" }).click();
  await p.getByText("every row is accounted for").waitFor();
  await p.getByLabel("Template name").fill("Smoke import");
  await p.getByRole("button", { name: "Confirm and import" }).click();
  await p.waitForURL(/report$/);
  await p.getByText("passed ✓").first().waitFor();
  ok("import preview -> confirm -> report with preservation check");
  await b.close();
}
main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
