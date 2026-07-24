-- Run this in Supabase SQL editor.
-- Purpose: minimal multitenant module gating. Admin (Francisco) enables
-- individual tools (modules) per user from the admin panel.

create extension if not exists pgcrypto;

create table if not exists public.modules (
  key text primary key,
  name text not null,
  description text,
  icon text
);

insert into public.modules (key, name, description, icon) values
  ('pipeline', 'Pipeline de Construcción', 'Radar de infraestructura europea', 'chart-bar'),
  ('calculadora', 'Calculadora de Huella de Carbono', 'Cálculo y certificación de huella CO₂', 'calculator'),
  ('diagnostico', 'Diagnóstico Normativo', 'Análisis de cumplimiento normativo europeo', 'search')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon;

create table if not exists public.user_module_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null references public.modules(key),
  enabled boolean not null default true,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  notes text,
  unique (user_id, module_key)
);

create index if not exists idx_user_module_grants_user_id
  on public.user_module_grants (user_id);

alter table public.user_module_grants enable row level security;

drop policy if exists "usuarios ven sus propios grants" on public.user_module_grants;
create policy "usuarios ven sus propios grants"
on public.user_module_grants
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "admins gestionan todos los grants" on public.user_module_grants;
create policy "admins gestionan todos los grants"
on public.user_module_grants
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

-- Modules table is read-only reference data; allow authenticated read.
alter table public.modules enable row level security;

drop policy if exists "modules_select_authenticated" on public.modules;
create policy "modules_select_authenticated"
on public.modules
for select
to authenticated
using (true);
