# Arquitectura actual y plan multitenant de Techne Soluciones

> Auditoría técnica del repositorio a 23 de julio de 2026. Este documento describe lo que existe en el código, diferencia lo operativo de lo simulado y propone la arquitectura necesaria para administrar usuarios, organizaciones y accesos a la calculadora de huella de carbono, el buscador de proyectos de construcción y el diagnóstico normativo.

## 1. Resumen ejecutivo

El proyecto es actualmente un monorepo informal con cinco piezas:

1. Una SPA Angular 20 que contiene la web pública, autenticación, portal privado, administración, buscador de proyectos y diagnóstico normativo.
2. Una SPA React 19/Vite independiente para la calculadora de huella de carbono.
3. Un backend FastAPI monolítico en `backend/app/main.py`.
4. Supabase como proveedor de identidad, API PostgREST, PostgreSQL y Realtime.
5. Un agente Python batch que obtiene inteligencia de fuentes públicas, la estructura mediante Anthropic y la escribe en Supabase.

La autenticación de usuarios con Supabase existe, pero no hay todavía un modelo multitenant coherente. El aislamiento actual del portal se hace directamente por `user_id`; los datos de proyectos europeos y Ostlanken son públicos; el backend FastAPI acepta cualquier cadena con prefijo `Bearer` en las rutas administrativas; y las rutas de diagnóstico son anónimas.

La calculadora React tiene el frontend y el contrato esperado de cuatro endpoints, pero **el repositorio no contiene su implementación backend**. Por tanto, la calculadora compila, pero el flujo completo no puede considerarse operativo con este checkout:

- `GET /api/hcc/me`
- `POST /api/hcc/calcular`
- `POST /api/hcc/extraer-dap`
- `POST /api/hcc/informe`

La arquitectura recomendada mantiene Supabase Auth, usa PostgreSQL compartido con `tenant_id` y Row Level Security (RLS), valida los JWT también en FastAPI y separa:

- identidad global;
- pertenencia y rol dentro de una organización;
- acceso a módulos;
- permisos sobre recursos;
- propiedad y trazabilidad de cada ejecución.

## 2. Alcance y método de revisión

Se han revisado:

- configuración y rutas de Angular;
- servicios de autenticación, portal, administración, proyectos y Ostlanken;
- aplicación React de la calculadora;
- endpoints y modelos de FastAPI;
- migraciones SQL de Supabase y sus políticas RLS;
- agente Python de ingesta y clasificación;
- configuración de compilación y despliegue;
- historial reciente de Git para comprobar si el backend HCC estaba versionado.

No se ha inspeccionado el contenido de secretos locales. Tampoco se ha validado el estado remoto real de Supabase ni del VPS, por lo que el documento describe el repositorio y sus contratos, no garantiza que la base de datos desplegada coincida con los SQL versionados.

## 3. Mapa del repositorio

```text
technesoluciones/
├── src/                              # Aplicación Angular principal
│   ├── app/pages/
│   │   ├── diagnostico/              # UI y cliente del diagnóstico
│   │   ├── projects-dashboard/       # Buscador/portfolio europeo
│   │   ├── project-detail/
│   │   └── ostlanken-dashboard/      # Inteligencia ferroviaria
│   ├── app/services/
│   │   ├── projects.service.ts
│   │   └── ostlanken.service.ts
│   ├── components/
│   │   ├── login/
│   │   ├── portal/
│   │   └── admin/
│   ├── guards/                       # authGuard y adminGuard
│   └── services/                     # Auth, Admin, Portal, Chat
├── calculadora-huella/               # SPA React/Vite independiente
│   └── src/App.jsx
├── backend/
│   ├── app/main.py                   # Todo el API FastAPI existente
│   └── deploy/                       # nginx + systemd
├── supabase/
│   ├── portal_setup.sql
│   ├── european_projects.sql
│   └── ostlanken_intelligence.sql
├── agent/
│   ├── agent.py                      # ETL/IA batch
│   └── portfolio_sources.json
├── scripts/prerender-copy.mjs
└── index.html                        # Configuración pública en runtime
```

## 4. Arquitectura actual

```text
Navegador
├── Angular SPA
│   ├── Supabase Auth REST ───────────────► Supabase Auth
│   ├── PostgREST + JWT ──────────────────► Supabase/PostgreSQL/RLS
│   └── /api/diagnostico, /lead, /chat ───► FastAPI
└── React HCC (/calculadora/)
    └── /api/hcc/* ───────────────────────► Contrato sin implementación versionada

Agente Python
├── Fuentes web oficiales y medios
├── Anthropic
└── service role ─────────────────────────► Supabase/PostgreSQL

nginx
├── /             ─► dist Angular
└── /api/*        ─► FastAPI 127.0.0.1:8000
```

### 4.1 Frontend Angular

Rutas relevantes:

| Ruta | Función | Protección actual |
|---|---|---|
| `/login` | Login Supabase email/contraseña | Pública |
| `/portal` | Portal personalizado | `authGuard` |
| `/admin` | Métricas/proyectos y panel API | `adminGuard` mediante tabla `admin_users` |
| `/projects` | Portfolio/buscador europeo | Pública |
| `/projects/:slug` | Detalle de proyecto | Pública |
| `/ostlanken` | Dashboard de inteligencia | Pública |
| `/diagnostico` | Diagnóstico normativo IA | Pública |

El guardado de rutas sólo protege la navegación del frontend. La autorización efectiva debe estar siempre en PostgreSQL/RLS o FastAPI.

### 4.2 Autenticación actual

`AuthService` llama directamente a:

```http
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
apikey: {SUPABASE_ANON_KEY}
```

La sesión se guarda completa en `localStorage` bajo `techne_auth_session`:

- access token;
- refresh token;
- expiración;
- UUID y email del usuario.

Limitaciones:

- no existe refresco automático del access token;
- no se llama al logout remoto de Supabase;
- Angular y React duplican la lectura de la sesión;
- almacenar el refresh token en `localStorage` aumenta el impacto de un XSS;
- se confía en la expiración local sin validar revocación;
- no existe selección de organización activa;
- no se cargan membresías, roles ni permisos;
- la anon key y URL de Supabase son correctamente públicas, pero la configuración de `adminApiBaseUrl` está fijada a localhost en `index.html`.

### 4.3 Backend FastAPI

Todo el backend está concentrado en un único archivo. Las familias de endpoints existentes son:

| Familia | Persistencia | Autorización |
|---|---|---|
| `/health` | Ninguna | Pública |
| `/admin/tenants/*` | Listas/diccionarios en memoria | Sólo comprueba que el header empieza por `Bearer ` |
| `/api/diagnostico` | No persiste el resultado | Pública |
| `/api/lead` | Supabase opcional | Pública |
| `/api/chat` | No persiste | Pública |

La implementación administrativa es un prototipo:

- los tenants, fuentes, pipelines y modelos se pierden al reiniciar;
- el token no se valida criptográficamente;
- no se identifica al usuario;
- no se comprueba rol ni pertenencia al tenant solicitado;
- un token inventado como `Bearer cualquier-cosa` supera el control;
- las credenciales recibidas de una fuente de datos no se guardan, aunque se devuelve un `secret_ref`;
- ejecutar pipelines o entrenar modelos sólo crea filas simuladas en memoria;
- CORS permite cualquier origen con credenciales;
- no hay rate limiting, idempotencia, auditoría ni jobs reales.

### 4.4 Supabase/PostgreSQL

Hay tres esquemas SQL funcionales:

1. `portal_setup.sql`: métricas y proyectos privados asociados directamente a `auth.users.id`.
2. `european_projects.sql`: portfolio europeo público.
3. `ostlanken_intelligence.sql`: licitaciones, contratos, noticias, oportunidades, actores, ejecuciones del agente y cambios; toda la lectura es pública.

El portal sí aplica RLS por usuario:

```sql
using (auth.uid() = user_id)
```

Los administradores se modelan mediante una tabla global `admin_users`. Esto permite administración global, pero no delegación por organización ni roles diferentes.

### 4.5 Agente de proyectos

`agent/agent.py` es un proceso independiente que:

1. registra una ejecución en `agent_runs`;
2. obtiene licitaciones y noticias;
3. clasifica y puntúa contenido mediante Anthropic;
4. genera oportunidades;
5. visita fuentes oficiales configuradas en `portfolio_sources.json`;
6. normaliza y hace `upsert` de `european_projects`;
7. registra cambios;
8. finaliza la ejecución con estadísticas o error.

Usa credenciales de servicio y, por diseño, elude RLS. Puede ejecutarse una vez o semanalmente. No es un backend interactivo ni existe cola de trabajos. Los datos producidos no contienen `tenant_id`.

## 5. Revisión por servicio

### 5.1 Calculadora de huella de carbono

#### Frontend existente

La SPA React calcula ventanas a partir de:

- ancho, alto, número de hojas y cajón de persiana;
- componentes: perfil, vidrio, herrajes y cajón;
- GWP por kg, metro lineal, m² o unidad;
- horas de taller;
- distancia de transporte;
- madera, film y cartón de embalaje.

También mantiene un cálculo preliminar local con estos factores:

| Factor | Valor codificado |
|---|---:|
| Taller | 1,575 |
| Transporte | 0,012 |
| Madera | 0,45 |
| Film | 2,5 |
| Cartón | 0,9 |

El resultado pretende separar A1-A3, proceso y total agregado. La UI permite subir DAP en PDF, extraer GWP con IA y descargar un informe PDF corporativo.

#### Contrato backend esperado

`POST /api/hcc/calcular`

```json
{
  "ancho_m": 1.2,
  "alto_m": 1.5,
  "hojas": 2,
  "cajon_persiana": true,
  "componentes": [
    {
      "nombre": "Perfil",
      "tipo": "perfil",
      "gwp_valor": 8.4,
      "gwp_unidad": "kg_m",
      "peso_kg": null,
      "cantidad": null
    }
  ],
  "proceso": {
    "horas_taller_m2": 0.6,
    "distancia_km": 150,
    "madera_kg_m2": 1.4,
    "film_kg_m2": 0.2,
    "carton_kg_m2": 0.5
  }
}
```

La UI espera una respuesta con:

```json
{
  "a1a3": {
    "desglose": {},
    "total_kg": 0,
    "total_kg_m2": 0
  },
  "proceso": {
    "desglose": {
      "ensamblaje": 0,
      "transporte_componentes": 0,
      "embalaje": 0
    },
    "total_kg": 0
  },
  "agregado": {
    "total_kg": 0
  }
}
```

`POST /api/hcc/extraer-dap` recibe multipart con campo `archivo` y espera GWP, unidad, página, confianza, validación, producto, proveedor y programa.

`POST /api/hcc/informe` recibe cálculo, empresa, producto y fuentes, y espera un PDF descargable.

`GET /api/hcc/me` se usa desde el portal para decidir si el usuario puede ver/abrir la herramienta.

#### Estado real y brechas

- Ninguno de los cuatro endpoints está implementado en `backend/app/main.py`.
- No existe tabla para cálculos, componentes, DAP, informes ni factores.
- El frontend sólo exige una sesión Supabase local; el servidor aún no puede verificarla.
- Los factores están codificados en el cliente, sin versión, fuente, vigencia ni tenant.
- No existe propiedad del cálculo ni historial por usuario/organización.
- Los PDFs no tienen política de tamaño, MIME real, antivirus, retención ni almacenamiento privado.
- La extracción IA no tiene trazabilidad del modelo/prompt ni revisión humana persistida.
- La UI calcula localmente y luego solicita cálculo servidor; debe definirse al servidor como fuente de verdad.

Conclusión: hay una UI avanzada y un contrato claro, pero no un backend HCC funcional dentro del repositorio.

### 5.2 Buscador de proyectos de construcción

El “buscador” tiene dos niveles:

#### Portfolio europeo

`ProjectsService` lee `european_projects` directamente desde Supabase con anon key. Si falta configuración o Supabase devuelve error, usa `src/data/european-projects.data.ts`. Después mezcla remoto y fallback por `slug`.

Características:

- lectura pública;
- filtro en cliente por país y tipología;
- países permitidos codificados: España, Suecia, Alemania y Dinamarca;
- detalle por slug;
- fuentes oficiales y fecha de última comprobación;
- escritura reservada a `service_role`;
- alimentación automática por el agente.

Brechas:

- los errores remotos quedan ocultos por el fallback;
- no hay indicador inequívoco de dato remoto frente a fallback;
- no hay paginación ni búsqueda full-text del lado servidor;
- los filtros de país están codificados en UI;
- la mezcla puede mostrar elementos estáticos desactualizados;
- todo es público y común a todos los clientes;
- no hay favoritos, notas, asignaciones o watchlists por tenant;
- el agente usa LLM y fallbacks, por lo que debería persistir nivel de confianza y revisión.

#### Ostlanken Intelligence

El dashboard consulta directamente tablas Supabase y se suscribe a Realtime. Permite filtrar licitaciones, noticias y oportunidades. Sus tablas tienen lectura anónima global, incluyendo `agent_runs` y `cambios`.

Brechas:

- se exponen públicamente oportunidades y trazas internas del agente;
- no existe partición por cliente;
- la API del navegador queda acoplada al esquema físico;
- la búsqueda y paginación son limitadas;
- no hay autorización para señales premium o anotaciones;
- no hay proceso de publicación: el dato ingerido pasa directamente a lectura pública.

### 5.3 Diagnóstico normativo

#### Flujo existente

1. Angular recoge empresa, sector, país, actividad, empleados, certificaciones, estado documental, urgencia, problemas y contexto.
2. `POST /api/diagnostico` construye un prompt con normativa nacional codificada.
3. Anthropic debe devolver exclusivamente JSON.
4. FastAPI limpia un posible bloque Markdown y parsea la respuesta.
5. La UI muestra normas, brechas, resumen, flujo, precio, retainer y posible vía EAD.
6. `POST /api/lead` guarda email, formulario y diagnóstico en `diagnostico_leads` si existen credenciales Supabase de servicio.

#### Brechas funcionales y de seguridad

- endpoint anónimo sin rate limit: riesgo directo de abuso y coste de IA;
- no se valida tenant ni usuario;
- no se persiste la ejecución salvo que el usuario envíe el lead;
- `/api/lead` responde `ok: true` aunque Supabase no esté configurado y no guarde nada;
- no se valida formato de email con tipo `EmailStr`;
- los modelos usan listas y diccionarios como valores por defecto mutables;
- la respuesta del LLM no se valida contra el esquema antes de construir la respuesta;
- la excepción sólo contempla JSON inválido, no errores de red, timeout, cuota o contenido vacío;
- hay `print` de datos potencialmente sensibles;
- normativa y prompt están embebidos en código sin versión ni fecha de vigencia;
- la regla especial de paneles textiles se aplica a todos los diagnósticos, aunque el caso sea distinto;
- falta aviso claro de que el resultado es orientativo y revisión profesional;
- no hay consentimiento, base legal, política de retención ni minimización documentada para los leads;
- no existe historial, estados de revisión ni asignación a consultor.

## 6. Riesgos prioritarios

| Prioridad | Riesgo | Impacto |
|---|---|---|
| P0 | Los endpoints HCC no existen | La calculadora falla al calcular, extraer, informar y autorizar |
| P0 | `require_bearer` no valida JWT ni permisos | Acceso administrativo trivialmente falsificable |
| P0 | No hay aislamiento tenant en backend ni tablas funcionales | Riesgo de fuga cruzada al incorporar clientes |
| P1 | Diagnóstico anónimo sin rate limit | Abuso, coste y denegación de servicio |
| P1 | Ostlanken y oportunidades tienen lectura anónima | Exposición de inteligencia interna |
| P1 | Sesión y refresh token en `localStorage` | Mayor impacto ante XSS |
| P1 | Leads pueden descartarse silenciosamente | Pérdida comercial y falsa confirmación |
| P1 | CORS `*` con credenciales | Configuración insegura/inconsistente |
| P2 | Datos y factores sin versionado | Resultados no reproducibles ni auditables |
| P2 | Backend monolítico sin tests ni migraciones ordenadas | Alto riesgo de regresión |
| P2 | Configuración local hardcoded | Despliegues propensos a errores |
| P2 | Codificación mojibake visible en varios archivos | Calidad de UI, prompts e informes degradada |

## 7. Modelo multitenant objetivo

### 7.1 Decisión recomendada

Usar una base PostgreSQL compartida, un esquema común y `tenant_id` en toda entidad privada, reforzado mediante:

1. JWT Supabase validado;
2. membresía activa del usuario;
3. RLS en PostgreSQL;
4. autorización explícita en FastAPI;
5. pruebas automáticas de aislamiento.

Este modelo es adecuado para el tamaño actual, reduce operación y permite migrar en el futuro un tenant regulado a una base dedicada.

No debe aceptarse `tenant_id` del cliente como prueba de autorización. El servidor puede recibirlo como selector de contexto, pero debe verificar siempre la membresía.

### 7.2 Conceptos

- **Usuario**: identidad global en `auth.users`.
- **Tenant/organización**: empresa cliente o espacio interno de Techne.
- **Membresía**: relación usuario-organización con estado y rol.
- **Módulo**: `carbon_calculator`, `construction_projects`, `regulatory_diagnostic`, `admin`.
- **Concesión**: habilita un módulo al tenant o excepcionalmente a un usuario.
- **Rol**: agrupa permisos dentro de un tenant.
- **Recurso**: cálculo, DAP, informe, diagnóstico, proyecto guardado, anotación, etc.
- **Actor de servicio**: agente o proceso backend sin identidad humana.

### 7.3 Roles iniciales

| Rol | Alcance |
|---|---|
| `platform_admin` | Administración global Techne; fuera de la jerarquía normal del tenant |
| `tenant_owner` | Configuración, facturación, miembros y todos los módulos del tenant |
| `tenant_admin` | Miembros, accesos y recursos, sin acciones de plataforma |
| `consultant` | Opera diagnósticos/proyectos/cálculos asignados |
| `analyst` | Crea y edita recursos funcionales |
| `viewer` | Sólo lectura |

`platform_admin` debe resolverse mediante claim seguro o tabla no editable desde el cliente, nunca sólo mediante UI.

### 7.4 Permisos recomendados

```text
tenant.read
tenant.manage
members.read
members.manage
access.manage

carbon.read
carbon.calculate
carbon.upload_dap
carbon.generate_report
carbon.manage_factors

projects.read
projects.search
projects.save
projects.annotate
projects.manage_catalog

diagnostic.read
diagnostic.create
diagnostic.review
diagnostic.export
diagnostic.manage_rules

audit.read
```

La autorización final es la intersección de:

```text
membresía activa
AND módulo habilitado para el tenant
AND permiso aportado por el rol
AND regla sobre el recurso (tenant/owner/asignación)
```

## 8. Esquema de datos propuesto

### 8.1 Identidad, tenants y acceso

```sql
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null check (status in ('active','suspended','closed')),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in ('tenant_owner','tenant_admin','consultant','analyst','viewer')
  ),
  status text not null check (status in ('invited','active','suspended')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.modules (
  key text primary key,
  name text not null
);

create table public.tenant_module_grants (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null references public.modules(key),
  enabled boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  limits jsonb not null default '{}',
  primary key (tenant_id, module_key)
);

create table public.user_module_overrides (
  tenant_id uuid not null,
  user_id uuid not null,
  module_key text not null references public.modules(key),
  effect text not null check (effect in ('allow','deny')),
  valid_until timestamptz,
  primary key (tenant_id, user_id, module_key),
  foreign key (tenant_id, user_id)
    references public.tenant_memberships(tenant_id, user_id)
    on delete cascade
);
```

Los overrides por usuario deben ser excepcionales. La regla recomendable es permitir módulos al tenant y controlar acciones mediante rol.

### 8.2 Calculadora HCC

```text
carbon_factor_sets
├── tenant_id nullable (null = catálogo global)
├── name, version, methodology, valid_from, valid_until
└── status: draft/published/retired

carbon_factors
├── factor_set_id
├── code, label, value, unit
├── source_url, source_document_id
└── uncertainty/metadata

carbon_calculations
├── id, tenant_id, created_by
├── company_name, company_tax_id, product_name
├── input_json
├── result_json
├── factor_set_id + factor_set_version
├── methodology_version
└── status, created_at, updated_at

carbon_documents
├── id, tenant_id, uploaded_by
├── storage_path, original_name, mime_type, size_bytes, sha256
├── extraction_json, model, prompt_version
├── review_status, reviewed_by
└── created_at

carbon_reports
├── id, tenant_id, calculation_id
├── storage_path, template_version
├── generated_by, generated_at
└── sha256
```

Los PDFs deben estar en un bucket privado con rutas prefijadas por tenant, por ejemplo:

```text
tenant/{tenant_id}/carbon/dap/{document_id}.pdf
tenant/{tenant_id}/carbon/reports/{report_id}.pdf
```

### 8.3 Proyectos de construcción

Separar el catálogo global de la personalización privada:

```text
construction_projects          # catálogo curado global
project_sources                # fuentes y verificaciones
project_ingestion_runs         # ejecución del agente
project_ingestion_candidates   # staging antes de publicar

tenant_saved_projects
├── tenant_id, project_id
├── saved_by, stage, priority
└── assigned_to, created_at

tenant_project_notes
├── tenant_id, project_id
├── author_id, body
└── visibility, created_at

tenant_project_tags
tenant_project_watch_rules
tenant_project_notifications
```

El catálogo puede ser legible por usuarios autenticados con módulo habilitado. Notas, favoritos, reglas y asignaciones siempre llevan `tenant_id`.

### 8.4 Diagnóstico normativo

```text
regulatory_rule_sets
├── tenant_id nullable
├── jurisdiction, version, effective_from
└── content, status

regulatory_diagnostics
├── id, tenant_id, created_by
├── input_json, result_json
├── model, prompt_version, rule_set_version
├── status: draft/generated/in_review/approved/rejected
├── assigned_to, reviewed_by
└── created_at, updated_at

regulatory_leads
├── id, tenant_id nullable, diagnostic_id
├── email, consent_at, privacy_notice_version
└── status, created_at

regulatory_exports
├── tenant_id, diagnostic_id
├── storage_path, format, generated_by
└── generated_at
```

### 8.5 Auditoría

```sql
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  actor_user_id uuid references auth.users(id),
  actor_type text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id text,
  ip inet,
  user_agent text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
```

No registrar tokens, contraseñas, DAP completos ni datos sensibles innecesarios en logs/auditoría.

## 9. Patrón RLS

Funciones centrales:

```sql
create or replace function public.is_active_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_tenant_role(
  p_tenant_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;
```

Ejemplo para cálculos:

```sql
alter table public.carbon_calculations enable row level security;
alter table public.carbon_calculations force row level security;

create policy carbon_select_member
on public.carbon_calculations
for select to authenticated
using (public.is_active_member(tenant_id));

create policy carbon_insert_operator
on public.carbon_calculations
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_tenant_role(
    tenant_id,
    array['tenant_owner','tenant_admin','consultant','analyst']
  )
);

create policy carbon_update_operator
on public.carbon_calculations
for update to authenticated
using (
  public.has_tenant_role(
    tenant_id,
    array['tenant_owner','tenant_admin','consultant','analyst']
  )
)
with check (
  public.has_tenant_role(
    tenant_id,
    array['tenant_owner','tenant_admin','consultant','analyst']
  )
);
```

Toda tabla privada necesita políticas para cada operación. No confiar en que la ausencia de una política de escritura sea suficientemente obvia; versionar pruebas negativas.

Las funciones `security definer` deben fijar `search_path`, no aceptar SQL dinámico y tener permisos de ejecución restringidos.

## 10. Backend objetivo

### 10.1 Estructura FastAPI

```text
backend/app/
├── main.py
├── core/
│   ├── config.py
│   ├── auth.py
│   ├── permissions.py
│   ├── errors.py
│   └── logging.py
├── db/
│   ├── session.py
│   └── repositories/
├── api/
│   ├── dependencies.py
│   └── routers/
│       ├── tenants.py
│       ├── users.py
│       ├── access.py
│       ├── carbon.py
│       ├── projects.py
│       ├── diagnostics.py
│       └── chat.py
├── domains/
│   ├── carbon/
│   ├── projects/
│   └── diagnostics/
├── integrations/
│   ├── anthropic.py
│   ├── nvidia.py
│   ├── supabase.py
│   └── storage.py
└── workers/
```

### 10.2 Validación de identidad

FastAPI debe:

1. extraer el bearer token;
2. verificar firma, `iss`, `aud`, expiración y algoritmo mediante JWKS de Supabase;
3. obtener `sub` como UUID del usuario;
4. verificar la membresía activa al tenant;
5. verificar módulo y permiso;
6. aplicar el tenant al repositorio/consulta;
7. emitir un evento de auditoría para acciones sensibles.

Nunca usar `service_role` para consultas normales iniciadas por usuario si se puede conservar RLS. Si FastAPI usa service role, debe aplicar obligatoriamente el filtro `tenant_id` y duplicar la autorización; es más seguro propagar el JWT de usuario a Supabase cuando sea viable.

### 10.3 Contexto de tenant

Recomendación:

```http
X-Tenant-Id: 8a8f...
Authorization: Bearer ey...
```

El header selecciona, no autoriza. Para recursos con ID, el tenant también debe formar parte de la consulta:

```sql
select *
from carbon_calculations
where id = :resource_id
  and tenant_id = :authorized_tenant_id;
```

Así se evita un IDOR incluso si se adivina un UUID de otro cliente.

### 10.4 API propuesta

Identidad y acceso:

```http
GET    /api/v1/me
GET    /api/v1/me/tenants
GET    /api/v1/me/capabilities?tenant_id=...
POST   /api/v1/tenants
GET    /api/v1/tenants/{tenant_id}/members
POST   /api/v1/tenants/{tenant_id}/invitations
PATCH  /api/v1/tenants/{tenant_id}/members/{user_id}
DELETE /api/v1/tenants/{tenant_id}/members/{user_id}
GET    /api/v1/tenants/{tenant_id}/modules
PUT    /api/v1/tenants/{tenant_id}/modules/{module_key}
```

Calculadora:

```http
POST   /api/v1/carbon/calculations
GET    /api/v1/carbon/calculations
GET    /api/v1/carbon/calculations/{id}
POST   /api/v1/carbon/documents
PATCH  /api/v1/carbon/documents/{id}/review
POST   /api/v1/carbon/calculations/{id}/reports
GET    /api/v1/carbon/reports/{id}/download
```

Proyectos:

```http
GET    /api/v1/projects?q=&country=&type=&status=&cursor=
GET    /api/v1/projects/{id}
POST   /api/v1/projects/{id}/save
DELETE /api/v1/projects/{id}/save
POST   /api/v1/projects/{id}/notes
GET    /api/v1/projects/{id}/notes
```

Diagnóstico:

```http
POST   /api/v1/diagnostics
GET    /api/v1/diagnostics
GET    /api/v1/diagnostics/{id}
POST   /api/v1/diagnostics/{id}/generate
POST   /api/v1/diagnostics/{id}/review
POST   /api/v1/diagnostics/{id}/exports
```

Los procesos de IA, PDF y extracción deben poder pasar a jobs asíncronos:

```http
202 Accepted
Location: /api/v1/jobs/{job_id}
```

### 10.5 Errores y contratos

Formato común:

```json
{
  "error": {
    "code": "MODULE_NOT_ENABLED",
    "message": "El módulo no está habilitado para esta organización.",
    "request_id": "req_..."
  }
}
```

Códigos mínimos:

- `401`: token ausente, inválido o expirado;
- `403`: membresía, módulo o permiso insuficiente;
- `404`: recurso inexistente o ajeno al tenant, evitando filtrar su existencia;
- `409`: conflicto/idempotencia;
- `422`: entrada inválida;
- `429`: límite de uso;
- `502/503`: proveedor externo no disponible.

## 11. Cambios de frontend

### 11.1 Unificar sesión

Usar el SDK oficial `@supabase/supabase-js` en un único servicio compartido conceptualmente:

- restauración y refresh automáticos;
- `onAuthStateChange`;
- logout remoto;
- manejo de expiración;
- carga de `/api/v1/me`;
- tenant activo;
- capacidades calculadas por servidor.

Angular puede actuar como shell y servir la calculadora integrada o compartir un paquete pequeño de autenticación/configuración. Mientras siga como SPA separada, no debe decidir acceso leyendo sólo `localStorage`.

### 11.2 Estado de aplicación

```text
AuthState
├── user
├── session
├── memberships[]
├── activeTenant
└── capabilities[]
```

El selector de tenant debe:

- mostrarse si el usuario pertenece a más de uno;
- persistir sólo el ID seleccionado, no permisos;
- recargar capacidades al cambiar;
- limpiar caché y datos del tenant anterior;
- cancelar peticiones en vuelo.

### 11.3 Guards

Crear:

- `authGuard`;
- `tenantGuard`;
- `moduleGuard(moduleKey)`;
- `permissionGuard(permission)`.

Los guards mejoran UX, pero nunca sustituyen RLS/API.

## 12. Seguridad y operación

### 12.1 Controles obligatorios

- CORS con allowlist exacta por entorno.
- CSP estricta; eliminar CDN/importmap innecesarios en producción.
- rate limiting por IP, usuario y tenant.
- límites de tamaño y páginas para DAP.
- comprobar magic bytes, no sólo extensión/MIME declarado.
- escaneo antimalware antes de procesar documentos.
- URLs firmadas de corta duración para almacenamiento privado.
- timeouts, reintentos con backoff y circuit breaker para IA.
- presupuesto/cuota por tenant para operaciones con coste.
- claves sólo en secret manager o entorno del servidor.
- rotación de service role y claves de proveedores.
- logs JSON con `request_id`, usuario, tenant y latencia.
- backups, restauración probada y política de retención.

### 12.2 IA y normativa

Persistir para reproducibilidad:

- proveedor y modelo;
- versión del prompt;
- versión de reglas/factores;
- fecha;
- entrada normalizada;
- salida original y validada;
- confianza;
- revisión humana;
- fuentes.

El diagnóstico debe presentarse como apoyo, no dictamen legal automático. Las reglas nacionales deben salir del código y pasar a un catálogo versionado y revisable.

### 12.3 Protección de datos

Antes de producción multitenant:

- inventario de datos personales;
- base jurídica y consentimiento cuando proceda;
- aviso de privacidad versionado;
- plazos de retención por tipo de recurso;
- exportación y borrado;
- DPA con proveedores;
- región de almacenamiento y transferencia internacional;
- separación de datos de prospectos anónimos y clientes autenticados.

## 13. Migración recomendada

### Fase 0 — Cerrar fallos críticos

1. Implementar o retirar temporalmente los enlaces HCC.
2. Sustituir `require_bearer` por validación real de JWT.
3. Restringir CORS.
4. Hacer fallar `/api/lead` si no persiste.
5. Proteger o dejar de exponer `agent_runs`, `cambios` y oportunidades internas.
6. Añadir rate limiting al diagnóstico y chat.

Criterio de salida: ningún endpoint sensible acepta un token falso y la calculadora tiene pruebas end-to-end contra un backend real.

### Fase 1 — Núcleo multitenant

1. Crear `tenants`, `profiles`, `tenant_memberships`, módulos y grants.
2. Crear un tenant interno Techne.
3. Migrar usuarios existentes como miembros.
4. Implementar `/me`, tenants y capacidades.
5. Añadir selector de tenant y guards.
6. Incorporar auditoría.

Criterio de salida: dos usuarios de tenants distintos no pueden leer ni modificar recursos cruzados mediante UI, API, PostgREST ni IDs directos.

### Fase 2 — Calculadora

1. Implementar dominio y endpoints HCC.
2. Versionar factores y metodología.
3. Persistir cálculos, componentes, documentos e informes con `tenant_id`.
4. Añadir almacenamiento privado y validación de PDF.
5. Añadir revisión humana de extracción.

Criterio de salida: un cálculo es reproducible, auditable y descargable sólo por miembros autorizados de su tenant.

### Fase 3 — Proyectos

1. Mantener catálogo global separado.
2. Añadir staging y aprobación de datos del agente.
3. Proteger información premium.
4. Añadir favoritos, notas, watchlists y asignación por tenant.
5. Mover búsqueda, filtros y paginación al servidor.

Criterio de salida: el catálogo publicado es común según plan, y toda personalización queda aislada.

### Fase 4 — Diagnóstico

1. Persistir diagnósticos por tenant y usuario.
2. Versionar prompts y reglas.
3. Añadir workflow de revisión/aprobación.
4. Gestionar leads y consentimiento.
5. Ejecutar generación costosa mediante jobs y cuotas.

Criterio de salida: diagnóstico reproducible, revisable y con tratamiento de datos documentado.

### Fase 5 — Endurecimiento

1. Tests de aislamiento y permisos.
2. Observabilidad, alertas y SLO.
3. Escaneo de dependencias y secretos.
4. Backups y simulacro de restauración.
5. Prueba de carga y control de costes.

## 14. Estrategia de pruebas

### 14.1 Matriz mínima de aislamiento

Crear en tests:

- tenant A con owner, analyst y viewer;
- tenant B con owner;
- usuario sin membresía;
- módulo habilitado y deshabilitado;
- recursos de cada dominio en A y B.

Para cada endpoint y tabla verificar:

- miembro A puede operar según su rol en A;
- miembro A recibe `404/403` sobre B;
- viewer no escribe;
- usuario suspendido no lee;
- módulo deshabilitado deniega aunque el rol permita;
- service worker sólo ejecuta acciones explícitas;
- `tenant_id` manipulado no cambia el resultado.

### 14.2 Tests por capa

- Unitarios: fórmulas HCC, conversión de unidades, permisos, validación de prompts/respuestas.
- Contrato: OpenAPI y esquemas JSON.
- Integración: PostgreSQL real con RLS y JWT de prueba.
- End-to-end: login, selección de tenant, cálculo, PDF, búsqueda, diagnóstico.
- Seguridad: IDOR, tokens expirados, uploads maliciosos, rate limit, XSS almacenado.
- Reproducibilidad: mismo input + mismas versiones = mismo resultado determinista HCC.

## 15. Definición de terminado

La integración multitenant estará lista cuando:

- todo recurso privado tenga `tenant_id`, propietario/actor y timestamps;
- no exista autorización basada sólo en frontend;
- FastAPI valide JWT, membresía, módulo y permiso;
- RLS esté habilitada, forzada y probada;
- los procesos con service role estén identificados y auditados;
- HCC tenga backend, persistencia y factores versionados;
- proyectos separe catálogo global de datos privados del cliente;
- diagnóstico tenga historial, reglas versionadas y revisión;
- exista administración de miembros, roles y módulos;
- logs, auditoría, retención y backups estén operativos;
- las pruebas negativas entre tenants formen parte del CI.

## 16. Comprobaciones realizadas durante la auditoría

- La SPA React de la calculadora compila correctamente con Vite.
- La compilación Angular no pudo completarse en el entorno de auditoría porque el compilador recibió errores de acceso del sandbox al resolver archivos del workspace. No se atribuye ese fallo al código sin repetir la prueba fuera del sandbox.
- La búsqueda en el código y en el historial Git disponible no encontró implementación versionada de `/api/hcc/*`.
- El backend declara únicamente los endpoints listados en la sección 4.3.
- No se modificaron archivos locales preexistentes ni secretos; este documento es el único archivo añadido por la auditoría.

## 17. Próxima unidad de trabajo recomendada

La primera entrega de implementación debería ser una vertical pequeña y completa:

1. migración de tenants, memberships, módulos y grants;
2. validación JWT en FastAPI;
3. endpoints `/api/v1/me` y `/api/v1/me/capabilities`;
4. tenant activo en Angular;
5. `GET /api/v1/carbon/access`;
6. una tabla `carbon_calculations` con RLS;
7. `POST/GET` de cálculos con pruebas de aislamiento A/B.

Esta vertical valida el patrón de seguridad antes de multiplicarlo en proyectos y diagnóstico.
