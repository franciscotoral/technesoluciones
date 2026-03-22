import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FooterComponent } from '../../../components/footer/footer.component';
import { HeaderComponent } from '../../../components/header/header.component';
import { EuropeanProject } from '../../../data/european-projects.data';
import { ProjectsService } from '../../services/projects.service';
import { LanguageService } from '../../../services/language.service';

interface ProjectTypeMetric {
  type: EuropeanProject['infrastructureType'];
  count: number;
  totalBudget: number;
}

interface ServiceBadge {
  label: 'CE-Marking' | 'BIM requerido' | 'Due Diligence';
  tone: 'blue' | 'green' | 'orange';
}

@Component({
  selector: 'app-projects-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './projects-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsDashboardComponent {
  readonly i18n = inject(LanguageService);
  private readonly projectsService = inject(ProjectsService);
  readonly projects = signal<EuropeanProject[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly activeType = signal<EuropeanProject['infrastructureType'] | null>(null);
  private readonly allowedCountries: EuropeanProject['country'][] = ['Spain', 'Sweden', 'Germany', 'Denmark'];

  readonly typeMetrics = computed<ProjectTypeMetric[]>(() => {
    const byType = new Map<EuropeanProject['infrastructureType'], ProjectTypeMetric>();
    for (const project of this.marketProjects()) {
      const current = byType.get(project.infrastructureType) ?? {
        type: project.infrastructureType,
        count: 0,
        totalBudget: 0,
      };
      current.count += 1;
      current.totalBudget += project.budgetEurM;
      byType.set(project.infrastructureType, current);
    }
    return Array.from(byType.values()).sort((a, b) => {
      const order = this.typeOrder(a.type) - this.typeOrder(b.type);
      return order !== 0 ? order : b.totalBudget - a.totalBudget;
    });
  });

  readonly marketProjects = computed(() => {
    const byCountry = new Map<string, EuropeanProject[]>();
    for (const project of this.projects()) {
      if (!this.allowedCountries.includes(project.country)) continue;
      const current = byCountry.get(project.country) ?? [];
      current.push(project);
      byCountry.set(project.country, current);
    }

    return this.allowedCountries.flatMap((country) =>
      (byCountry.get(country) ?? []).sort((a, b) => a.name.localeCompare(b.name))
    );
  });

  readonly filteredProjects = computed(() => {
    const selected = this.activeType();
    const base = this.marketProjects();
    return selected ? base.filter((project) => project.infrastructureType === selected) : base;
  });

  readonly groupedByCountry = computed(() => {
    const byCountry = new Map<string, EuropeanProject[]>();
    for (const project of this.filteredProjects()) {
      const current = byCountry.get(project.country) ?? [];
      current.push(project);
      byCountry.set(project.country, current);
    }
    return this.allowedCountries
      .map((country) => ({
        country,
        items: (byCountry.get(country) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) => group.items.length > 0);
  });

  readonly totalBudget = computed(() => this.marketProjects().reduce((sum, project) => sum + project.budgetEurM, 0));
  readonly projectCount = computed(() => this.marketProjects().length);
  readonly countryCount = computed(() => this.allowedCountries.length);
  readonly sectorCount = computed(() => new Set(this.marketProjects().map((project) => project.infrastructureType)).size);

  constructor() {
    void this.loadProjects();
  }

  private async loadProjects(): Promise<void> {
    try {
      this.projects.set(await this.projectsService.getProjects());
    } catch (error) {
      this.loadError.set((error as Error).message ?? 'No se pudo cargar el portfolio europeo.');
    }
  }

  toggleTypeFilter(type: EuropeanProject['infrastructureType']): void {
    this.activeType.set(this.activeType() === type ? null : type);
  }

  formatCapex(value: number): string {
    const formatted = new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
      maximumFractionDigits: 0,
    }).format(value);
    return `€${formatted}M`;
  }

  displayTypeLabel(type: EuropeanProject['infrastructureType']): string {
    if (type === 'Energetico') return 'Energético';
    return type;
  }

  displayCountryLabel(country: string): string {
    switch (country) {
      case 'Spain':
        return '🇪🇸 España';
      case 'Sweden':
        return '🇸🇪 Suecia';
      case 'Germany':
        return '🇩🇪 Alemania';
      case 'Denmark':
        return '🇩🇰 Dinamarca';
      default:
        return country;
    }
  }

  getRequiredServices(project: EuropeanProject): ServiceBadge[] {
    return project.requiredServices.map((label) => ({
      label,
      tone:
        label === 'CE-Marking' ? 'blue' :
        label === 'BIM requerido' ? 'green' :
        'orange',
    }));
  }

  badgeClasses(tone: ServiceBadge['tone']): string {
    switch (tone) {
      case 'blue':
        return 'border-blue-400/30 bg-blue-500/10 text-blue-200';
      case 'green':
        return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
      case 'orange':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
    }
  }

  private typeOrder(type: EuropeanProject['infrastructureType']): number {
    switch (type) {
      case 'Ferroviario':
        return 0;
      case 'Puentes':
        return 1;
      case 'Hospitalario':
        return 2;
      case 'Energetico':
        return 3;
      case 'Portuario':
        return 4;
    }
  }
}
