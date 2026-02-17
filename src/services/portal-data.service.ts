import { Injectable } from '@angular/core';

import { AuthService } from './auth.service';

export interface InvestmentMetric {
  metric_key: string;
  metric_label: string;
  metric_value: number;
  currency: string | null;
  trend_pct: number | null;
  as_of: string | null;
}

export interface PrivateProject {
  name: string;
  status: string;
  budget: number | null;
  progress_pct: number | null;
  updated_at: string | null;
}

interface PortalPayload {
  metrics: InvestmentMetric[];
  projects: PrivateProject[];
}

@Injectable({ providedIn: 'root' })
export class PortalDataService {
  constructor(private readonly auth: AuthService) {}

  async loadPortalData(): Promise<PortalPayload> {
    const config = this.auth.getSupabaseConfig();
    const accessToken = this.auth.accessToken();

    if (!config || !accessToken) {
      throw new Error('Sesion o configuracion de Supabase no disponible.');
    }

    const commonHeaders: HeadersInit = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    };

    const metricsUrl =
      `${config.supabaseUrl}/rest/v1/investment_metrics` +
      '?select=metric_key,metric_label,metric_value,currency,trend_pct,as_of' +
      '&order=as_of.desc.nullslast';

    const projectsUrl =
      `${config.supabaseUrl}/rest/v1/private_projects` +
      '?select=name,status,budget,progress_pct,updated_at' +
      '&order=updated_at.desc.nullslast';

    const [metricsResponse, projectsResponse] = await Promise.all([
      fetch(metricsUrl, { headers: commonHeaders }),
      fetch(projectsUrl, { headers: commonHeaders }),
    ]);

    if (!metricsResponse.ok || !projectsResponse.ok) {
      throw new Error('No se pudieron cargar los datos privados del portal.');
    }

    const metrics = (await metricsResponse.json()) as InvestmentMetric[];
    const projects = (await projectsResponse.json()) as PrivateProject[];

    return { metrics, projects };
  }
}
