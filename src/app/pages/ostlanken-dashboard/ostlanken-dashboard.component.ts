import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AgentRun,
  Licitacion,
  Noticia,
  Oportunidad,
  OstlankenService,
  OstlankenFilters,
} from '../../services/ostlanken.service';
import { FooterComponent } from '../../../components/footer/footer.component';
import { HeaderComponent } from '../../../components/header/header.component';

interface TramoFase {
  fase: string;
  estado: 'planificado' | 'en progreso' | 'licitacion' | 'finalizado';
  progreso: number;
  hito: string;
}

interface TramoMapa {
  id: string;
  nombre: string;
  posicion: { x: number; y: number };
  fases: TramoFase[];
  enlace: string;
  resumen: string;
}

@Component({
  selector: 'app-ostlanken-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, HeaderComponent, FooterComponent],
  templateUrl: './ostlanken-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OstlankenDashboardComponent implements OnInit, OnDestroy {
  readonly licitaciones = signal<Licitacion[]>([]);
  readonly noticias = signal<Noticia[]>([]);
  readonly oportunidades = signal<Oportunidad[]>([]);
  readonly agentRuns = signal<AgentRun[]>([]);
  readonly error = signal<string | null>(null);
  readonly warning = signal<string | null>(null);

  readonly tramoFilter = signal('');
  readonly estadoFilter = signal('');
  readonly searchFilter = signal('');
  readonly selectedMapTramo = signal('jarna-norrkoping');
  readonly hoveredMapTramo = signal<string | null>(null);

  readonly mapTramos: TramoMapa[] = [
    {
      id: 'jarna-norrkoping',
      nombre: 'Jarna - Norrkoping',
      posicion: { x: 130, y: 80 },
      enlace: 'Diseno + procurement',
      resumen: 'Tramo con madurez temprana y mayor densidad de paquetes de salida.',
      fases: [
        { fase: 'Planificacion tecnica', estado: 'finalizado', progreso: 100, hito: 'Base de diseno completada' },
        { fase: 'Permisos y compliance', estado: 'en progreso', progreso: 68, hito: 'Revision ambiental activa' },
        { fase: 'Paquetes de licitacion', estado: 'licitacion', progreso: 40, hito: 'Ronda de contratistas Q2' },
      ],
    },
    {
      id: 'norrkoping-linkoping',
      nombre: 'Norrkoping - Linkoping',
      posicion: { x: 260, y: 170 },
      enlace: 'BIM + QA',
      resumen: 'Zona de coordinacion tecnica y preparacion de obras con foco operativo.',
      fases: [
        { fase: 'Ingenieria de detalle BIM', estado: 'en progreso', progreso: 55, hito: 'Coordinacion MEP y estructuras' },
        { fase: 'Obras preparatorias', estado: 'planificado', progreso: 25, hito: 'Inicio previsto siguiente semestre' },
        { fase: 'Control de calidad', estado: 'planificado', progreso: 15, hito: 'Plan de inspeccion en aprobacion' },
      ],
    },
    {
      id: 'nodos-estrategicos',
      nombre: 'Nodos estrategicos',
      posicion: { x: 390, y: 95 },
      enlace: 'Actores + digitalizacion',
      resumen: 'Foco en ecosistema, nodos decisores y despliegue de inteligencia comercial.',
      fases: [
        { fase: 'Integracion digital', estado: 'en progreso', progreso: 62, hito: 'Cuadro de mando de riesgos' },
        { fase: 'Gestiones con actores', estado: 'licitacion', progreso: 35, hito: 'Nuevas oportunidades para consorcios' },
        { fase: 'Despliegue operativo', estado: 'planificado', progreso: 18, hito: 'Roadmap PMO y QA' },
      ],
    },
  ];

  readonly groupedOportunidades = computed(() => {
    const groups = new Map<string, Oportunidad[]>();
    for (const oportunidad of this.oportunidades()) {
      const key = oportunidad.tipo || 'general';
      const list = groups.get(key) ?? [];
      list.push(oportunidad);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  readonly latestRun = computed(() => this.agentRuns()[0] ?? null);
  readonly selectedTramoDetail = computed(() => {
    const tramo = this.mapTramos.find((item) => item.id === this.selectedMapTramo()) ?? this.mapTramos[0];
    const licitaciones = this.licitaciones().filter((item) =>
      (item.tramo ?? '').toLowerCase().includes(tramo.nombre.toLowerCase().split(' - ')[0].toLowerCase())
    ).length;
    const oportunidades = this.oportunidades().filter((item) =>
      (item.tramo ?? '').toLowerCase().includes(tramo.nombre.toLowerCase().split(' - ')[0].toLowerCase())
    ).length;
    const avgProgress = Math.round(
      tramo.fases.reduce((sum, fase) => sum + fase.progreso, 0) / Math.max(tramo.fases.length, 1)
    );
    return { tramo, licitaciones, oportunidades, avgProgress };
  });
  readonly mapLegend = [
    { label: 'Finalizado', color: 'bg-emerald-400' },
    { label: 'En progreso', color: 'bg-cyan-400' },
    { label: 'Licitacion', color: 'bg-amber-400' },
    { label: 'Planificado', color: 'bg-slate-400' },
  ];

  private unsubscribeRealtime: (() => void) | null = null;

  constructor(readonly ostlanken: OstlankenService) {}

  async ngOnInit(): Promise<void> {
    await this.refreshAll();
    this.unsubscribeRealtime = this.ostlanken.subscribeToRealtime(() => {
      void this.refreshAll();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeRealtime?.();
  }

  async applyFilters(): Promise<void> {
    await this.loadLicitaciones();
  }

  async refreshAll(): Promise<void> {
    this.error.set(null);
    this.warning.set(null);
    const results = await Promise.allSettled([
      this.ostlanken.loadStats(),
      this.loadLicitaciones(),
      this.loadNoticias(),
      this.loadOportunidades(),
      this.loadRuns(),
    ]);

    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (!failures.length) return;

    const missingTable = failures.some((result) => this.isSchemaMissingError(result.reason));
    if (missingTable) {
      this.warning.set(
        'Faltan tablas del esquema Ostlanken en Supabase. Ejecuta supabase/ostlanken_intelligence.sql en SQL Editor.'
      );
      return;
    }

    this.error.set((failures[0].reason as Error)?.message ?? 'No se pudieron cargar los datos de Ostlanken.');
  }

  formatAgentStatus(run: AgentRun | null): string {
    if (!run) return 'sin datos';
    return run.status;
  }

  selectMapTramo(tramoId: string): void {
    this.selectedMapTramo.set(tramoId);
  }

  setHoveredMapTramo(tramoId: string | null): void {
    this.hoveredMapTramo.set(tramoId);
  }

  faseBadgeClass(estado: TramoFase['estado']): string {
    if (estado === 'finalizado') return 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50';
    if (estado === 'en progreso') return 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50';
    if (estado === 'licitacion') return 'bg-amber-500/20 text-amber-100 border-amber-400/50';
    return 'bg-slate-500/30 text-slate-200 border-slate-300/50';
  }

  tramoStrokeClass(tramo: TramoMapa): string {
    if (this.selectedMapTramo() === tramo.id) return '#e0f2fe';
    if (this.hoveredMapTramo() === tramo.id) return '#67e8f9';
    return '#93c5fd';
  }

  tramoRadius(tramo: TramoMapa): number {
    if (this.selectedMapTramo() === tramo.id) return 16;
    if (this.hoveredMapTramo() === tramo.id) return 13;
    return 10;
  }

  tramoFill(tramo: TramoMapa): string {
    const state = this.tramoDominantState(tramo);
    if (state === 'finalizado') return '#34d399';
    if (state === 'en progreso') return '#22d3ee';
    if (state === 'licitacion') return '#fbbf24';
    return '#94a3b8';
  }

  tramoDominantState(tramo: TramoMapa): TramoFase['estado'] {
    return [...tramo.fases].sort((a, b) => b.progreso - a.progreso)[0]?.estado ?? 'planificado';
  }

  private async loadLicitaciones(): Promise<void> {
    const filters: OstlankenFilters = {
      tramo: this.tramoFilter().trim() || undefined,
      estado: this.estadoFilter().trim() || undefined,
      search: this.searchFilter().trim() || undefined,
    };
    this.licitaciones.set(await this.ostlanken.getLicitaciones(filters));
  }

  private async loadNoticias(): Promise<void> {
    this.noticias.set(await this.ostlanken.getNoticias({ minScore: 5, limit: 30 }));
  }

  private async loadOportunidades(): Promise<void> {
    this.oportunidades.set(await this.ostlanken.getOportunidades({ limit: 60 }));
  }

  private async loadRuns(): Promise<void> {
    this.agentRuns.set(await this.ostlanken.getAgentRuns(10));
  }

  private isSchemaMissingError(error: unknown): boolean {
    const message = (error as Error)?.message?.toLowerCase?.() ?? '';
    return message.includes('could not find the table') || message.includes('schema cache');
  }
}
