import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { CapabilitiesService } from '../../services/capabilities.service';
import { LanguageService } from '../../services/language.service';
import { InvestmentMetric, PortalDataService, PrivateProject } from '../../services/portal-data.service';
import { Proyecto, ProyectosService } from '../../services/proyectos.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

type DashboardBlockId = 'summary' | 'model' | 'composition' | 'rd105' | 'timeline' | 'projects';
type ProjectVisualType = 'obra-nueva' | 'rehabilitacion' | 'mantenimiento' | 'inspeccion' | 'default';

interface PortalTool {
  key: string;
  name: string;
  description: string;
  icon: 'chart-bar' | 'calculator' | 'search';
  kind: 'route' | 'external';
  target: string;
  thumbnailColor: string;
  accentColor: string;
  badge: string;
}

type DashboardVisibility = Record<DashboardBlockId, boolean>;

interface TimelinePhase {
  month: number;
  totalTn: number;
  ciLowTn: number | null;
  ciHighTn: number | null;
}

declare global {
  interface Window {
    echarts?: {
      init: (el: HTMLElement) => {
        setOption: (option: unknown, opts?: { notMerge?: boolean }) => void;
        resize: () => void;
        dispose: () => void;
      };
    };
  }
}

@Component({
  selector: 'app-portal',
  templateUrl: './portal.component.html',
  styleUrls: ['./portal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, DecimalPipe, RouterLink],
})
export class PortalComponent implements OnInit, OnDestroy {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly metrics = signal<InvestmentMetric[]>([]);
  readonly projects = signal<PrivateProject[]>([]);
  readonly blockVisibility = signal<DashboardVisibility>(this.loadBlockVisibility());
  readonly selectedPhaseMonth = signal<number | null>(null);
  readonly toolsLoading = signal(true);

  readonly misProyectos = signal<Proyecto[]>([]);
  readonly misProyectosLoading = signal(true);
  readonly misProyectosError = signal<string | null>(null);

  readonly tools: PortalTool[] = [
    {
      key: 'pipeline',
      name: 'Pipeline de Construcción',
      description: 'Radar de infraestructura europea',
      icon: 'chart-bar',
      kind: 'route',
      target: '/projects',
      thumbnailColor: '#0D1F33',
      accentColor: '#378ADD',
      badge: 'Europa',
    },
    {
      key: 'calculadora',
      name: 'Calculadora de Huella de Carbono',
      description: 'Cálculo y certificación de huella CO₂',
      icon: 'calculator',
      kind: 'external',
      target: '/calculadora/',
      thumbnailColor: '#0F3D2E',
      accentColor: '#1D9E75',
      badge: 'CO₂',
    },
    {
      key: 'diagnostico',
      name: 'Diagnóstico Normativo',
      description: 'Análisis de cumplimiento normativo europeo',
      icon: 'search',
      kind: 'route',
      target: '/diagnostico',
      thumbnailColor: '#2C1A4A',
      accentColor: '#7F77DD',
      badge: 'IA',
    },
  ];

  readonly timelinePhases = computed<TimelinePhase[]>(() => {
    const list: TimelinePhase[] = [];

    for (const metric of this.metrics()) {
      const key = metric.metric_key.trim();
      const match = /^l3_m(\d{1,2})_total_tn$/i.exec(key);
      if (!match) continue;

      const month = Number(match[1]);
      const monthToken = String(month).padStart(2, '0');
      const low = this.metricByKey(`l3_m${monthToken}_ci90_low_tn`)?.metric_value ?? null;
      const high = this.metricByKey(`l3_m${monthToken}_ci90_high_tn`)?.metric_value ?? null;

      list.push({
        month,
        totalTn: Number(metric.metric_value),
        ciLowTn: low,
        ciHighTn: high,
      });
    }

    return list.sort((a, b) => a.month - b.month);
  });

  readonly activePhase = computed<TimelinePhase | null>(() => {
    const phases = this.timelinePhases();
    if (!phases.length) return null;

    const selected = this.selectedPhaseMonth();
    if (selected) {
      return phases.find((p) => p.month === selected) ?? phases[0];
    }

    return phases[0];
  });

  readonly activePhaseMetrics = computed<InvestmentMetric[]>(() => {
    const phase = this.activePhase();
    if (!phase) return [];

    const prefix = `l3_m${String(phase.month).padStart(2, '0')}_`;
    return this.metrics()
      .filter((m) => m.metric_key.startsWith(prefix) && !m.metric_key.includes('_ci90_'))
      .sort((a, b) => {
        if (a.metric_key.endsWith('_total_tn')) return -1;
        if (b.metric_key.endsWith('_total_tn')) return 1;
        return a.metric_label.localeCompare(b.metric_label);
      });
  });

  private readonly portalData = inject(PortalDataService);
  private readonly capabilities = inject(CapabilitiesService);
  private readonly proyectosService = inject(ProyectosService);
  private readonly router = inject(Router);
  private timelineChart: ReturnType<NonNullable<typeof window.echarts>['init']> | null = null;
  private compositionChart: ReturnType<NonNullable<typeof window.echarts>['init']> | null = null;

  async ngOnInit() {
    await this.reloadData();
    await this.loadTools();
  }

  ngOnDestroy() {
    this.timelineChart?.dispose();
    this.compositionChart?.dispose();
  }

  async reloadData() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const payload = await this.portalData.loadPortalData();
      this.metrics.set(payload.metrics);
      this.projects.set(payload.projects);
      this.ensureSelectedPhase();
      setTimeout(() => this.renderCharts(), 0);
    } catch {
      this.error.set(
        this.i18n.lang() === 'es'
          ? 'No pudimos cargar tus metricas privadas. Revisa tablas y politicas RLS en Supabase.'
          : 'Could not load your private metrics. Check Supabase tables and RLS policies.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  onLogout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }

  hasAccess(tool: PortalTool): boolean {
    return this.capabilities.hasModule(tool.key);
  }

  openTool(tool: PortalTool) {
    if (!this.hasAccess(tool)) return;

    if (tool.kind === 'external') {
      window.location.href = tool.target;
    } else {
      this.router.navigateByUrl(tool.target);
    }
  }

  requestAccessHref(tool: PortalTool): string {
    const subject = encodeURIComponent(`Solicitud de acceso: ${tool.name}`);
    return `mailto:francisco.toral@technesoluciones.es?subject=${subject}`;
  }

  accentRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  tieneModuloProyectos(): boolean {
    return this.capabilities.hasModule('proyectos');
  }

  async loadMisProyectos() {
    this.misProyectosLoading.set(true);
    this.misProyectosError.set(null);
    try {
      const rows = await this.proyectosService.getProyectos();
      this.misProyectos.set(rows);
    } catch (err) {
      this.misProyectosError.set(
        err instanceof Error && err.message
          ? err.message
          : this.i18n.lang() === 'es'
            ? 'No se pudieron cargar tus proyectos.'
            : 'Could not load your projects.'
      );
    } finally {
      this.misProyectosLoading.set(false);
    }
  }

  proyectoAvance(p: Proyecto): number {
    const raw = p.avance_pct;
    if (typeof raw !== 'number' || Number.isNaN(raw)) return 0;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  proyectoAprobacionesPendientes(p: Proyecto): number {
    const raw = p.tareas_pendientes_aprobacion;
    if (typeof raw !== 'number' || Number.isNaN(raw) || raw <= 0) return 0;
    return Math.floor(raw);
  }

  proyectoAprobacionesTexto(p: Proyecto): string {
    const n = this.proyectoAprobacionesPendientes(p);
    const es = this.i18n.lang() === 'es';
    if (es) return n === 1 ? '1 aprobación pendiente' : `${n} aprobaciones pendientes`;
    return n === 1 ? '1 pending approval' : `${n} pending approvals`;
  }

  proyectoTipoLabel(tipo: Proyecto['tipo']): string {
    const es = this.i18n.lang() === 'es';
    switch (tipo) {
      case 'obra_nueva':
        return es ? 'Obra nueva' : 'New construction';
      case 'rehabilitacion':
        return es ? 'Rehabilitación' : 'Renovation';
      case 'mantenimiento':
        return es ? 'Mantenimiento' : 'Maintenance';
      case 'inspeccion':
        return es ? 'Inspección' : 'Inspection';
      default:
        return tipo;
    }
  }

  projectVisualType(tipo: string | null | undefined): ProjectVisualType {
    switch (tipo) {
      case 'obra_nueva':
        return 'obra-nueva';
      case 'rehabilitacion':
        return 'rehabilitacion';
      case 'mantenimiento':
        return 'mantenimiento';
      case 'inspeccion':
        return 'inspeccion';
      default:
        return 'default';
    }
  }

  proyectoEstadoLabel(estado: Proyecto['estado']): string {
    const es = this.i18n.lang() === 'es';
    switch (estado) {
      case 'activo':
        return es ? 'Activo' : 'Active';
      case 'pausado':
        return es ? 'Pausado' : 'Paused';
      case 'completado':
        return es ? 'Completado' : 'Completed';
      default:
        return estado;
    }
  }

  proyectoEstadoBadgeClass(estado: Proyecto['estado']): string {
    switch (estado) {
      case 'activo':
        return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
      case 'pausado':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
      case 'completado':
        return 'border-blue-400/30 bg-blue-500/10 text-blue-200';
      default:
        return 'border-slate-600 bg-slate-700/30 text-slate-300';
    }
  }

  private async loadTools() {
    this.toolsLoading.set(true);
    try {
      await this.capabilities.getCapabilities();
    } finally {
      this.toolsLoading.set(false);
    }

    if (this.capabilities.hasModule('proyectos')) {
      void this.loadMisProyectos();
    }
  }

  isBlockVisible(block: DashboardBlockId): boolean {
    return this.blockVisibility()[block];
  }

  toggleBlock(block: DashboardBlockId) {
    const next = { ...this.blockVisibility(), [block]: !this.blockVisibility()[block] };
    this.blockVisibility.set(next);
    this.persistBlockVisibility(next);
    setTimeout(() => this.renderCharts(), 0);
  }

  metricByKey(key: string): InvestmentMetric | null {
    return this.metrics().find((m) => m.metric_key === key) ?? null;
  }

  compositionMetrics(): InvestmentMetric[] {
    return this.metrics()
      .filter((m) => m.metric_key.endsWith('_share_pct'))
      .sort((a, b) => (b.metric_value ?? 0) - (a.metric_value ?? 0));
  }

  rd105Metrics(): InvestmentMetric[] {
    return this.metrics().filter((m) => m.metric_key.startsWith('rd105_'));
  }

  hasTimeline(): boolean {
    return this.timelinePhases().length > 0;
  }

  selectPhase(month: number) {
    this.selectedPhaseMonth.set(month);
  }

  timelineBarWidth(value: number): string {
    const phases = this.timelinePhases();
    const max = phases.reduce((acc, p) => Math.max(acc, p.totalTn), 0);
    if (!max) return '0%';
    const pct = Math.max(4, Math.min(100, (value / max) * 100));
    return `${pct.toFixed(1)}%`;
  }

  formatPhaseMetricLabel(metric: InvestmentMetric): string {
    const phase = this.activePhase();
    if (!phase) return metric.metric_label;

    const prefix = `l3_m${String(phase.month).padStart(2, '0')}_`;
    const suffix = metric.metric_key.replace(prefix, '');

    const dictionary: Record<string, string> = {
      total_tn: 'Total fase',
      hormigon_tn: 'Hormigon',
      ceramicos_tn: 'Ceramicos',
      madera_tn: 'Madera',
      metales_tn: 'Metales',
      plasticos_tn: 'Plasticos',
      vidrio_tn: 'Vidrio',
      yeso_tn: 'Yeso',
      mixtos_tn: 'Mixtos',
      tierras_tn: 'Tierras',
    };

    return dictionary[suffix] ?? metric.metric_label;
  }

  formatMetricValue(metric: InvestmentMetric): string {
    if (metric.metric_value === null || Number.isNaN(metric.metric_value)) return '--';
    const unit = (metric.currency ?? '').trim();

    if (unit === '%') {
      const pct = metric.metric_value <= 1 ? metric.metric_value * 100 : metric.metric_value;
      return `${pct.toFixed(1)}%`;
    }

    if (this.isCurrencyCode(unit)) {
      return new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
        style: 'currency',
        currency: unit,
        maximumFractionDigits: 0,
      }).format(metric.metric_value);
    }

    const value = new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
      maximumFractionDigits: 2,
    }).format(metric.metric_value);

    return unit ? `${value} ${unit}` : value;
  }

  percentBar(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '0%';
    const pct = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
    return `${pct.toFixed(1)}%`;
  }

  formatPercent(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    return `${value.toFixed(1)}%`;
  }

  formatMoney(value: number | null, currency: string | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    const code = currency || 'EUR';
    return new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private ensureSelectedPhase() {
    const phases = this.timelinePhases();
    if (!phases.length) {
      this.selectedPhaseMonth.set(null);
      return;
    }

    const current = this.selectedPhaseMonth();
    if (current && phases.some((p) => p.month === current)) return;
    this.selectedPhaseMonth.set(phases[0].month);
  }

  private loadBlockVisibility(): DashboardVisibility {
    const defaults: DashboardVisibility = {
      summary: true,
      model: true,
      composition: true,
      rd105: true,
      timeline: true,
      projects: true,
    };

    try {
      const raw = localStorage.getItem(this.visibilityStorageKey());
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<DashboardVisibility>;
      return {
        summary: parsed.summary ?? true,
        model: parsed.model ?? true,
        composition: parsed.composition ?? true,
        rd105: parsed.rd105 ?? true,
        timeline: parsed.timeline ?? true,
        projects: parsed.projects ?? true,
      };
    } catch {
      return defaults;
    }
  }

  private persistBlockVisibility(next: DashboardVisibility) {
    try {
      localStorage.setItem(this.visibilityStorageKey(), JSON.stringify(next));
    } catch {
      // Ignore localStorage errors.
    }
  }

  private visibilityStorageKey(): string {
    return `techne_portal_blocks_${this.auth.userId() ?? 'anonymous'}`;
  }

  private isCurrencyCode(unit: string): boolean {
    return /^[A-Z]{3}$/.test(unit);
  }

  private renderCharts() {
    this.renderTimelineChart();
    this.renderCompositionChart();
  }

  private renderTimelineChart() {
    const container = document.getElementById('timeline-echart');
    const echarts = window.echarts;
    if (!container || !echarts || !this.isBlockVisible('timeline')) return;

    const phases = this.timelinePhases();
    if (!phases.length) return;

    if (!this.timelineChart) {
      this.timelineChart = echarts.init(container);
    }

    this.timelineChart.setOption(
      {
        backgroundColor: 'transparent',
        grid: { left: 30, right: 20, top: 30, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: phases.map((p) => `M${p.month}`),
          axisLabel: { color: '#cbd5e1' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#cbd5e1' },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
          {
            name: 'Total tn',
            type: 'line',
            smooth: true,
            symbolSize: 7,
            data: phases.map((p) => p.totalTn),
            lineStyle: { color: '#22d3ee', width: 3 },
            itemStyle: { color: '#22d3ee' },
            areaStyle: { color: 'rgba(34, 211, 238, 0.18)' },
          },
        ],
      },
      { notMerge: true }
    );
    this.timelineChart.resize();
  }

  private renderCompositionChart() {
    const container = document.getElementById('composition-echart');
    const echarts = window.echarts;
    if (!container || !echarts || !this.isBlockVisible('composition')) return;

    const composition = this.compositionMetrics();
    if (!composition.length) return;

    if (!this.compositionChart) {
      this.compositionChart = echarts.init(container);
    }

    this.compositionChart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: {
          bottom: 0,
          textStyle: { color: '#cbd5e1' },
        },
        series: [
          {
            type: 'pie',
            radius: ['45%', '72%'],
            center: ['50%', '45%'],
            itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
            label: { color: '#e2e8f0' },
            data: composition.map((m) => ({ name: m.metric_label, value: m.metric_value })),
          },
        ],
      },
      { notMerge: true }
    );
    this.compositionChart.resize();
  }
}
