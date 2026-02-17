-- Run this in Supabase SQL editor.
-- Purpose: personalized portal data per authenticated user.

create extension if not exists pgcrypto;

create table if not exists public.investment_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_key text not null,
  metric_label text not null,
  metric_value numeric(14,2) not null default 0,
  currency text default 'EUR',
  trend_pct numeric(6,2),
  as_of date default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_investment_metrics_user_id
  on public.investment_metrics (user_id);

create table if not exists public.private_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  budget numeric(14,2),
  progress_pct numeric(5,2),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_private_projects_user_id
  on public.private_projects (user_id);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.investment_metrics enable row level security;
alter table public.private_projects enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "metrics_select_own" on public.investment_metrics;
create policy "metrics_select_own"
on public.investment_metrics
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "projects_select_own" on public.private_projects;
create policy "projects_select_own"
on public.private_projects
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "metrics_select_admin" on public.investment_metrics;
create policy "metrics_select_admin"
on public.investment_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

drop policy if exists "projects_select_admin" on public.private_projects;
create policy "projects_select_admin"
on public.private_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

drop policy if exists "metrics_insert_admin" on public.investment_metrics;
create policy "metrics_insert_admin"
on public.investment_metrics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

drop policy if exists "projects_insert_admin" on public.private_projects;
create policy "projects_insert_admin"
on public.private_projects
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

-- Sample seed. Replace USER_UUID with a real auth user id.
-- insert into public.investment_metrics (user_id, metric_key, metric_label, metric_value, currency, trend_pct)
-- values
--   ('USER_UUID', 'irr', 'IRR objetivo', 18.4, 'EUR', 1.2),
--   ('USER_UUID', 'npv', 'NPV estimado', 420000, 'EUR', -0.8),
--   ('USER_UUID', 'cashflow', 'Flujo anual', 135000, 'EUR', 2.1);
--
-- insert into public.private_projects (user_id, name, status, budget, progress_pct)
-- values
--   ('USER_UUID', 'Nave industrial Valencia', 'active', 900000, 62.5),
--   ('USER_UUID', 'Rehabilitacion centro logistico', 'planning', 450000, 18.0);
--
-- Add admin user:
-- insert into public.admin_users (user_id) values ('ADMIN_USER_UUID');
