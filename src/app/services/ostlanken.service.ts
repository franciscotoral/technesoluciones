import { Injectable, signal } from '@angular/core';
import { RealtimeChannel, SupabaseClient, createClient } from '@supabase/supabase-js';

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

export interface Licitacion {
  id: string;
  external_id: string | null;
  titulo: string;
  descripcion: string | null;
  organismo: string;
  tramo: string | null;
  estado: string;
  valor_estimado_sek: number | null;
  moneda: string;
  fecha_publicacion: string | null;
  fecha_limite: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Noticia {
  id: string;
  external_id: string | null;
  titulo: string;
  resumen: string | null;
  contenido: string | null;
  fuente: string;
  url: string;
  fecha_publicacion: string | null;
  relevance_score: number;
  sentiment: string | null;
  categorias: string[];
  actores: string[];
  created_at: string;
  updated_at: string;
}

export interface Oportunidad {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  analisis: string;
  prioridad: string;
  score: number;
  estado: string;
  tramo: string | null;
  actores: string[];
  licitacion_id: string | null;
  noticia_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'ok' | 'parcial' | 'error' | 'running' | string;
  stats: Record<string, number>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  activeTenders: number;
  liveContracts: number;
  highPriorityOpportunities: number;
  newsThisWeek: number;
}

export interface OstlankenFilters {
  tramo?: string;
  estado?: string;
  search?: string;
  tipo?: string;
  minScore?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class OstlankenService {
  readonly loading = signal(false);
  readonly lastSync = signal<Date | null>(null);
  readonly stats = signal<DashboardStats>({
    activeTenders: 0,
    liveContracts: 0,
    highPriorityOpportunities: 0,
    newsThisWeek: 0,
  });

  private readonly runtimeConfig = this.resolveConfig();
  private readonly isConfigured = Boolean(this.runtimeConfig.supabaseUrl && this.runtimeConfig.supabaseAnonKey);
  private readonly supabase: SupabaseClient | null = this.isConfigured
    ? createClient(this.runtimeConfig.supabaseUrl, this.runtimeConfig.supabaseAnonKey)
    : null;
  private readonly realtimeListeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;

  constructor() {
    this.initRealtime();
  }

  async loadStats(): Promise<DashboardStats> {
    this.loading.set(true);
    try {
      const weekStart = new Date();
      const day = weekStart.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      weekStart.setDate(weekStart.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      const client = this.getClient();
      const [activeTendersRes, liveContractsRes, highPriorityRes, newsWeekRes] = await Promise.all([
        client.from('licitaciones').select('id', { count: 'exact', head: true }).eq('estado', 'abierta'),
        client.from('contratos').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
        client
          .from('oportunidades')
          .select('id', { count: 'exact', head: true })
          .in('prioridad', ['alta', 'high']),
        client
          .from('noticias')
          .select('id', { count: 'exact', head: true })
          .gte('fecha_publicacion', weekStart.toISOString()),
      ]);

      this.throwOnError(activeTendersRes.error);
      this.throwOnError(liveContractsRes.error);
      this.throwOnError(highPriorityRes.error);
      this.throwOnError(newsWeekRes.error);

      const stats: DashboardStats = {
        activeTenders: activeTendersRes.count ?? 0,
        liveContracts: liveContractsRes.count ?? 0,
        highPriorityOpportunities: highPriorityRes.count ?? 0,
        newsThisWeek: newsWeekRes.count ?? 0,
      };
      this.stats.set(stats);
      this.lastSync.set(new Date());
      return stats;
    } finally {
      this.loading.set(false);
    }
  }

  async getLicitaciones(filters: OstlankenFilters = {}): Promise<Licitacion[]> {
    const client = this.getClient();
    let query = client
      .from('licitaciones')
      .select('*')
      .order('fecha_publicacion', { ascending: false, nullsFirst: false });

    if (filters.tramo) query = query.eq('tramo', filters.tramo);
    if (filters.estado) query = query.eq('estado', filters.estado);
    if (filters.search?.trim()) query = query.or(`titulo.ilike.%${filters.search}%,descripcion.ilike.%${filters.search}%`);
    if (filters.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    this.throwOnError(error);
    this.lastSync.set(new Date());
    return (data ?? []) as Licitacion[];
  }

  async getNoticias(filters: OstlankenFilters = {}): Promise<Noticia[]> {
    const client = this.getClient();
    let query = client
      .from('noticias')
      .select('*')
      .order('relevance_score', { ascending: false })
      .order('fecha_publicacion', { ascending: false, nullsFirst: false });

    if (filters.minScore !== undefined) query = query.gte('relevance_score', filters.minScore);
    if (filters.search?.trim()) query = query.or(`titulo.ilike.%${filters.search}%,resumen.ilike.%${filters.search}%`);
    if (filters.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    this.throwOnError(error);
    this.lastSync.set(new Date());
    return (data ?? []) as Noticia[];
  }

  async getOportunidades(filters: OstlankenFilters = {}): Promise<Oportunidad[]> {
    const client = this.getClient();
    let query = client.from('oportunidades').select('*').order('score', { ascending: false });

    if (filters.tipo) query = query.eq('tipo', filters.tipo);
    if (filters.tramo) query = query.eq('tramo', filters.tramo);
    if (filters.search?.trim()) query = query.or(`titulo.ilike.%${filters.search}%,analisis.ilike.%${filters.search}%`);
    if (filters.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    this.throwOnError(error);
    this.lastSync.set(new Date());
    return (data ?? []) as Oportunidad[];
  }

  async getAgentRuns(limit = 10): Promise<AgentRun[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from('agent_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    this.throwOnError(error);
    this.lastSync.set(new Date());
    return (data ?? []) as AgentRun[];
  }

  subscribeToRealtime(listener: () => void): () => void {
    this.realtimeListeners.add(listener);
    return () => this.realtimeListeners.delete(listener);
  }

  formatSEK(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '--';
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      maximumFractionDigits: 0,
    }).format(value);
  }

  prioridadColor(prioridad: string | null | undefined): string {
    const normalized = (prioridad ?? '').toLowerCase();
    if (normalized === 'alta' || normalized === 'high') return 'bg-red-500/20 text-red-200 border-red-400/50';
    if (normalized === 'media' || normalized === 'medium') return 'bg-amber-500/20 text-amber-200 border-amber-400/50';
    return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50';
  }

  estadoBadge(estado: string | null | undefined): string {
    const normalized = (estado ?? '').toLowerCase();
    if (normalized === 'abierta' || normalized === 'activo' || normalized === 'ok') {
      return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50';
    }
    if (normalized === 'parcial' || normalized === 'pending' || normalized === 'running') {
      return 'bg-amber-500/20 text-amber-100 border-amber-400/50';
    }
    return 'bg-slate-500/30 text-slate-200 border-slate-300/50';
  }

  private initRealtime(): void {
    if (!this.supabase) return;
    this.channel = this.supabase
      .channel('ostlanken-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'licitaciones' }, () => this.emitRealtime())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'noticias' }, () => this.emitRealtime())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => this.emitRealtime())
      .subscribe();
  }

  private emitRealtime() {
    this.lastSync.set(new Date());
    for (const listener of this.realtimeListeners) {
      listener();
    }
  }

  private throwOnError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
  }

  private getClient(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Falta configurar Supabase en environment.ts o window.__TECHNE_CONFIG__ (index.html)');
    }
    return this.supabase;
  }

  private resolveConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
    const runtime = window.__TECHNE_CONFIG__ ?? {};
    const supabaseUrl = (environment.supabaseUrl || runtime.supabaseUrl || '').trim().replace(/\/+$/, '');
    const supabaseAnonKey = (environment.supabaseAnonKey || runtime.supabaseAnonKey || '').trim();
    return { supabaseUrl, supabaseAnonKey };
  }
}
