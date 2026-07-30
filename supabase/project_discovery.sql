-- Project discovery staging.
-- Run after ostlanken_intelligence.sql and portal_setup.sql.
-- The discovery agent writes candidates here; nothing is published to
-- european_projects until an administrator reviews and approves it.

create extension if not exists pgcrypto;

create table if not exists public.project_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  canonical_url text not null unique,
  source_key text not null,
  source_owner text not null,
  country_hint text,
  discovered_from_url text,
  title text not null,
  description text,
  source_excerpt text,
  content_sha256 text,
  heuristic_score integer not null default 0,
  crawl_depth integer not null default 0,
  is_project boolean,
  confidence numeric(5,4)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_quality text
    check (evidence_quality is null or evidence_quality in ('strong', 'medium', 'weak')),
  rejection_reason text,
  extracted_json jsonb not null default '{}'::jsonb,
  proposed_slug text,
  qualification_status text not null default 'unclassified'
    check (qualification_status in ('unclassified', 'qualified', 'rejected')),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'published')),
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_project_id uuid references public.european_projects(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  first_discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_discovery_review
  on public.project_discovery_candidates (review_status, qualification_status, confidence desc);
create index if not exists idx_project_discovery_source
  on public.project_discovery_candidates (source_key, last_seen_at desc);
create index if not exists idx_project_discovery_run
  on public.project_discovery_candidates (agent_run_id);

drop trigger if exists trg_project_discovery_updated_at
  on public.project_discovery_candidates;
create trigger trg_project_discovery_updated_at
before update on public.project_discovery_candidates
for each row execute procedure public.set_updated_at();

alter table public.project_discovery_candidates enable row level security;

drop policy if exists "service_role_manage_project_discovery"
  on public.project_discovery_candidates;
create policy "service_role_manage_project_discovery"
on public.project_discovery_candidates
for all
to service_role
using (true)
with check (true);

drop policy if exists "admins_read_project_discovery"
  on public.project_discovery_candidates;
create policy "admins_read_project_discovery"
on public.project_discovery_candidates
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

drop policy if exists "admins_review_project_discovery"
  on public.project_discovery_candidates;
create policy "admins_review_project_discovery"
on public.project_discovery_candidates
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

comment on table public.project_discovery_candidates is
  'Official-source project candidates awaiting human review before publication.';
