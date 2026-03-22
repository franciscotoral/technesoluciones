-- European projects portfolio for /projects dashboard
-- Run after ostlanken_intelligence.sql

create table if not exists public.european_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null,
  city text not null,
  infrastructure_type text not null,
  status text not null,
  budget_eur_m numeric(18,2) not null default 0,
  timeframe text not null,
  summary text not null,
  route text not null,
  client text not null,
  key_focus text[] not null default '{}',
  required_services text[] not null default '{}',
  official_source_url text,
  source_owner text,
  source_last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.european_projects
add column if not exists required_services text[] not null default '{}';
alter table public.european_projects
add column if not exists official_source_url text;
alter table public.european_projects
add column if not exists source_owner text;
alter table public.european_projects
add column if not exists source_last_checked_at timestamptz;

create index if not exists idx_european_projects_country on public.european_projects (country);
create index if not exists idx_european_projects_infrastructure_type on public.european_projects (infrastructure_type);
create index if not exists idx_european_projects_status on public.european_projects (status);

drop trigger if exists trg_european_projects_updated_at on public.european_projects;
create trigger trg_european_projects_updated_at
before update on public.european_projects
for each row execute procedure public.set_updated_at();

alter table public.european_projects enable row level security;

drop policy if exists "anon_read_european_projects" on public.european_projects;
create policy "anon_read_european_projects"
on public.european_projects
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_european_projects" on public.european_projects;
create policy "service_role_write_european_projects"
on public.european_projects
for all
to service_role
using (true)
with check (true);

insert into public.european_projects (
  slug, name, country, city, infrastructure_type, status, budget_eur_m, timeframe, summary, route, client, key_focus, required_services
)
values
  (
    'ostlanken-intelligence',
    'Ostlanken Intelligence System',
    'Sweden',
    'Stockholm - Linkoping',
    'Ferroviario',
    'Monitoring',
    2400,
    '2026-2033',
    'Market intelligence and opportunity monitoring for Trafikverket procurement, contracts and ecosystem actors.',
    '/ostlanken',
    'Trafikverket ecosystem',
    array['Business intelligence', 'Procurement radar', 'AI opportunity scoring'],
    array['BIM requerido']
  ),
  (
    'barcelona-health-campus',
    'Barcelona Health Campus Expansion',
    'Spain',
    'Barcelona',
    'Hospitalario',
    'Pipeline',
    540,
    '2027-2030',
    'Hospital campus expansion with BIM governance, compliance coordination and phased commissioning controls.',
    '/projects/barcelona-health-campus',
    'Regional health partnership',
    array['BIM governance', 'Compliance strategy', 'Commissioning QA'],
    array['CE-Marking', 'BIM requerido']
  ),
  (
    'rhine-bridges-upgrade',
    'Rhine Bridges Upgrade Program',
    'Germany',
    'Cologne',
    'Puentes',
    'Tendering',
    980,
    '2026-2030',
    'Bridge reinforcement and structural health monitoring package for Rhine corridor assets.',
    '/projects/rhine-bridges-upgrade',
    'Regional transport authority',
    array['Structural diagnostics', 'Asset monitoring', 'Maintenance planning'],
    array['Due Diligence']
  ),
  (
    'iberian-grid-flex',
    'Iberian Grid Flex Nodes',
    'Spain',
    'Zaragoza',
    'Energetico',
    'Pipeline',
    410,
    '2026-2028',
    'Substation modernization and grid flexibility nodes tied to industrial demand growth.',
    '/projects/iberian-grid-flex',
    'Private utility consortium',
    array['Power systems QA', 'Cost engineering', 'Industrial integration'],
    array['CE-Marking', 'Due Diligence']
  ),
  (
    'copenhagen-port-automation',
    'Copenhagen Port Automation',
    'Denmark',
    'Copenhagen',
    'Portuario',
    'Tendering',
    355,
    '2026-2029',
    'Terminal automation program with digital twins, operational analytics and contractor coordination.',
    '/projects/copenhagen-port-automation',
    'Port authority',
    array['Digital twin', 'Operations BI', 'Contractor coordination'],
    array['BIM requerido']
  )
on conflict (slug) do update
set
  name = excluded.name,
  country = excluded.country,
  city = excluded.city,
  infrastructure_type = excluded.infrastructure_type,
  status = excluded.status,
  budget_eur_m = excluded.budget_eur_m,
  timeframe = excluded.timeframe,
  summary = excluded.summary,
  route = excluded.route,
  client = excluded.client,
  key_focus = excluded.key_focus,
  required_services = excluded.required_services;
