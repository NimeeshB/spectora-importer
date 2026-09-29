# Spectora template importer

Imports a Spectora **Export to spreadsheet → Export HTML Text** file into a normalized Postgres model,
lets you edit it, duplicate it, and shows an import trust report (mapped / skipped / unsupported, per row).

Stack: Next.js App Router (TypeScript) · Supabase Postgres via supabase-js · deterministic parser (no LLM).

## Setup
```bash
npm install
cp .env.example .env.local     # fill in the two values below
```
| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Used by server actions and scripts; never sent to the browser |

## Database initialization
Run the SQL in [supabase/migrations/](supabase/migrations/) against your project, in filename order:
- Supabase dashboard → SQL editor → paste `20260929000000_init.sql` → Run, **or**
- `supabase link --project-ref <ref> && supabase db push`

It creates the tables, a `template_stats` view, RLS (enabled, no policies: the anon key can do nothing),
and three functions: `import_template` and `copy_template` (each runs in one transaction) and `reset_demo`.

## Run
```bash
npm run seed      # wipes the demo DB and imports fixtures/internachi-residential-2026-09-29.xls
npm run dev       # http://localhost:3000 opens on the seeded template list
```

## Tests and checks
```bash
npm test                                   # importer unit tests; DB integration test runs if .env.local is set
npm run preserve -- fixtures/internachi-residential-2026-09-29.xls <template-id>
BASE=http://localhost:3000 npx tsx scripts/e2e-smoke.ts   # browser walkthrough (Playwright)
```

## Deploy (Vercel)
Link the repo, set the two env vars in the Vercel project, deploy, then run `npm run seed` locally against the
same Supabase project so the live URL opens on an imported template.

## Layout
`src/app/` routes and server actions · `lib/importer/` pure parser (`parseSpectoraExport`) · `lib/` data access,
preservation check · `supabase/migrations/` · `fixtures/` real exports + provenance · `scripts/` seed, preservation, e2e.

See [NOTES.md](NOTES.md) for decisions, cuts and limits.
