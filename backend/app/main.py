from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from uuid import UUID, uuid4

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from supabase import Client, create_client

load_dotenv()


def utc_now_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


def require_bearer(authorization: Optional[str]) -> None:
  if not authorization or not authorization.lower().startswith('bearer '):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing Bearer token.')


class TenantCreateRequest(BaseModel):
  name: str = Field(min_length=1, max_length=120)


class TenantResponse(BaseModel):
  id: str
  name: str
  status: str
  created_at: str


class DataSourceCredentials(BaseModel):
  username: str
  password: str


class DataSourceCreateRequest(BaseModel):
  type: str
  host: str
  port: Optional[int] = None
  dbName: str
  schemaName: Optional[str] = None
  credentials: DataSourceCredentials


class DataSourceCreateResponse(BaseModel):
  dataSourceId: str
  status: str


class DataSourceResponse(BaseModel):
  id: str
  tenant_id: str
  type: str
  host: str
  port: Optional[int]
  db_name: str
  schema_name: Optional[str]
  secret_ref: str
  status: str
  last_tested_at: Optional[str]
  created_at: str


class PipelineRunRequest(BaseModel):
  jobType: str
  dataSourceId: Optional[str] = None


class PipelineRunResponse(BaseModel):
  jobId: str
  status: str


class PipelineResponse(BaseModel):
  id: str
  tenant_id: str
  job_type: str
  status: str
  started_at: Optional[str]
  finished_at: Optional[str]
  log_ref: Optional[str]
  created_at: str


class TrainModelRequest(BaseModel):
  modelName: str
  trainingConfig: Dict[str, Any] = Field(default_factory=dict)


class TrainModelResponse(BaseModel):
  jobId: str
  status: str


class ModelResponse(BaseModel):
  id: str
  tenant_id: str
  model_name: str
  version: str
  status: str
  metrics_json: Dict[str, Any]
  artifact_ref: str
  deployed_at: Optional[str]
  created_at: str


class DeployModelResponse(BaseModel):
  ok: bool
  endpoint: str


app = FastAPI(title='Techne Admin API', version='0.1.0')

app.add_middleware(
  CORSMiddleware,
  allow_origins=['*'],
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)

TENANTS: List[Dict[str, Any]] = []
DATASOURCES_BY_TENANT: Dict[str, List[Dict[str, Any]]] = {}
PIPELINES_BY_TENANT: Dict[str, List[Dict[str, Any]]] = {}
MODELS_BY_TENANT: Dict[str, List[Dict[str, Any]]] = {}


@app.get('/health')
def health() -> Dict[str, str]:
  return {'status': 'ok'}


@app.get('/admin/tenants', response_model=List[TenantResponse])
def list_tenants(authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
  require_bearer(authorization)
  return TENANTS


@app.post('/admin/tenants', response_model=TenantResponse)
def create_tenant(payload: TenantCreateRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
  require_bearer(authorization)

  name = payload.name.strip()
  if not name:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Tenant name is required.')

  existing = next((t for t in TENANTS if t['name'].lower() == name.lower()), None)
  if existing:
    return existing

  tenant = {
    'id': str(uuid4()),
    'name': name,
    'status': 'active',
    'created_at': utc_now_iso(),
  }
  TENANTS.append(tenant)
  return tenant


@app.get('/admin/tenants/{tenant_id}/datasources', response_model=List[DataSourceResponse])
def list_data_sources(tenant_id: str, authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)
  return DATASOURCES_BY_TENANT.get(tenant_id, [])


@app.post('/admin/tenants/{tenant_id}/datasources', response_model=DataSourceCreateResponse)
def create_data_source(
  tenant_id: str,
  payload: DataSourceCreateRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)

  source_id = str(uuid4())
  secret_ref = f'secrets/{tenant_id}/datasources/{source_id}'
  row = {
    'id': source_id,
    'tenant_id': tenant_id,
    'type': payload.type.strip(),
    'host': payload.host.strip(),
    'port': payload.port,
    'db_name': payload.dbName.strip(),
    'schema_name': payload.schemaName.strip() if payload.schemaName else None,
    'secret_ref': secret_ref,
    'status': 'draft',
    'last_tested_at': None,
    'created_at': utc_now_iso(),
  }

  DATASOURCES_BY_TENANT.setdefault(tenant_id, []).append(row)
  return {'dataSourceId': source_id, 'status': 'draft'}


@app.get('/admin/tenants/{tenant_id}/pipelines', response_model=List[PipelineResponse])
def list_pipelines(tenant_id: str, authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)
  return sorted(PIPELINES_BY_TENANT.get(tenant_id, []), key=lambda p: p['created_at'], reverse=True)


@app.post('/admin/tenants/{tenant_id}/pipelines/run', response_model=PipelineRunResponse)
def run_pipeline(
  tenant_id: str,
  payload: PipelineRunRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)

  pipeline_id = str(uuid4())
  now = utc_now_iso()
  row = {
    'id': pipeline_id,
    'tenant_id': tenant_id,
    'job_type': payload.jobType.strip(),
    'status': 'queued',
    'started_at': None,
    'finished_at': None,
    'log_ref': f'logs/{tenant_id}/{pipeline_id}.log',
    'created_at': now,
  }
  PIPELINES_BY_TENANT.setdefault(tenant_id, []).append(row)

  return {'jobId': pipeline_id, 'status': 'queued'}


@app.get('/admin/tenants/{tenant_id}/models', response_model=List[ModelResponse])
def list_models(tenant_id: str, authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)
  return sorted(MODELS_BY_TENANT.get(tenant_id, []), key=lambda m: m['created_at'], reverse=True)


@app.post('/admin/tenants/{tenant_id}/models/train', response_model=TrainModelResponse)
def train_model(
  tenant_id: str,
  payload: TrainModelRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)

  model_id = str(uuid4())
  version = f"v{datetime.now(timezone.utc).strftime('%Y.%m.%d.%H%M%S')}"
  model_row = {
    'id': model_id,
    'tenant_id': tenant_id,
    'model_name': payload.modelName.strip(),
    'version': version,
    'status': 'trained',
    'metrics_json': {
      'note': 'mock training result',
      'trainingConfig': payload.trainingConfig,
    },
    'artifact_ref': f'artifacts/{tenant_id}/{payload.modelName.strip()}/{version}/model.bin',
    'deployed_at': None,
    'created_at': utc_now_iso(),
  }
  MODELS_BY_TENANT.setdefault(tenant_id, []).append(model_row)

  pipeline_id = str(uuid4())
  PIPELINES_BY_TENANT.setdefault(tenant_id, []).append(
    {
      'id': pipeline_id,
      'tenant_id': tenant_id,
      'job_type': 'train',
      'status': 'queued',
      'started_at': None,
      'finished_at': None,
      'log_ref': f'logs/{tenant_id}/{pipeline_id}.log',
      'created_at': utc_now_iso(),
    }
  )

  return {'jobId': pipeline_id, 'status': 'queued'}


@app.post('/admin/tenants/{tenant_id}/models/{model_id}/deploy', response_model=DeployModelResponse)
def deploy_model(tenant_id: str, model_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
  require_bearer(authorization)
  ensure_tenant_exists(tenant_id)

  models = MODELS_BY_TENANT.get(tenant_id, [])
  model = next((m for m in models if m['id'] == model_id), None)
  if not model:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Model not found.')

  model['status'] = 'deployed'
  model['deployed_at'] = utc_now_iso()
  return {'ok': True, 'endpoint': '/portal/inference'}


# ══ Diagnóstico normativo ══════════════════════════════════════════════════

class DiagnosticoRequest(BaseModel):
  empresa: str = ''
  sector: str
  sector_custom: str = ''
  actividad: str
  empleados: str
  certs: List[str] = []
  doc_state: str
  urgencia: int
  problemas: List[str] = []
  extra: str = ''
  lang: Optional[str] = "es"
  pais: Optional[str] = "es"


class DiagnosticoResult(BaseModel):
  normas: str
  brechas: str
  resumen: str
  flujo: str
  precio_rango: str
  retainer: str
  via_ead: Optional[str] = ''


class DiagnosticoResponse(BaseModel):
  ok: bool
  result: DiagnosticoResult


class LeadRequest(BaseModel):
  empresa: str = ''
  sector: str = ''
  sector_custom: str = ''
  actividad: str = ''
  empleados: str = ''
  certs: List[str] = []
  doc_state: str = ''
  urgencia: int = 2
  problemas: List[str] = []
  extra: str = ''
  email: str
  diagnostico_json: Dict[str, Any] = {}


_SYSTEM_PROMPT = """Eres un consultor experto en normativa técnica y sistemas de gestión para empresas industriales españolas.
Tu tarea es analizar el perfil de una empresa y generar un diagnóstico normativo estructurado.

Devuelve EXCLUSIVAMENTE un JSON con exactamente estas claves (sin texto adicional):
{
  "normas": "lista de normas aplicables separadas por |",
  "brechas": "lista de brechas, una por línea",
  "resumen": "párrafo ejecutivo de 2-3 frases",
  "flujo": "pasos del plan de acción, uno por línea",
  "precio_rango": "rango de precio del proyecto (ej: 4.500 € – 9.000 €)",
  "retainer": "coste mensual de mantenimiento (ej: 350 €/mes)"
}"""


NORMATIVA_NACIONAL: dict[str, str] = {
    "es": """
NORMATIVA NACIONAL APLICABLE - ESPAÑA:
- Ley 7/2022 de Residuos y Suelo Contaminado
- RD 553/2020 de traslado de residuos
- RD 833/1988 de residuos peligrosos
- Ley 31/1995 de Prevención de Riesgos Laborales
- RD 1215/1997 de equipos de trabajo
- Legislación autonómica de la CCAA correspondiente
- Código Técnico de la Edificación (CTE) si aplica
- RITE (Reglamento de Instalaciones Térmicas) si aplica
""",
    "de": """
NORMATIVA NACIONAL APLICABLE - ALEMANIA:
- Produktsicherheitsgesetz (ProdSG) - Ley de Seguridad de Productos
- Betriebssicherheitsverordnung (BetrSichV) - Seguridad de equipos
- Bundesimmissionsschutzgesetz (BImSchG) - Control de emisiones
- Kreislaufwirtschaftsgesetz (KrWG) - Gestión de residuos
- Arbeitsstättenverordnung (ArbStättV) - Seguridad en el trabajo
- TRGS (Reglas técnicas para sustancias peligrosas) si aplica
""",
    "fr": """
NORMATIVA NACIONAL APLICABLE - FRANCIA:
- Code de l'environnement - residuos e impacto ambiental
- Code du travail - seguridad laboral
- Décret n°2002-540 - clasificación de residuos
- Installations Classées pour la Protection de l'Environnement (ICPE)
- NF standards aplicables al sector
- Réglementation thermique (RT) si aplica construcción
""",
    "gb": """
NORMATIVA NACIONAL APLICABLE - REINO UNIDO:
- UK REACH (post-Brexit) para sustancias químicas
- UKCA Marking (reemplaza CE Marking en GB)
- Health and Safety at Work Act 1974
- Environmental Protection Act 1990
- Waste (England and Wales) Regulations 2011
- Supply of Machinery (Safety) Regulations 2008
- Building Regulations si aplica construcción
NOTA: Reino Unido ya no aplica marcado CE - usar UKCA marking.
""",
    "se": """
NORMATIVA NACIONAL APLICABLE - SUECIA:
- Miljöbalken (MB) - Código Medioambiental sueco
- Arbetsmiljölagen (AML) - Ley de entorno de trabajo
- Avfallsförordningen - Reglamento de residuos
- Plan- och bygglagen (PBL) - si aplica construcción
- Naturvårdsverkets föreskrifter - regulaciones de la Agencia de Medio Ambiente
- CE Marking aplica igual que resto de UE
- Kemikalieinspektionen (KEMI) para sustancias químicas
""",
    "other": """
NORMATIVA APLICABLE - MERCADO INTERNACIONAL:
Aplica el marco normativo europeo como referencia estándar.
Identifica las normativas ISO y EN aplicables al sector.
Indica que la normativa nacional específica debe verificarse
según el país de comercialización del producto.
""",
}


NORMA_ARMONIZADA_INSTRUCCION = """
INSTRUCCIÓN CRÍTICA - EVALUACIÓN DE COBERTURA POR NORMA ARMONIZADA:

Antes de cerrar el análisis, evalúa EXPLÍCITAMENTE si existe
una norma armonizada (hEN) cuya referencia esté publicada en
el Diario Oficial de la UE (DOUE) que cubra ESPECÍFICAMENTE
este producto tal como está descrito — incluyendo su composición,
materiales y uso previsto.

IMPORTANTE: El hecho de que existan normas de ensayo aplicables
(como EN 13501, EN 13162, EN ISO 29053) NO significa que el
producto esté cubierto por una norma armonizada. Una norma es
armonizada SOLO si su referencia está publicada en el DOUE
como norma de mandato bajo el CPR.

Casos donde SIEMPRE debe activarse la vía EAD:
- Productos kit con componentes de materiales mixtos o reciclados
  sin hEN específica publicada
- Productos innovadores sin precedente normativo directo
- Productos donde la composición o proceso de fabricación difiere
  significativamente de los productos cubiertos por hEN existentes
- Productos donde el fabricante tendría que forzar la aplicación
  de una hEN que no fue diseñada para ese producto

Si se cumple alguno de los casos anteriores, establece
"via_ead" con el texto explicativo completo.
Si el producto está inequívocamente cubierto por una hEN
publicada en el DOUE, establece "via_ead": "".

Para este caso concreto de paneles de aislamiento con
residuos textiles reciclados en fachada ventilada:
NO existe hEN específica — debe activarse via_ead.
"""


def _build_user_prompt(req: DiagnosticoRequest) -> str:
  if req.lang == 'en':
    idioma_instruccion = "Respond ENTIRELY in English. All sections must be in English."
  else:
    idioma_instruccion = "Responde ÍNTEGRAMENTE en español."
  sector_label = req.sector_custom if req.sector == 'otro' and req.sector_custom else req.sector
  certs = ', '.join(req.certs) if req.certs else 'ninguna'
  problemas = ', '.join(req.problemas) if req.problemas else 'no especificados'
  urgencia_map = {1: 'muy baja', 2: 'baja', 3: 'media', 4: 'alta', 5: 'crítica'}
  return (
    f"{idioma_instruccion}\n\n"
    f"Empresa: {req.empresa or 'no especificada'}\n"
    f"Sector: {sector_label}\n"
    f"País de operación: {req.pais or 'es'}\n"
    f"Actividad principal: {req.actividad}\n"
    f"Número de empleados: {req.empleados}\n"
    f"Certificaciones actuales: {certs}\n"
    f"Estado documental: {req.doc_state}\n"
    f"Urgencia: {urgencia_map.get(req.urgencia, 'media')}\n"
    f"Problemas identificados: {problemas}\n"
    f"Contexto adicional: {req.extra or 'ninguno'}"
    f"\n{NORMATIVA_NACIONAL.get(req.pais or 'es', NORMATIVA_NACIONAL['other'])}"
    f"\n{NORMA_ARMONIZADA_INSTRUCCION}"
  )


@app.post('/api/diagnostico', response_model=DiagnosticoResponse)
def generar_diagnostico(payload: DiagnosticoRequest) -> DiagnosticoResponse:
  api_key = os.getenv('ANTHROPIC_API_KEY')
  if not api_key:
    raise HTTPException(status_code=500, detail='ANTHROPIC_API_KEY no configurada.')

  client = anthropic.Anthropic(api_key=api_key)
  model = os.getenv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514')
  message = client.messages.create(
    model=model,
    max_tokens=2048,
    system=_SYSTEM_PROMPT,
    messages=[{'role': 'user', 'content': _build_user_prompt(payload)}],
  )

  import json
  try:
    raw = message.content[0].text.strip()
    # Limpiar posibles bloques de código markdown
    if raw.startswith('```'):
      raw = raw.split('```')[1]
      if raw.startswith('json'):
        raw = raw[4:]
    raw = raw.strip()

    # Log para debugging
    print(f'RAW RESPONSE: {raw[:500]}')

    parsed = json.loads(raw)

    # Asegurar que via_ead existe aunque sea vacío
    if 'via_ead' not in parsed:
      parsed['via_ead'] = ''

    print(f"VIA_EAD VALUE: {parsed.get('via_ead', 'NOT FOUND')}")

    return {'ok': True, 'result': parsed}

  except json.JSONDecodeError as e:
    print(f'JSON PARSE ERROR: {e}')
    print(f'RAW TEXT: {raw}')
    raise HTTPException(status_code=500, detail=f'Error parseando respuesta IA: {str(e)}')


@app.post('/api/lead')
def guardar_lead(payload: LeadRequest) -> Dict[str, bool]:
  supabase_url = os.getenv('SUPABASE_URL')
  supabase_key = os.getenv('SUPABASE_SERVICE_KEY')

  if supabase_url and supabase_key:
    from supabase import create_client
    sb = create_client(supabase_url, supabase_key)
    sb.table('diagnostico_leads').insert({
      'email': payload.email,
      'empresa': payload.empresa,
      'sector': payload.sector,
      'actividad': payload.actividad,
      'empleados': payload.empleados,
      'certs': payload.certs,
      'doc_state': payload.doc_state,
      'urgencia': payload.urgencia,
      'problemas': payload.problemas,
      'diagnostico_json': payload.diagnostico_json,
      'created_at': utc_now_iso(),
    }).execute()

  return {'ok': True}


# ══ Asistente de chat (NVIDIA) ═════════════════════════════════════════════

NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'


class ChatMessage(BaseModel):
  role: str
  content: str


class ChatRequest(BaseModel):
  messages: List[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
  reply: str


@app.post('/api/chat', response_model=ChatResponse)
def chat(payload: ChatRequest) -> Dict[str, str]:
  api_key = os.getenv('NVIDIA_API_KEY')
  if not api_key:
    raise HTTPException(status_code=500, detail='NVIDIA_API_KEY no configurada.')

  if not payload.messages:
    raise HTTPException(status_code=400, detail='No se ha enviado ningún mensaje.')

  model = os.getenv('NVIDIA_MODEL', 'meta/llama-3.1-8b-instruct')
  system_prompt = os.getenv(
    'NVIDIA_SYSTEM_PROMPT',
    'Eres el asistente virtual de Techne Soluciones. Responde de forma breve y profesional.',
  )

  history = [{'role': 'system', 'content': system_prompt}]
  history += [{'role': m.role, 'content': m.content} for m in payload.messages[-20:]]

  try:
    response = httpx.post(
      NVIDIA_CHAT_URL,
      headers={
        'Authorization': f'Bearer {api_key}',
        'Accept': 'application/json',
      },
      json={
        'model': model,
        'messages': history,
        'temperature': 0.5,
        'max_tokens': 512,
        'stream': False,
      },
      timeout=30.0,
    )
    response.raise_for_status()
  except httpx.HTTPStatusError as e:
    raise HTTPException(
      status_code=502,
      detail=f'Error del servicio NVIDIA: {e.response.status_code} {e.response.text[:300]}',
    )
  except httpx.RequestError as e:
    raise HTTPException(status_code=502, detail=f'No se pudo contactar con NVIDIA: {e}')

  data = response.json()
  try:
    reply = data['choices'][0]['message']['content']
  except (KeyError, IndexError):
    raise HTTPException(status_code=502, detail='Respuesta inesperada del servicio NVIDIA.')

  return {'reply': reply}


# ══════════════════════════════════════════════════════════════════════════════

def ensure_tenant_exists(tenant_id: str) -> None:
  if not any(t['id'] == tenant_id for t in TENANTS):
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Tenant not found.')


# ══ Multitenant minimo: capacidades por modulo y administracion de accesos ═════

class SupabaseUser(BaseModel):
  id: str
  email: Optional[str] = None


def _supabase_anon_config() -> tuple[str, str]:
  supabase_url = os.getenv('SUPABASE_URL')
  supabase_anon_key = os.getenv('SUPABASE_ANON_KEY')
  if not supabase_url or not supabase_anon_key:
    raise HTTPException(status_code=500, detail='SUPABASE_URL o SUPABASE_ANON_KEY no configuradas.')
  return supabase_url.rstrip('/'), supabase_anon_key


def _supabase_service_config() -> tuple[str, str]:
  supabase_url = os.getenv('SUPABASE_URL')
  service_key = os.getenv('SUPABASE_SERVICE_KEY')
  if not supabase_url or not service_key:
    raise HTTPException(status_code=500, detail='SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas.')
  return supabase_url.rstrip('/'), service_key


def resolve_supabase_user(authorization: Optional[str]) -> tuple[SupabaseUser, str]:
  """Valida el JWT contra Supabase Auth y devuelve el usuario y el token crudo."""
  require_bearer(authorization)
  token = authorization.split(' ', 1)[1].strip()
  supabase_url, supabase_anon_key = _supabase_anon_config()

  try:
    response = httpx.get(
      f'{supabase_url}/auth/v1/user',
      headers={
        'apikey': supabase_anon_key,
        'Authorization': f'Bearer {token}',
      },
      timeout=10.0,
    )
  except httpx.RequestError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='No se pudo validar el token con Supabase.')

  if response.status_code != 200:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token invalido o expirado.')

  data = response.json()
  user_id = data.get('id')
  if not user_id:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token invalido o expirado.')

  return SupabaseUser(id=user_id, email=data.get('email')), token


def is_admin_user(user_id: str, token: str) -> bool:
  """Comprueba admin_users usando el propio token del usuario (RLS: select own)."""
  supabase_url, supabase_anon_key = _supabase_anon_config()
  url = f'{supabase_url}/rest/v1/admin_users?select=user_id&user_id=eq.{user_id}&limit=1'

  try:
    response = httpx.get(
      url,
      headers={
        'apikey': supabase_anon_key,
        'Authorization': f'Bearer {token}',
      },
      timeout=10.0,
    )
  except httpx.RequestError:
    return False

  if response.status_code != 200:
    return False

  rows = response.json()
  return isinstance(rows, list) and len(rows) > 0


def require_admin(authorization: Optional[str]) -> tuple[SupabaseUser, str]:
  user, token = resolve_supabase_user(authorization)
  if not is_admin_user(user.id, token):
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Se requieren permisos de administrador.')
  return user, token


class CapabilitiesResponse(BaseModel):
  user_id: str
  email: Optional[str] = None
  capabilities: List[str]


@app.get('/api/v1/me/capabilities', response_model=CapabilitiesResponse)
def get_my_capabilities(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
  user, token = resolve_supabase_user(authorization)
  supabase_url, supabase_anon_key = _supabase_anon_config()

  url = (
    f'{supabase_url}/rest/v1/user_module_grants'
    f'?select=module_key&user_id=eq.{user.id}&enabled=eq.true'
  )

  try:
    response = httpx.get(
      url,
      headers={
        'apikey': supabase_anon_key,
        'Authorization': f'Bearer {token}',
      },
      timeout=10.0,
    )
  except httpx.RequestError:
    raise HTTPException(status_code=502, detail='No se pudo consultar los accesos en Supabase.')

  if response.status_code != 200:
    raise HTTPException(status_code=502, detail='No se pudo consultar los accesos en Supabase.')

  rows = response.json()
  capabilities = [row['module_key'] for row in rows if isinstance(row, dict) and row.get('module_key')]

  return {'user_id': user.id, 'email': user.email, 'capabilities': capabilities}


class AdminUserResponse(BaseModel):
  id: str
  email: Optional[str] = None
  created_at: Optional[str] = None
  user_metadata: Dict[str, Any] = Field(default_factory=dict)


@app.get('/api/v1/admin/users', response_model=List[AdminUserResponse])
def list_admin_users(authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
  require_admin(authorization)
  supabase_url, service_key = _supabase_service_config()

  try:
    response = httpx.get(
      f'{supabase_url}/auth/v1/admin/users?per_page=200',
      headers={
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
      },
      timeout=15.0,
    )
  except httpx.RequestError:
    raise HTTPException(status_code=502, detail='No se pudo contactar con la Admin API de Supabase.')

  if response.status_code != 200:
    raise HTTPException(status_code=502, detail='La Admin API de Supabase devolvio un error.')

  payload = response.json()
  users = payload.get('users', []) if isinstance(payload, dict) else payload

  return [
    {
      'id': u.get('id'),
      'email': u.get('email'),
      'created_at': u.get('created_at'),
      'user_metadata': u.get('user_metadata') or {},
    }
    for u in users
    if isinstance(u, dict) and u.get('id')
  ]


class GrantUpsertRequest(BaseModel):
  user_id: str
  module_key: str
  enabled: bool = True
  notes: Optional[str] = None


class GrantResponse(BaseModel):
  user_id: str
  module_key: str
  enabled: bool
  notes: Optional[str] = None
  granted_by: Optional[str] = None
  granted_at: Optional[str] = None


@app.post('/api/v1/admin/grants', response_model=GrantResponse)
def upsert_grant(payload: GrantUpsertRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
  admin, _token = require_admin(authorization)
  supabase_url, service_key = _supabase_service_config()

  body: Dict[str, Any] = {
    'user_id': payload.user_id,
    'module_key': payload.module_key,
    'enabled': payload.enabled,
    'granted_by': admin.id,
  }
  if payload.notes is not None:
    body['notes'] = payload.notes

  try:
    response = httpx.post(
      f'{supabase_url}/rest/v1/user_module_grants?on_conflict=user_id,module_key',
      headers={
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      json=body,
      timeout=15.0,
    )
  except httpx.RequestError:
    raise HTTPException(status_code=502, detail='No se pudo guardar el grant en Supabase.')

  if response.status_code not in (200, 201):
    raise HTTPException(status_code=502, detail=f'Supabase rechazo el grant: {response.text[:300]}')

  rows = response.json()
  if not rows:
    raise HTTPException(status_code=502, detail='Supabase no devolvio el grant guardado.')

  row = rows[0]
  return {
    'user_id': row.get('user_id'),
    'module_key': row.get('module_key'),
    'enabled': row.get('enabled'),
    'notes': row.get('notes'),
    'granted_by': row.get('granted_by'),
    'granted_at': row.get('granted_at'),
  }


# ══ Portal de proyectos ═════════════════════════════════════════════════════

PROYECTOS_BUCKET = 'proyectos'
PROYECTO_DOC_MAX_BYTES = 50 * 1024 * 1024
PROYECTO_DOC_CATEGORIAS = {'informe', 'factura', 'plano', 'foto', 'checklist', 'contrato', 'otro'}

_supabase_service_client_singleton: Optional[Client] = None


def _supabase_service_client() -> Client:
  global _supabase_service_client_singleton
  if _supabase_service_client_singleton is None:
    supabase_url, service_key = _supabase_service_config()
    _supabase_service_client_singleton = create_client(supabase_url, service_key)
  return _supabase_service_client_singleton


def _rest_get(path: str, token: str) -> Any:
  """Lee PostgREST reenviando el token propio del usuario: RLS decide que filas ve."""
  supabase_url, anon_key = _supabase_anon_config()
  try:
    response = httpx.get(
      f'{supabase_url}/rest/v1/{path}',
      headers={'apikey': anon_key, 'Authorization': f'Bearer {token}'},
      timeout=15.0,
    )
  except httpx.RequestError:
    raise HTTPException(status_code=502, detail='No se pudo consultar Supabase.')

  if response.status_code != 200:
    raise HTTPException(status_code=502, detail='Supabase devolvio un error.')

  return response.json()


def _service_rest_get(path: str) -> Any:
  """Lee PostgREST con el service key, sin pasar por RLS. Solo para rutas admin."""
  supabase_url, service_key = _supabase_service_config()
  try:
    response = httpx.get(
      f'{supabase_url}/rest/v1/{path}',
      headers={'apikey': service_key, 'Authorization': f'Bearer {service_key}'},
      timeout=15.0,
    )
  except httpx.RequestError:
    raise HTTPException(status_code=502, detail='No se pudo consultar Supabase.')

  if response.status_code != 200:
    raise HTTPException(status_code=502, detail='Supabase devolvio un error.')

  return response.json()


def _service_rest_request(
  method: str,
  path: str,
  json_body: Optional[Dict[str, Any]] = None,
  prefer: str = 'return=representation',
) -> Any:
  supabase_url, service_key = _supabase_service_config()
  headers = {
    'apikey': service_key,
    'Authorization': f'Bearer {service_key}',
    'Content-Type': 'application/json',
    'Prefer': prefer,
  }

  try:
    response = httpx.request(method, f'{supabase_url}/rest/v1/{path}', headers=headers, json=json_body, timeout=15.0)
  except httpx.RequestError:
    raise HTTPException(status_code=502, detail='No se pudo comunicar con Supabase.')

  if response.status_code not in (200, 201, 204):
    raise HTTPException(status_code=502, detail=f'Supabase rechazo la operacion: {response.text[:300]}')

  if response.status_code == 204 or not response.content:
    return []

  return response.json()


class CandidateApproveRequest(BaseModel):
  name: Optional[str] = Field(default=None, max_length=240)
  country: Optional[str] = Field(default=None, max_length=120)
  infrastructure_type: str = Field(min_length=1, max_length=80)
  budget_millions: Optional[float] = Field(default=None, ge=0)
  status: str = Field(min_length=1, max_length=40)
  description: Optional[str] = Field(default=None, max_length=4000)
  slug: Optional[str] = Field(default=None, max_length=180)
  notes: Optional[str] = Field(default=None, max_length=2000)


class CandidateRejectRequest(BaseModel):
  notes: Optional[str] = Field(default=None, max_length=2000)


class CandidatePublishResponse(BaseModel):
  project_id: str
  slug: str


def _get_discovery_candidate(candidate_id: UUID) -> Dict[str, Any]:
  rows = _service_rest_get(
    'project_discovery_candidates'
    f'?id=eq.{quote(str(candidate_id), safe="")}&select=*'
  )
  if not rows:
    raise HTTPException(status_code=404, detail='Candidato no encontrado.')
  return rows[0]


def _candidate_project_status(value: str) -> str:
  normalized = value.strip().lower()
  statuses = {
    'planificacion': 'Pipeline',
    'planificación': 'Pipeline',
    'pipeline': 'Pipeline',
    'licitacion': 'Tendering',
    'licitación': 'Tendering',
    'tendering': 'Tendering',
    'ejecucion': 'Execution',
    'ejecución': 'Execution',
    'execution': 'Execution',
    'finalizado': 'Monitoring',
    'monitoring': 'Monitoring',
  }
  mapped = statuses.get(normalized)
  if not mapped:
    raise HTTPException(status_code=422, detail='Estado de proyecto no valido.')
  return mapped


def _candidate_infrastructure_type(value: str) -> str:
  normalized = value.strip()
  if normalized == 'Energético':
    normalized = 'Energetico'
  allowed = {'Ferroviario', 'Puentes', 'Hospitalario', 'Energetico', 'Portuario'}
  if normalized not in allowed:
    raise HTTPException(status_code=422, detail='Tipo de infraestructura no valido.')
  return normalized


def _rollback_published_candidate_project(project_id: str) -> None:
  try:
    _service_rest_request(
      'DELETE',
      f'european_projects?id=eq.{quote(project_id, safe="")}',
      prefer='return=minimal',
    )
  except HTTPException:
    # The original publication error is more useful to the caller. Any orphan
    # remains identifiable because its official_source_url points to the candidate.
    pass


@app.get('/api/v1/admin/candidates')
def list_discovery_candidates(
  status_filter: str = Query(default='qualified', alias='status', min_length=1, max_length=40),
  review: str = Query(default='pending', min_length=1, max_length=40),
  limit: int = Query(default=50, ge=1, le=200),
  offset: int = Query(default=0, ge=0),
  authorization: Optional[str] = Header(default=None),
) -> List[Dict[str, Any]]:
  require_admin(authorization)

  qualification_filter = f'qualification_status=eq.{quote(status_filter, safe="")}'
  if review == 'reviewed':
    review_filter = 'review_status=in.(approved,rejected,published)'
  else:
    review_filter = f'review_status=eq.{quote(review, safe="")}'

  return _service_rest_get(
    'project_discovery_candidates'
    f'?select=*&{qualification_filter}&{review_filter}'
    '&order=confidence.desc.nullslast,evidence_quality.desc.nullslast'
    f'&limit={limit}&offset={offset}'
  )


@app.get('/api/v1/admin/candidates/{candidate_id}')
def get_discovery_candidate(
  candidate_id: UUID,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
  require_admin(authorization)
  return _get_discovery_candidate(candidate_id)


@app.post(
  '/api/v1/admin/candidates/{candidate_id}/approve',
  response_model=CandidatePublishResponse,
)
def approve_discovery_candidate(
  candidate_id: UUID,
  payload: CandidateApproveRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
  admin, _token = require_admin(authorization)
  candidate = _get_discovery_candidate(candidate_id)

  if candidate.get('qualification_status') != 'qualified':
    raise HTTPException(status_code=409, detail='El candidato no esta calificado para publicacion.')
  if candidate.get('review_status') != 'pending':
    raise HTTPException(status_code=409, detail='El candidato ya fue revisado.')

  project_status = _candidate_project_status(payload.status)
  infrastructure_type = _candidate_infrastructure_type(payload.infrastructure_type)
  name = (payload.name or '').strip() or str(candidate.get('title') or '').strip()
  slug = (payload.slug or '').strip() or str(candidate.get('proposed_slug') or '').strip()
  country = (payload.country or '').strip() or str(candidate.get('country_hint') or '').strip()
  summary = (
    (payload.description or '').strip()
    or str(candidate.get('description') or '').strip()
    or str(candidate.get('title') or '').strip()
  )

  if not name:
    raise HTTPException(status_code=422, detail='El nombre del proyecto es obligatorio.')
  if not slug:
    raise HTTPException(status_code=422, detail='El slug del proyecto es obligatorio.')
  if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
    raise HTTPException(status_code=422, detail='El slug del proyecto no es valido.')
  if not country:
    raise HTTPException(status_code=422, detail='El pais del proyecto es obligatorio.')
  if not summary:
    raise HTTPException(status_code=422, detail='El resumen del proyecto es obligatorio.')

  project_body = {
    'slug': slug,
    'name': name,
    'country': country,
    'city': None,
    'infrastructure_type': infrastructure_type,
    'status': project_status,
    'budget_eur_m': payload.budget_millions,
    'timeframe': None,
    'summary': summary,
    'route': None,
    'client': None,
    'key_focus': None,
    'required_services': None,
    'official_source_url': candidate.get('canonical_url'),
    'source_owner': candidate.get('source_owner'),
    'source_last_checked_at': utc_now_iso(),
  }

  project_rows = _service_rest_request('POST', 'european_projects', json_body=project_body)
  if not project_rows:
    raise HTTPException(status_code=502, detail='Supabase no devolvio el proyecto publicado.')

  project_id = str(project_rows[0].get('id') or '')
  if not project_id:
    raise HTTPException(status_code=502, detail='El proyecto publicado no tiene identificador.')

  review_body = {
    'review_status': 'approved',
    'review_notes': payload.notes.strip() if payload.notes and payload.notes.strip() else None,
    'reviewed_at': utc_now_iso(),
    'reviewed_by': admin.id,
    'published_project_id': project_id,
  }

  try:
    candidate_rows = _service_rest_request(
      'PATCH',
      'project_discovery_candidates'
      f'?id=eq.{quote(str(candidate_id), safe="")}&review_status=eq.pending',
      json_body=review_body,
    )
  except HTTPException:
    _rollback_published_candidate_project(project_id)
    raise

  if not candidate_rows:
    _rollback_published_candidate_project(project_id)
    raise HTTPException(status_code=409, detail='El candidato fue revisado por otro administrador.')

  return {'project_id': project_id, 'slug': slug}


@app.post(
  '/api/v1/admin/candidates/{candidate_id}/reject',
  status_code=status.HTTP_204_NO_CONTENT,
  response_class=Response,
)
def reject_discovery_candidate(
  candidate_id: UUID,
  payload: CandidateRejectRequest,
  authorization: Optional[str] = Header(default=None),
) -> Response:
  admin, _token = require_admin(authorization)
  candidate = _get_discovery_candidate(candidate_id)
  if candidate.get('review_status') != 'pending':
    raise HTTPException(status_code=409, detail='El candidato ya fue revisado.')

  rows = _service_rest_request(
    'PATCH',
    'project_discovery_candidates'
    f'?id=eq.{quote(str(candidate_id), safe="")}&review_status=eq.pending',
    json_body={
      'review_status': 'rejected',
      'review_notes': payload.notes.strip() if payload.notes and payload.notes.strip() else None,
      'reviewed_at': utc_now_iso(),
      'reviewed_by': admin.id,
    },
  )
  if not rows:
    raise HTTPException(status_code=409, detail='El candidato fue revisado por otro administrador.')
  return Response(status_code=status.HTTP_204_NO_CONTENT)


def _attach_proyecto_counts(rows: List[Dict[str, Any]], token: str) -> List[Dict[str, Any]]:
  ids = [r['id'] for r in rows if r.get('id')]
  if not ids:
    return rows

  ids_filter = ','.join(ids)
  documentos = _rest_get(f'proyecto_documentos?proyecto_id=in.({ids_filter})&select=proyecto_id', token)
  tareas = _rest_get(
    'proyecto_tareas'
    f'?proyecto_id=in.({ids_filter})&estado=eq.completada&requiere_aprobacion_cliente=eq.true&select=proyecto_id',
    token,
  )

  doc_counts: Dict[str, int] = {}
  for d in documentos:
    pid = d.get('proyecto_id')
    if pid:
      doc_counts[pid] = doc_counts.get(pid, 0) + 1

  tarea_counts: Dict[str, int] = {}
  for t in tareas:
    pid = t.get('proyecto_id')
    if pid:
      tarea_counts[pid] = tarea_counts.get(pid, 0) + 1

  for row in rows:
    row['documentos_count'] = doc_counts.get(row['id'], 0)
    row['tareas_pendientes_aprobacion'] = tarea_counts.get(row['id'], 0)

  return rows


class ProyectoResponse(BaseModel):
  id: str
  nombre: str
  descripcion: Optional[str] = None
  tipo: str
  ubicacion: Optional[str] = None
  cliente_user_id: Optional[str] = None
  avance_pct: int
  proximo_hito: Optional[str] = None
  fecha_inicio: Optional[str] = None
  fecha_prevista_fin: Optional[str] = None
  estado: str
  created_by: Optional[str] = None
  created_at: str
  updated_at: str
  documentos_count: int = 0
  tareas_pendientes_aprobacion: int = 0


class DocumentoResponse(BaseModel):
  id: str
  proyecto_id: str
  nombre: str
  categoria: str
  storage_path: str
  mime_type: Optional[str] = None
  size_bytes: Optional[int] = None
  descripcion: Optional[str] = None
  uploaded_by: Optional[str] = None
  created_at: str


class TareaResponse(BaseModel):
  id: str
  proyecto_id: str
  titulo: str
  descripcion: Optional[str] = None
  requiere_aprobacion_cliente: bool
  aprobada_por: Optional[str] = None
  aprobada_at: Optional[str] = None
  estado: str
  created_at: str


class NotaResponse(BaseModel):
  id: str
  proyecto_id: str
  texto: str
  visible_cliente: bool
  created_by: Optional[str] = None
  created_at: str


class ProyectoDetailResponse(ProyectoResponse):
  tareas: List[TareaResponse] = Field(default_factory=list)
  notas: List[NotaResponse] = Field(default_factory=list)
  documentos: List[DocumentoResponse] = Field(default_factory=list)


class ProyectoCreateRequest(BaseModel):
  nombre: str
  descripcion: Optional[str] = None
  tipo: str
  ubicacion: Optional[str] = None
  cliente_user_id: Optional[str] = None
  fecha_inicio: Optional[str] = None
  fecha_prevista_fin: Optional[str] = None
  proximo_hito: Optional[str] = None


class ProyectoUpdateRequest(BaseModel):
  nombre: Optional[str] = None
  descripcion: Optional[str] = None
  tipo: Optional[str] = None
  ubicacion: Optional[str] = None
  cliente_user_id: Optional[str] = None
  avance_pct: Optional[int] = Field(default=None, ge=0, le=100)
  proximo_hito: Optional[str] = None
  fecha_inicio: Optional[str] = None
  fecha_prevista_fin: Optional[str] = None
  estado: Optional[str] = None


class TareaCreateRequest(BaseModel):
  titulo: str
  descripcion: Optional[str] = None
  requiere_aprobacion_cliente: bool = False


class TareaUpdateRequest(BaseModel):
  titulo: Optional[str] = None
  descripcion: Optional[str] = None
  requiere_aprobacion_cliente: Optional[bool] = None
  estado: Optional[str] = None


class NotaCreateRequest(BaseModel):
  texto: str
  visible_cliente: bool = True


class SignedUrlResponse(BaseModel):
  url: str


@app.get('/api/v1/proyectos', response_model=List[ProyectoResponse])
def list_proyectos(authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
  _user, token = resolve_supabase_user(authorization)
  rows = _rest_get('proyectos?select=*&order=created_at.desc', token)
  return _attach_proyecto_counts(rows, token)


@app.get('/api/v1/proyectos/{proyecto_id}', response_model=ProyectoDetailResponse)
def get_proyecto(proyecto_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
  _user, token = resolve_supabase_user(authorization)

  rows = _rest_get(f'proyectos?id=eq.{proyecto_id}&select=*', token)
  if not rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')
  proyecto = rows[0]

  tareas = _rest_get(f'proyecto_tareas?proyecto_id=eq.{proyecto_id}&select=*&order=created_at.asc', token)
  notas = _rest_get(f'proyecto_notas?proyecto_id=eq.{proyecto_id}&select=*&order=created_at.desc', token)
  documentos = _rest_get(f'proyecto_documentos?proyecto_id=eq.{proyecto_id}&select=*&order=created_at.desc', token)

  proyecto['tareas'] = tareas
  proyecto['notas'] = notas
  proyecto['documentos'] = documentos
  proyecto['documentos_count'] = len(documentos)
  proyecto['tareas_pendientes_aprobacion'] = sum(
    1 for t in tareas if t.get('estado') == 'completada' and t.get('requiere_aprobacion_cliente')
  )
  return proyecto


@app.post('/api/v1/proyectos', response_model=ProyectoResponse)
def create_proyecto(payload: ProyectoCreateRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
  admin, _token = require_admin(authorization)

  body = {
    'nombre': payload.nombre.strip(),
    'descripcion': payload.descripcion,
    'tipo': payload.tipo,
    'ubicacion': payload.ubicacion,
    'cliente_user_id': payload.cliente_user_id,
    'fecha_inicio': payload.fecha_inicio,
    'fecha_prevista_fin': payload.fecha_prevista_fin,
    'proximo_hito': payload.proximo_hito,
    'created_by': admin.id,
  }

  rows = _service_rest_request('POST', 'proyectos', json_body=body)
  if not rows:
    raise HTTPException(status_code=502, detail='Supabase no devolvio el proyecto creado.')

  row = rows[0]
  row['documentos_count'] = 0
  row['tareas_pendientes_aprobacion'] = 0
  return row


@app.patch('/api/v1/proyectos/{proyecto_id}', response_model=ProyectoResponse)
def update_proyecto(
  proyecto_id: str,
  payload: ProyectoUpdateRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
  require_admin(authorization)

  body = payload.model_dump(exclude_unset=True)
  if not body:
    raise HTTPException(status_code=400, detail='No hay campos para actualizar.')
  body['updated_at'] = utc_now_iso()

  rows = _service_rest_request('PATCH', f'proyectos?id=eq.{proyecto_id}', json_body=body)
  if not rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  row = rows[0]
  documentos = _service_rest_get(f'proyecto_documentos?proyecto_id=eq.{proyecto_id}&select=id')
  tareas = _service_rest_get(
    f'proyecto_tareas?proyecto_id=eq.{proyecto_id}&estado=eq.completada&requiere_aprobacion_cliente=eq.true&select=id'
  )
  row['documentos_count'] = len(documentos)
  row['tareas_pendientes_aprobacion'] = len(tareas)
  return row


@app.post('/api/v1/proyectos/{proyecto_id}/documentos', response_model=DocumentoResponse)
async def upload_documento(
  proyecto_id: str,
  archivo: UploadFile = File(...),
  categoria: str = Form(...),
  nombre: str = Form(...),
  descripcion: str = Form(''),
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
  admin, _token = require_admin(authorization)

  proyecto_rows = _service_rest_get(f'proyectos?id=eq.{proyecto_id}&select=id')
  if not proyecto_rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  if categoria not in PROYECTO_DOC_CATEGORIAS:
    raise HTTPException(status_code=400, detail='Categoria no valida.')

  contents = await archivo.read()
  if len(contents) > PROYECTO_DOC_MAX_BYTES:
    raise HTTPException(status_code=413, detail='El archivo supera el limite de 50MB.')

  safe_nombre = nombre.strip().replace('/', '_') or 'archivo'
  # Sin prefijo "proyectos/": el nombre del bucket ya scopea esta ruta y la
  # policy de storage espera que (storage.foldername(name))[1] sea el proyecto_id.
  storage_path = f'{proyecto_id}/{categoria}/{uuid4()}_{safe_nombre}'

  client = _supabase_service_client()
  try:
    client.storage.from_(PROYECTOS_BUCKET).upload(
      storage_path,
      contents,
      file_options={'content-type': archivo.content_type or 'application/octet-stream'},
    )
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f'No se pudo subir el archivo a Storage: {exc}')

  rows = _service_rest_request(
    'POST',
    'proyecto_documentos',
    json_body={
      'proyecto_id': proyecto_id,
      'nombre': safe_nombre,
      'categoria': categoria,
      'storage_path': storage_path,
      'mime_type': archivo.content_type,
      'size_bytes': len(contents),
      'descripcion': descripcion or None,
      'uploaded_by': admin.id,
    },
  )
  if not rows:
    raise HTTPException(status_code=502, detail='Supabase no devolvio el documento creado.')
  return rows[0]


@app.get('/api/v1/proyectos/{proyecto_id}/documentos/{doc_id}/url', response_model=SignedUrlResponse)
def get_documento_url(
  proyecto_id: str,
  doc_id: str,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
  _user, token = resolve_supabase_user(authorization)

  proyecto_rows = _rest_get(f'proyectos?id=eq.{proyecto_id}&select=id', token)
  if not proyecto_rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  documento_rows = _rest_get(
    f'proyecto_documentos?id=eq.{doc_id}&proyecto_id=eq.{proyecto_id}&select=storage_path', token
  )
  if not documento_rows:
    raise HTTPException(status_code=404, detail='Documento no encontrado.')

  storage_path = documento_rows[0]['storage_path']
  client = _supabase_service_client()
  try:
    signed = client.storage.from_(PROYECTOS_BUCKET).create_signed_url(storage_path, 3600)
  except Exception:
    raise HTTPException(status_code=502, detail='No se pudo generar la URL firmada.')

  url = (signed or {}).get('signedURL') or (signed or {}).get('signedUrl') or (signed or {}).get('signed_url')
  if not url:
    raise HTTPException(status_code=502, detail='Supabase no devolvio una URL firmada valida.')

  if url.startswith('/'):
    supabase_url, _anon_key = _supabase_anon_config()
    url = f'{supabase_url}{url}'

  return {'url': url}


@app.delete('/api/v1/proyectos/{proyecto_id}/documentos/{doc_id}')
def delete_documento(
  proyecto_id: str,
  doc_id: str,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, bool]:
  require_admin(authorization)

  rows = _service_rest_get(f'proyecto_documentos?id=eq.{doc_id}&proyecto_id=eq.{proyecto_id}&select=*')
  if not rows:
    raise HTTPException(status_code=404, detail='Documento no encontrado.')
  documento = rows[0]

  client = _supabase_service_client()
  try:
    client.storage.from_(PROYECTOS_BUCKET).remove([documento['storage_path']])
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f'No se pudo eliminar el archivo de Storage: {exc}')

  _service_rest_request('DELETE', f'proyecto_documentos?id=eq.{doc_id}', prefer='return=minimal')
  return {'ok': True}


@app.post('/api/v1/proyectos/{proyecto_id}/tareas', response_model=TareaResponse)
def create_tarea(
  proyecto_id: str,
  payload: TareaCreateRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
  require_admin(authorization)

  proyecto_rows = _service_rest_get(f'proyectos?id=eq.{proyecto_id}&select=id')
  if not proyecto_rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  rows = _service_rest_request(
    'POST',
    'proyecto_tareas',
    json_body={
      'proyecto_id': proyecto_id,
      'titulo': payload.titulo.strip(),
      'descripcion': payload.descripcion,
      'requiere_aprobacion_cliente': payload.requiere_aprobacion_cliente,
    },
  )
  if not rows:
    raise HTTPException(status_code=502, detail='Supabase no devolvio la tarea creada.')
  return rows[0]


@app.patch('/api/v1/proyectos/{proyecto_id}/tareas/{tarea_id}', response_model=TareaResponse)
def update_tarea(
  proyecto_id: str,
  tarea_id: str,
  payload: TareaUpdateRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
  user, token = resolve_supabase_user(authorization)

  proyecto_rows = _rest_get(f'proyectos?id=eq.{proyecto_id}&select=id', token)
  if not proyecto_rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  tarea_rows = _rest_get(f'proyecto_tareas?id=eq.{tarea_id}&proyecto_id=eq.{proyecto_id}&select=*', token)
  if not tarea_rows:
    raise HTTPException(status_code=404, detail='Tarea no encontrada.')
  tarea = tarea_rows[0]

  updates = payload.model_dump(exclude_unset=True)

  if not is_admin_user(user.id, token):
    if set(updates.keys()) - {'estado'}:
      raise HTTPException(status_code=403, detail='Solo puedes actualizar el estado de la tarea.')
    if updates.get('estado') != 'aprobada':
      raise HTTPException(status_code=403, detail='Solo puedes aprobar la tarea.')
    if not tarea.get('requiere_aprobacion_cliente') or tarea.get('estado') != 'completada':
      raise HTTPException(status_code=409, detail='La tarea no esta lista para ser aprobada.')
    updates = {'estado': 'aprobada', 'aprobada_por': user.id, 'aprobada_at': utc_now_iso()}

  if not updates:
    raise HTTPException(status_code=400, detail='No hay campos para actualizar.')

  rows = _service_rest_request('PATCH', f'proyecto_tareas?id=eq.{tarea_id}', json_body=updates)
  if not rows:
    raise HTTPException(status_code=404, detail='Tarea no encontrada.')
  return rows[0]


@app.post('/api/v1/proyectos/{proyecto_id}/notas', response_model=NotaResponse)
def create_nota(
  proyecto_id: str,
  payload: NotaCreateRequest,
  authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
  admin, _token = require_admin(authorization)

  proyecto_rows = _service_rest_get(f'proyectos?id=eq.{proyecto_id}&select=id')
  if not proyecto_rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  rows = _service_rest_request(
    'POST',
    'proyecto_notas',
    json_body={
      'proyecto_id': proyecto_id,
      'texto': payload.texto.strip(),
      'visible_cliente': payload.visible_cliente,
      'created_by': admin.id,
    },
  )
  if not rows:
    raise HTTPException(status_code=502, detail='Supabase no devolvio la nota creada.')
  return rows[0]


@app.delete('/api/v1/proyectos/{proyecto_id}', status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_proyecto(proyecto_id: str, authorization: Optional[str] = Header(default=None)) -> Response:
  require_admin(authorization)

  proyecto_rows = _service_rest_get(f'proyectos?id=eq.{proyecto_id}&select=id')
  if not proyecto_rows:
    raise HTTPException(status_code=404, detail='Proyecto no encontrado.')

  client = _supabase_service_client()
  paths_to_remove: List[str] = []

  try:
    subfolders = client.storage.from_(PROYECTOS_BUCKET).list(proyecto_id) or []
    for entry in subfolders:
      name = entry.get('name') if isinstance(entry, dict) else None
      if not name:
        continue

      subfolder_path = f'{proyecto_id}/{name}'
      files = client.storage.from_(PROYECTOS_BUCKET).list(subfolder_path) or []
      for file_entry in files:
        file_name = file_entry.get('name') if isinstance(file_entry, dict) else None
        if file_name:
          paths_to_remove.append(f'{subfolder_path}/{file_name}')

    if paths_to_remove:
      client.storage.from_(PROYECTOS_BUCKET).remove(paths_to_remove)
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f'No se pudo limpiar Storage antes de eliminar: {exc}')

  # proyecto_documentos, proyecto_tareas y proyecto_notas caen en cascada (on delete cascade).
  _service_rest_request('DELETE', f'proyectos?id=eq.{proyecto_id}', prefer='return=minimal')
  return Response(status_code=204)


@app.delete(
  '/api/v1/proyectos/{proyecto_id}/tareas/{tarea_id}',
  status_code=status.HTTP_204_NO_CONTENT,
  response_class=Response,
)
def delete_tarea(
  proyecto_id: str,
  tarea_id: str,
  authorization: Optional[str] = Header(default=None),
) -> Response:
  require_admin(authorization)

  tarea_rows = _service_rest_get(f'proyecto_tareas?id=eq.{tarea_id}&proyecto_id=eq.{proyecto_id}&select=id')
  if not tarea_rows:
    raise HTTPException(status_code=404, detail='Tarea no encontrada.')

  _service_rest_request('DELETE', f'proyecto_tareas?id=eq.{tarea_id}', prefer='return=minimal')
  return Response(status_code=204)
