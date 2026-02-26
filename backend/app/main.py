from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


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


def ensure_tenant_exists(tenant_id: str) -> None:
  if not any(t['id'] == tenant_id for t in TENANTS):
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Tenant not found.')
