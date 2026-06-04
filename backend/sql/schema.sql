create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  raw_text text not null,
  parsed_text text,
  created_at timestamptz not null default now()
);

create table if not exists architectures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version integer not null,
  architecture_json jsonb not null,
  mermaid_code text not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  architecture_id uuid not null references architectures(id) on delete cascade,
  user_note text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_requirements_project_id
  on requirements(project_id);

create index if not exists idx_architectures_project_id
  on architectures(project_id);

create index if not exists idx_feedback_architecture_id
  on feedback(architecture_id);
