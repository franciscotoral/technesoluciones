-- Ostlanken Intelligence System schema for Supabase
-- Run this script in Supabase SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.licitaciones (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  titulo text not null,
  descripcion text,
  organismo text not null default 'Trafikverket',
  tramo text,
  estado text not null default 'abierta',
  valor_estimado_sek numeric(18,2),
  moneda text not null default 'SEK',
  fecha_publicacion date,
  fecha_limite date,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_licitaciones_estado on public.licitaciones (estado);
create index if not exists idx_licitaciones_tramo on public.licitaciones (tramo);
create index if not exists idx_licitaciones_fecha_publicacion on public.licitaciones (fecha_publicacion desc);
create index if not exists idx_licitaciones_tsv_sv on public.licitaciones
  using gin (to_tsvector('swedish', coalesce(titulo, '') || ' ' || coalesce(descripcion, '')));

drop trigger if exists trg_licitaciones_updated_at on public.licitaciones;
create trigger trg_licitaciones_updated_at
before update on public.licitaciones
for each row execute procedure public.set_updated_at();

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid references public.licitaciones(id) on delete set null,
  external_id text unique,
  nombre text not null,
  adjudicatario text,
  tramo text,
  estado text not null default 'activo',
  importe_sek numeric(18,2),
  fecha_inicio date,
  fecha_fin date,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contratos_estado on public.contratos (estado);
create index if not exists idx_contratos_tramo on public.contratos (tramo);

drop trigger if exists trg_contratos_updated_at on public.contratos;
create trigger trg_contratos_updated_at
before update on public.contratos
for each row execute procedure public.set_updated_at();

create table if not exists public.noticias (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  titulo text not null,
  resumen text,
  contenido text,
  fuente text not null,
  url text not null,
  fecha_publicacion timestamptz,
  relevance_score numeric(4,2) not null default 0,
  sentiment text,
  categorias text[] not null default '{}',
  actores text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_noticias_relevance_score on public.noticias (relevance_score desc);
create index if not exists idx_noticias_fecha_publicacion on public.noticias (fecha_publicacion desc);
create index if not exists idx_noticias_tsv_sv on public.noticias
  using gin (to_tsvector('swedish', coalesce(titulo, '') || ' ' || coalesce(resumen, '') || ' ' || coalesce(contenido, '')));

drop trigger if exists trg_noticias_updated_at on public.noticias;
create trigger trg_noticias_updated_at
before update on public.noticias
for each row execute procedure public.set_updated_at();

create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  descripcion text,
  analisis text not null,
  prioridad text not null default 'media',
  score numeric(4,2) not null default 0,
  estado text not null default 'nueva',
  tramo text,
  actores text[] not null default '{}',
  licitacion_id uuid references public.licitaciones(id) on delete set null,
  noticia_id uuid references public.noticias(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oportunidades_tipo on public.oportunidades (tipo);
create index if not exists idx_oportunidades_prioridad on public.oportunidades (prioridad);
create index if not exists idx_oportunidades_score on public.oportunidades (score desc);

drop trigger if exists trg_oportunidades_updated_at on public.oportunidades;
create trigger trg_oportunidades_updated_at
before update on public.oportunidades
for each row execute procedure public.set_updated_at();

create table if not exists public.actores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null,
  descripcion text,
  importancia numeric(4,2) not null default 5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_actores_tipo on public.actores (tipo);
create index if not exists idx_actores_importancia on public.actores (importancia desc);

drop trigger if exists trg_actores_updated_at on public.actores;
create trigger trg_actores_updated_at
before update on public.actores
for each row execute procedure public.set_updated_at();

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_started_at on public.agent_runs (started_at desc);
create index if not exists idx_agent_runs_status on public.agent_runs (status);

drop trigger if exists trg_agent_runs_updated_at on public.agent_runs;
create trigger trg_agent_runs_updated_at
before update on public.agent_runs
for each row execute procedure public.set_updated_at();

create table if not exists public.cambios (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  registro_id uuid,
  tipo_cambio text not null,
  diff jsonb not null default '{}'::jsonb,
  observado_en timestamptz not null default now(),
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cambios_tabla on public.cambios (tabla);
create index if not exists idx_cambios_observado_en on public.cambios (observado_en desc);
create index if not exists idx_cambios_agent_run_id on public.cambios (agent_run_id);

drop trigger if exists trg_cambios_updated_at on public.cambios;
create trigger trg_cambios_updated_at
before update on public.cambios
for each row execute procedure public.set_updated_at();

alter table public.licitaciones enable row level security;
alter table public.contratos enable row level security;
alter table public.noticias enable row level security;
alter table public.oportunidades enable row level security;
alter table public.actores enable row level security;
alter table public.agent_runs enable row level security;
alter table public.cambios enable row level security;

drop policy if exists "anon_read_licitaciones" on public.licitaciones;
create policy "anon_read_licitaciones"
on public.licitaciones
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_licitaciones" on public.licitaciones;
create policy "service_role_write_licitaciones"
on public.licitaciones
for all
to service_role
using (true)
with check (true);

drop policy if exists "anon_read_contratos" on public.contratos;
create policy "anon_read_contratos"
on public.contratos
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_contratos" on public.contratos;
create policy "service_role_write_contratos"
on public.contratos
for all
to service_role
using (true)
with check (true);

drop policy if exists "anon_read_noticias" on public.noticias;
create policy "anon_read_noticias"
on public.noticias
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_noticias" on public.noticias;
create policy "service_role_write_noticias"
on public.noticias
for all
to service_role
using (true)
with check (true);

drop policy if exists "anon_read_oportunidades" on public.oportunidades;
create policy "anon_read_oportunidades"
on public.oportunidades
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_oportunidades" on public.oportunidades;
create policy "service_role_write_oportunidades"
on public.oportunidades
for all
to service_role
using (true)
with check (true);

drop policy if exists "anon_read_actores" on public.actores;
create policy "anon_read_actores"
on public.actores
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_actores" on public.actores;
create policy "service_role_write_actores"
on public.actores
for all
to service_role
using (true)
with check (true);

drop policy if exists "anon_read_agent_runs" on public.agent_runs;
create policy "anon_read_agent_runs"
on public.agent_runs
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_agent_runs" on public.agent_runs;
create policy "service_role_write_agent_runs"
on public.agent_runs
for all
to service_role
using (true)
with check (true);

drop policy if exists "anon_read_cambios" on public.cambios;
create policy "anon_read_cambios"
on public.cambios
for select
to anon, authenticated
using (true);

drop policy if exists "service_role_write_cambios" on public.cambios;
create policy "service_role_write_cambios"
on public.cambios
for all
to service_role
using (true)
with check (true);
