-- Run this in Supabase SQL editor.
-- Purpose: portal de seguimiento de proyectos de construccion (cliente + admin).

create extension if not exists pgcrypto;

-- Tipo de proyecto (create type no soporta "if not exists" en Postgres).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_proyecto') then
    create type public.tipo_proyecto as enum (
      'obra_nueva',
      'rehabilitacion',
      'mantenimiento',
      'inspeccion'
    );
  end if;
end $$;

-- Proyectos ------------------------------------------------------------------

create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  tipo tipo_proyecto not null,
  ubicacion text,
  cliente_user_id uuid references auth.users(id),
  avance_pct integer not null default 0
    check (avance_pct >= 0 and avance_pct <= 100),
  proximo_hito text,
  fecha_inicio date,
  fecha_prevista_fin date,
  estado text not null default 'activo'
    check (estado in ('activo', 'pausado', 'completado')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proyectos_cliente_user_id
  on public.proyectos (cliente_user_id);

alter table public.proyectos enable row level security;

drop policy if exists "cliente ve sus proyectos" on public.proyectos;
create policy "cliente ve sus proyectos"
on public.proyectos
for select
to authenticated
using (auth.uid() = cliente_user_id);

drop policy if exists "admin gestiona proyectos" on public.proyectos;
create policy "admin gestiona proyectos"
on public.proyectos
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  )
);

-- Documentos del proyecto -----------------------------------------------------

create table if not exists public.proyecto_documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null
    references public.proyectos(id) on delete cascade,
  nombre text not null,
  categoria text not null
    check (categoria in (
      'informe', 'factura', 'plano', 'foto',
      'checklist', 'contrato', 'otro'
    )),
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  descripcion text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_proyecto_documentos_proyecto_id
  on public.proyecto_documentos (proyecto_id);

alter table public.proyecto_documentos enable row level security;

drop policy if exists "cliente ve documentos de sus proyectos" on public.proyecto_documentos;
create policy "cliente ve documentos de sus proyectos"
on public.proyecto_documentos
for select
to authenticated
using (
  exists (
    select 1 from public.proyectos p
    where p.id = proyecto_id
      and p.cliente_user_id = auth.uid()
  )
);

drop policy if exists "admin gestiona documentos" on public.proyecto_documentos;
create policy "admin gestiona documentos"
on public.proyecto_documentos
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  )
);

-- Tareas del checklist ---------------------------------------------------------

create table if not exists public.proyecto_tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null
    references public.proyectos(id) on delete cascade,
  titulo text not null,
  descripcion text,
  requiere_aprobacion_cliente boolean default false,
  aprobada_por uuid references auth.users(id),
  aprobada_at timestamptz,
  estado text not null default 'pendiente'
    check (estado in (
      'pendiente', 'en_progreso',
      'completada', 'aprobada'
    )),
  created_at timestamptz not null default now()
);

create index if not exists idx_proyecto_tareas_proyecto_id
  on public.proyecto_tareas (proyecto_id);

alter table public.proyecto_tareas enable row level security;

drop policy if exists "cliente ve tareas de sus proyectos" on public.proyecto_tareas;
create policy "cliente ve tareas de sus proyectos"
on public.proyecto_tareas
for select
to authenticated
using (
  exists (
    select 1 from public.proyectos p
    where p.id = proyecto_id
      and p.cliente_user_id = auth.uid()
  )
);

-- Nota: esta policy es una capa de defensa adicional. La aprobacion real de
-- tareas pasa por el endpoint PATCH /api/v1/proyectos/{id}/tareas/{tarea_id},
-- que valida en Python que solo se cambie "estado" y solo si
-- requiere_aprobacion_cliente = true, usando el service key (bypassa RLS).
-- La policy no puede restringir columnas por si sola dentro de una misma fila.
drop policy if exists "cliente aprueba sus tareas" on public.proyecto_tareas;
create policy "cliente aprueba sus tareas"
on public.proyecto_tareas
for update
to authenticated
using (
  exists (
    select 1 from public.proyectos p
    where p.id = proyecto_id
      and p.cliente_user_id = auth.uid()
  )
)
with check (estado = 'aprobada');

drop policy if exists "admin gestiona tareas" on public.proyecto_tareas;
create policy "admin gestiona tareas"
on public.proyecto_tareas
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  )
);

-- Notas e hitos del proyecto -----------------------------------------------------

create table if not exists public.proyecto_notas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null
    references public.proyectos(id) on delete cascade,
  texto text not null,
  visible_cliente boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_proyecto_notas_proyecto_id
  on public.proyecto_notas (proyecto_id);

alter table public.proyecto_notas enable row level security;

drop policy if exists "cliente ve notas visibles" on public.proyecto_notas;
create policy "cliente ve notas visibles"
on public.proyecto_notas
for select
to authenticated
using (
  visible_cliente = true
  and exists (
    select 1 from public.proyectos p
    where p.id = proyecto_id
      and p.cliente_user_id = auth.uid()
  )
);

drop policy if exists "admin gestiona notas" on public.proyecto_notas;
create policy "admin gestiona notas"
on public.proyecto_notas
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  )
);

-- Modulo "proyectos" en el catalogo (requiere supabase/multitenant_modules.sql) ---

insert into public.modules (key, name, description, icon) values
  ('proyectos', 'Portal de Proyectos', 'Seguimiento de obras y mantenimiento', 'building')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon;

-- Storage: bucket privado "proyectos" -------------------------------------------
-- Estructura de objeto dentro del bucket: {proyecto_id}/{categoria}/{archivo}
-- (el nombre del bucket "proyectos" NO va dentro del path del objeto).

insert into storage.buckets (id, name, public)
values ('proyectos', 'proyectos', false)
on conflict (id) do nothing;

drop policy if exists "cliente accede a sus archivos" on storage.objects;
create policy "cliente accede a sus archivos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'proyectos'
  and exists (
    select 1 from public.proyectos p
    where p.cliente_user_id = auth.uid()
      and (storage.foldername(name))[1] = p.id::text
  )
);

drop policy if exists "admin gestiona archivos" on storage.objects;
create policy "admin gestiona archivos"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'proyectos'
  and exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  )
);
