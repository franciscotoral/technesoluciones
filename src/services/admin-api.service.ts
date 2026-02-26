import { Injectable } from '@angular/core';

import { AuthService } from './auth.service';

export interface Tenant {
  id: string;
  name: string;
  status: string;
  created_at?: string;
}

export interface TenantDataSource {
  id: string;
  tenant_id: string;
  type: string;
  host: string;
  port: number | null;
  db_name: string;
  schema_name: string | null;
  secret_ref: string;
  status: string;
  last_tested_at: string | null;
  created_at?: string;
}

export interface TenantPipeline {
  id: string;
  tenant_id: string;
  job_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  log_ref: string | null;
  created_at?: string;
}

export interface TenantModel {
  id: string;
  tenant_id: string;
  model_name: string;
  version: string;
  status: string;
  metrics_json: Record<string, unknown>;
  artifact_ref: string;
  deployed_at: string | null;
  created_at?: string;
}

export interface CreateDataSourceInput {
  type: string;
  host: string;
  port?: number | null;
  dbName: string;
  schemaName?: string | null;
  credentials: {
    username: string;
    password: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  constructor(private readonly auth: AuthService) {}

  hasApiConfig(): boolean {
    return Boolean(this.resolveBaseUrl());
  }

  async listTenants(): Promise<Tenant[]> {
    return this.request<Tenant[]>('/admin/tenants');
  }

  async createTenant(name: string): Promise<Tenant> {
    return this.request<Tenant>('/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim() }),
    });
  }

  async listDataSources(tenantId: string): Promise<TenantDataSource[]> {
    return this.request<TenantDataSource[]>(`/admin/tenants/${encodeURIComponent(tenantId)}/datasources`);
  }

  async createDataSource(tenantId: string, input: CreateDataSourceInput): Promise<{ dataSourceId: string; status: string }> {
    return this.request<{ dataSourceId: string; status: string }>(
      `/admin/tenants/${encodeURIComponent(tenantId)}/datasources`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: input.type.trim(),
          host: input.host.trim(),
          port: input.port ?? null,
          dbName: input.dbName.trim(),
          schemaName: input.schemaName?.trim() || null,
          credentials: {
            username: input.credentials.username.trim(),
            password: input.credentials.password,
          },
        }),
      }
    );
  }

  async runPipeline(tenantId: string, jobType: string, dataSourceId?: string): Promise<{ jobId: string; status: string }> {
    return this.request<{ jobId: string; status: string }>(`/admin/tenants/${encodeURIComponent(tenantId)}/pipelines/run`, {
      method: 'POST',
      body: JSON.stringify({
        jobType: jobType.trim(),
        dataSourceId: dataSourceId?.trim() || null,
      }),
    });
  }

  async listPipelines(tenantId: string): Promise<TenantPipeline[]> {
    return this.request<TenantPipeline[]>(`/admin/tenants/${encodeURIComponent(tenantId)}/pipelines`);
  }

  async trainModel(
    tenantId: string,
    modelName: string,
    trainingConfig: Record<string, unknown>
  ): Promise<{ jobId: string; status: string }> {
    return this.request<{ jobId: string; status: string }>(`/admin/tenants/${encodeURIComponent(tenantId)}/models/train`, {
      method: 'POST',
      body: JSON.stringify({
        modelName: modelName.trim(),
        trainingConfig,
      }),
    });
  }

  async listModels(tenantId: string): Promise<TenantModel[]> {
    return this.request<TenantModel[]>(`/admin/tenants/${encodeURIComponent(tenantId)}/models`);
  }

  async deployModel(tenantId: string, modelId: string): Promise<{ ok: boolean; endpoint?: string }> {
    return this.request<{ ok: boolean; endpoint?: string }>(
      `/admin/tenants/${encodeURIComponent(tenantId)}/models/${encodeURIComponent(modelId)}/deploy`,
      {
        method: 'POST',
        body: JSON.stringify({ environment: 'prod' }),
      }
    );
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = this.resolveBaseUrl();
    const accessToken = this.auth.accessToken();

    if (!baseUrl) {
      throw new Error('No se encontro adminApiBaseUrl en window.__TECHNE_CONFIG__.');
    }

    if (!accessToken) {
      throw new Error('Sesion no valida.');
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      let message = 'Error en API admin.';
      try {
        const payload = (await response.json()) as { error?: string; message?: string };
        message = payload.error ?? payload.message ?? message;
      } catch {
        // Ignore json parsing errors.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  private resolveBaseUrl(): string {
    const runtimeConfig = (window as Window & {
      __TECHNE_CONFIG__?: { adminApiBaseUrl?: string };
    }).__TECHNE_CONFIG__;

    const raw = runtimeConfig?.adminApiBaseUrl ?? '';
    return raw.trim().replace(/\/+$/, '');
  }
}
