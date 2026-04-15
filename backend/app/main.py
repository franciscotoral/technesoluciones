from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


def _build_user_prompt(req: DiagnosticoRequest) -> str:
  sector_label = req.sector_custom if req.sector == 'otro' and req.sector_custom else req.sector
  certs = ', '.join(req.certs) if req.certs else 'ninguna'
  problemas = ', '.join(req.problemas) if req.problemas else 'no especificados'
  urgencia_map = {1: 'muy baja', 2: 'baja', 3: 'media', 4: 'alta', 5: 'crítica'}
  return (
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
  raw = message.content[0].text.strip()
  # Extraer JSON — Claude a veces envuelve en ```json ... ```
  start = raw.find('{')
  end = raw.rfind('}') + 1
  if start == -1 or end == 0:
    raise HTTPException(status_code=500, detail='Respuesta inesperada del modelo.')
  try:
    data = json.loads(raw[start:end])
  except json.JSONDecodeError as e:
    raise HTTPException(status_code=500, detail=f'JSON inválido: {e}')

  return DiagnosticoResponse(ok=True, result=DiagnosticoResult(**data))


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


# ══════════════════════════════════════════════════════════════════════════════

def ensure_tenant_exists(tenant_id: str) -> None:
  if not any(t['id'] == tenant_id for t in TENANTS):
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Tenant not found.')
