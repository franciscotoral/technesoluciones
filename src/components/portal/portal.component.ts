import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { InvestmentMetric, PortalDataService, PrivateProject } from '../../services/portal-data.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

type DashboardBlockId = 'summary' | 'model' | 'composition' | 'rd105' | 'timeline' | 'projects';

type DashboardVisibility = Record<DashboardBlockId, boolean>;

interface TimelinePhase {
  month: number;
  totalTn: number;
  ciLowTn: number | null;
  ciHighTn: number | null;
}

@Component({
  selector: 'app-portal',
  templateUrl: './portal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, DecimalPipe],
})
export class PortalComponent implements OnInit {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly metrics = signal<InvestmentMetric[]>([]);
  readonly projects = signal<PrivateProject[]>([]);
  readonly blockVisibility = signal<DashboardVisibility>(this.loadBlockVisibility());
  readonly selectedPhaseMonth = signal<number | null>(null);

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
  private readonly router = inject(Router);

  async ngOnInit() {
    await this.reloadData();
  }

  async reloadData() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const payload = await this.portalData.loadPortalData();
      this.metrics.set(payload.metrics);
      this.projects.set(payload.projects);
      this.ensureSelectedPhase();
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

  isBlockVisible(block: DashboardBlockId): boolean {
    return this.blockVisibility()[block];
  }

  toggleBlock(block: DashboardBlockId) {
    const next = { ...this.blockVisibility(), [block]: !this.blockVisibility()[block] };
    this.blockVisibility.set(next);
    this.persistBlockVisibility(next);
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
}
