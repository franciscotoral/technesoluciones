import { Injectable } from '@angular/core';

import { AuthService } from './auth.service';
import { InvestmentMetric, PrivateProject } from './portal-data.service';

export interface CreateMetricInput {
  userId: string;
  metricKey: string;
  metricLabel: string;
  metricValue: number;
  currency: string;
  trendPct?: number | null;
}

export interface CreateProjectInput {
  userId: string;
  name: string;
  status: string;
  budget?: number | null;
  progressPct?: number | null;
}

interface MetricRow extends InvestmentMetric {
  user_id: string;
  created_at: string;
}

interface ProjectRow extends PrivateProject {
  user_id: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly auth: AuthService) {}

  async isAdmin(): Promise<boolean> {
    const config = this.auth.getSupabaseConfig();
    const accessToken = this.auth.accessToken();
    const userId = this.auth.userId();
    if (!config || !accessToken || !userId) return false;

    const url =
      `${config.supabaseUrl}/rest/v1/admin_users` +
      `?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;

    const response = await fetch(url, {
      headers: this.buildHeaders(accessToken, config.supabaseAnonKey),
    });

    if (!response.ok) return false;
    const rows = (await response.json()) as Array<{ user_id: string }>;
    return rows.length > 0;
  }

  async createMetric(input: CreateMetricInput): Promise<void> {
    const { config, accessToken } = this.requireAuth();
    const url = `${config.supabaseUrl}/rest/v1/investment_metrics`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(accessToken, config.supabaseAnonKey),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: input.userId.trim(),
        metric_key: input.metricKey.trim(),
        metric_label: input.metricLabel.trim(),
        metric_value: input.metricValue,
        currency: input.currency.trim().toUpperCase() || 'EUR',
        trend_pct: input.trendPct ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error('No se pudo guardar la metrica.');
    }
  }

  async createProject(input: CreateProjectInput): Promise<void> {
    const { config, accessToken } = this.requireAuth();
    const url = `${config.supabaseUrl}/rest/v1/private_projects`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(accessToken, config.supabaseAnonKey),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: input.userId.trim(),
        name: input.name.trim(),
        status: input.status.trim() || 'active',
        budget: input.budget ?? null,
        progress_pct: input.progressPct ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error('No se pudo guardar el proyecto.');
    }
  }

  async getRecentMetrics(limit = 10): Promise<MetricRow[]> {
    const { config, accessToken } = this.requireAuth();
    const url =
      `${config.supabaseUrl}/rest/v1/investment_metrics` +
      '?select=user_id,metric_key,metric_label,metric_value,currency,trend_pct,as_of,created_at' +
      `&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 50))}`;
    const response = await fetch(url, {
      headers: this.buildHeaders(accessToken, config.supabaseAnonKey),
    });
    if (!response.ok) {
      throw new Error('No se pudo cargar el historial de metricas.');
    }
    return (await response.json()) as MetricRow[];
  }

  async getRecentProjects(limit = 10): Promise<ProjectRow[]> {
    const { config, accessToken } = this.requireAuth();
    const url =
      `${config.supabaseUrl}/rest/v1/private_projects` +
      '?select=user_id,name,status,budget,progress_pct,updated_at,created_at' +
      `&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 50))}`;
    const response = await fetch(url, {
      headers: this.buildHeaders(accessToken, config.supabaseAnonKey),
    });
    if (!response.ok) {
      throw new Error('No se pudo cargar el historial de proyectos.');
    }
    return (await response.json()) as ProjectRow[];
  }

  private requireAuth(): { config: { supabaseUrl: string; supabaseAnonKey: string }; accessToken: string } {
    const config = this.auth.getSupabaseConfig();
    const accessToken = this.auth.accessToken();
    if (!config || !accessToken) {
      throw new Error('Sesion no valida.');
    }
    return { config, accessToken };
  }

  private buildHeaders(accessToken: string, anonKey: string): HeadersInit {
    return {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    };
  }
}
