import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { InvestmentMetric, PortalDataService, PrivateProject } from '../../services/portal-data.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-portal',
  templateUrl: './portal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent],
})
export class PortalComponent implements OnInit {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly metrics = signal<InvestmentMetric[]>([]);
  readonly projects = signal<PrivateProject[]>([]);
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

  formatMoney(value: number | null, currency: string | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    const code = currency || 'EUR';
    return new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  }

  formatPercent(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    return `${value.toFixed(1)}%`;
  }
}
