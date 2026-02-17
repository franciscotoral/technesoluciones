import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AdminService } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

interface AdminMetricRow {
  user_id: string;
  metric_label: string;
  metric_value: number;
  currency: string | null;
}

interface AdminProjectRow {
  user_id: string;
  name: string;
  status: string;
  budget: number | null;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent],
})
export class AdminComponent implements OnInit {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  readonly checking = signal(true);
  readonly isAdmin = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly recentMetrics = signal<AdminMetricRow[]>([]);
  readonly recentProjects = signal<AdminProjectRow[]>([]);
  readonly savingMetric = signal(false);
  readonly savingProject = signal(false);
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  async ngOnInit() {
    await this.loadAccessAndData();
  }

  async loadAccessAndData() {
    this.checking.set(true);
    this.error.set(null);
    this.info.set(null);

    try {
      const allowed = await this.admin.isAdmin();
      this.isAdmin.set(allowed);
      if (!allowed) {
        this.error.set(
          this.i18n.lang() === 'es'
            ? 'Tu cuenta no tiene permisos de administrador.'
            : 'Your account does not have administrator permissions.'
        );
        return;
      }

      await this.refreshHistory();
    } catch {
      this.error.set(
        this.i18n.lang() === 'es'
          ? 'No se pudo validar permisos admin.'
          : 'Could not validate admin permissions.'
      );
    } finally {
      this.checking.set(false);
    }
  }

  async refreshHistory() {
    const [metrics, projects] = await Promise.all([
      this.admin.getRecentMetrics(8),
      this.admin.getRecentProjects(8),
    ]);
    this.recentMetrics.set(metrics);
    this.recentProjects.set(projects);
  }

  async onCreateMetric(
    event: Event,
    userId: string,
    metricKey: string,
    metricLabel: string,
    metricValue: string,
    currency: string,
    trendPct: string
  ) {
    event.preventDefault();
    this.error.set(null);
    this.info.set(null);
    this.savingMetric.set(true);
    try {
      await this.admin.createMetric({
        userId,
        metricKey,
        metricLabel,
        metricValue: Number(metricValue),
        currency: currency || 'EUR',
        trendPct: trendPct ? Number(trendPct) : null,
      });
      this.info.set(this.i18n.lang() === 'es' ? 'Metrica creada.' : 'Metric created.');
      await this.refreshHistory();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo crear la metrica.' : 'Could not create metric.');
    } finally {
      this.savingMetric.set(false);
    }
  }

  async onCreateProject(
    event: Event,
    userId: string,
    name: string,
    status: string,
    budget: string,
    progressPct: string
  ) {
    event.preventDefault();
    this.error.set(null);
    this.info.set(null);
    this.savingProject.set(true);
    try {
      await this.admin.createProject({
        userId,
        name,
        status: status || 'active',
        budget: budget ? Number(budget) : null,
        progressPct: progressPct ? Number(progressPct) : null,
      });
      this.info.set(this.i18n.lang() === 'es' ? 'Proyecto creado.' : 'Project created.');
      await this.refreshHistory();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo crear el proyecto.' : 'Could not create project.');
    } finally {
      this.savingProject.set(false);
    }
  }

  formatMoney(value: number | null, currency: string | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  onGoPortal() {
    this.router.navigateByUrl('/portal');
  }
}
