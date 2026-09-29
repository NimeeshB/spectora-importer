-- Normalized, ordered template model. No whole-template blob.
create extension if not exists pgcrypto;

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_filename text,
  source_template_name text,
  parent_template_id uuid references templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  name text not null,
  position integer not null
);
create index sections_template_idx on sections(template_id, position);

create table items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  name text not null,
  position integer not null
);
create index items_section_idx on items(section_id, position);

create table comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  name text not null,
  body_html text not null default '',
  comment_type text,           -- info | limit | defect (raw value kept)
  severity integer,            -- raw -1 / 0 / 1, null when blank
  answer_type text,            -- boolean | checkbox | date | number | range | text
  choices text[] not null default '{}',
  unit_options text[] not null default '{}',
  recommendation text,
  position integer not null,
  extra jsonb not null default '{}'::jsonb  -- defaults, estimates, photos, unknown columns, source row/order
);
create index comments_item_idx on comments(item_id, position);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  filename text not null,
  file_sha256 text not null,
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table import_issues (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs(id) on delete cascade,
  sheet text,
  row integer not null,        -- row number in the source spreadsheet
  "column" text,
  severity text not null check (severity in ('skipped', 'unsupported', 'warning')),
  reason text not null,
  raw_content text
);
create index import_issues_run_idx on import_issues(import_run_id, row);

-- v1 has no user auth. RLS is enabled with no policies so the anon key can read/write nothing;
-- the app talks to Postgres only through the service-role key on the server.
alter table templates enable row level security;
alter table sections enable row level security;
alter table items enable row level security;
alter table comments enable row level security;
alter table import_runs enable row level security;
alter table import_issues enable row level security;

-- Atomic import: p = { name, source_filename, source_template_name, sections: [...],
--                      run: { filename, file_sha256, counts, issues: [...] } }
create or replace function import_template(p jsonb) returns uuid
language plpgsql as $$
declare
  tid uuid; sid uuid; iid uuid; rid uuid;
  s jsonb; i jsonb; c jsonb; si int := 0; ii int;
begin
  insert into templates(name, source_filename, source_template_name)
  values (p->>'name', p->>'source_filename', p->>'source_template_name') returning id into tid;

  for s in select * from jsonb_array_elements(p->'sections') loop
    insert into sections(template_id, name, position) values (tid, s->>'name', si) returning id into sid;
    si := si + 1; ii := 0;
    for i in select * from jsonb_array_elements(s->'items') loop
      insert into items(section_id, name, position) values (sid, i->>'name', ii) returning id into iid;
      ii := ii + 1;
      for c in select * from jsonb_array_elements(i->'comments') loop
        insert into comments(item_id, name, body_html, comment_type, severity, answer_type,
                             choices, unit_options, recommendation, position, extra)
        values (iid, c->>'name', coalesce(c->>'body_html', ''), c->>'comment_type', (c->>'severity')::int,
                c->>'answer_type',
                coalesce(array(select jsonb_array_elements_text(c->'choices')), '{}'),
                coalesce(array(select jsonb_array_elements_text(c->'unit_options')), '{}'),
                c->>'recommendation', (c->>'position')::int, coalesce(c->'extra', '{}'));
      end loop;
    end loop;
  end loop;

  insert into import_runs(template_id, filename, file_sha256, counts)
  values (tid, p->'run'->>'filename', p->'run'->>'file_sha256', coalesce(p->'run'->'counts', '{}'))
  returning id into rid;

  insert into import_issues(import_run_id, sheet, row, "column", severity, reason, raw_content)
  select rid, x->>'sheet', (x->>'row')::int, x->>'column', x->>'severity', x->>'reason', x->>'raw_content'
  from jsonb_array_elements(coalesce(p->'run'->'issues', '[]')) x;

  return tid;
end $$;

-- Deep clone in one transaction: new UUIDs everywhere, nothing shared with the original.
create or replace function copy_template(src uuid, new_name text) returns uuid
language plpgsql as $$
declare
  tid uuid; s record; i record; sid uuid; iid uuid;
begin
  insert into templates(name, source_filename, source_template_name, parent_template_id)
  select new_name, source_filename, source_template_name, id from templates where id = src
  returning id into tid;
  if tid is null then raise exception 'template % not found', src; end if;

  for s in select * from sections where template_id = src order by position loop
    insert into sections(template_id, name, position) values (tid, s.name, s.position) returning id into sid;
    for i in select * from items where section_id = s.id order by position loop
      insert into items(section_id, name, position) values (sid, i.name, i.position) returning id into iid;
      insert into comments(item_id, name, body_html, comment_type, severity, answer_type,
                           choices, unit_options, recommendation, position, extra)
      select iid, name, body_html, comment_type, severity, answer_type,
             choices, unit_options, recommendation, position, extra
      from comments where item_id = i.id;
    end loop;
  end loop;
  return tid;
end $$;

-- Demo reset: wipes everything (used by scripts/seed.ts and the "reset demo" action).
create or replace function reset_demo() returns void
language sql as $$ truncate templates, import_runs restart identity cascade; $$;
