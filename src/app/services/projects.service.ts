import { Injectable, signal } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { EUROPEAN_PROJECTS, EuropeanProject } from '../../data/european-projects.data';
import { environment } from '../../environments/environment';

interface TechneConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

declare global {
  interface Window {
    __TECHNE_CONFIG__?: TechneConfig;
  }
}

interface ProjectRow {
  slug: string;
  name: string;
  country: string;
  city: string;
  infrastructure_type: EuropeanProject['infrastructureType'];
  status: EuropeanProject['status'];
  budget_eur_m: number;
  timeframe: string;
  summary: string;
  route: string;
  client: string;
  key_focus: string[];
  required_services?: EuropeanProject['requiredServices'];
  source_owner?: string | null;
  source_last_checked_at?: string | null;
  official_source_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  readonly loading = signal(false);
  readonly lastSync = signal<Date | null>(null);

  private readonly config = this.resolveConfig();
  private readonly supabase: SupabaseClient | null =
    this.config.supabaseUrl && this.config.supabaseAnonKey
      ? createClient(this.config.supabaseUrl, this.config.supabaseAnonKey)
      : null;

  async getProjects(): Promise<EuropeanProject[]> {
    if (!this.supabase) return EUROPEAN_PROJECTS;

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('european_projects')
        .select('*')
        .order('country')
        .order('name');

      if (error) {
        return EUROPEAN_PROJECTS;
      }

      this.lastSync.set(new Date());
      const remoteProjects = ((data ?? []) as ProjectRow[]).map((row) => ({
        slug: row.slug,
        name: row.name,
        country: row.country,
        city: row.city,
        infrastructureType: row.infrastructure_type,
        status: row.status,
        budgetEurM: Number(row.budget_eur_m ?? 0),
        timeframe: row.timeframe,
        summary: row.summary,
        route: row.route,
        client: row.client,
        keyFocus: row.key_focus ?? [],
        requiredServices: row.required_services ?? [],
        sourceOwner: row.source_owner ?? undefined,
        sourceLastCheckedAt: row.source_last_checked_at ?? undefined,
        officialSourceUrl: row.official_source_url ?? undefined,
      }));

      return this.mergeProjects(remoteProjects, EUROPEAN_PROJECTS);
    } finally {
      this.loading.set(false);
    }
  }

  async getProjectBySlug(slug: string): Promise<EuropeanProject | null> {
    const projects = await this.getProjects();
    return projects.find((item) => item.slug === slug) ?? null;
  }

  private resolveConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
    const runtime = window.__TECHNE_CONFIG__ ?? {};
    return {
      supabaseUrl: (environment.supabaseUrl || runtime.supabaseUrl || '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: (environment.supabaseAnonKey || runtime.supabaseAnonKey || '').trim(),
    };
  }

  private mergeProjects(primary: EuropeanProject[], fallback: EuropeanProject[]): EuropeanProject[] {
    const merged = new Map<string, EuropeanProject>();
    for (const project of fallback) merged.set(project.slug, project);
    for (const project of primary) {
      const existing = merged.get(project.slug);
      merged.set(project.slug, {
        ...(existing ?? project),
        ...project,
        requiredServices:
          project.requiredServices.length > 0
            ? project.requiredServices
            : (existing?.requiredServices ?? []),
      });
    }
    return Array.from(merged.values());
  }
}
