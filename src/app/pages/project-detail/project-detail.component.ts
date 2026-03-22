import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { FooterComponent } from '../../../components/footer/footer.component';
import { HeaderComponent } from '../../../components/header/header.component';
import { EuropeanProject } from '../../../data/european-projects.data';
import { LanguageService } from '../../../services/language.service';
import { ProjectsService } from '../../services/projects.service';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './project-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailComponent {
  readonly i18n = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly projectsService = inject(ProjectsService);
  readonly loadedProject = signal<Awaited<ReturnType<ProjectsService['getProjectBySlug']>>>(null);

  readonly slug = toSignal(this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')), { initialValue: '' });
  readonly project = computed(() => this.loadedProject());

  constructor() {
    effect(() => {
      const slug = this.slug();
      if (!slug) {
        this.loadedProject.set(null);
        return;
      }
      void this.loadProject(slug);
    });
  }

  private async loadProject(slug: string): Promise<void> {
    this.loadedProject.set(await this.projectsService.getProjectBySlug(slug));
  }

  displayTypeLabel(type: EuropeanProject['infrastructureType']): string {
    return type === 'Energetico' ? 'Energetico' : type;
  }

  formatCapex(value: number): string {
    return new Intl.NumberFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  formatCheckedAt(value?: string): string {
    if (!value) return this.i18n.lang() === 'es' ? 'Sin verificacion reciente' : 'No recent verification';
    const date = new Date(value);
    return new Intl.DateTimeFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  serviceBadgeClass(service: EuropeanProject['requiredServices'][number]): string {
    switch (service) {
      case 'CE-Marking':
        return 'border-blue-400/30 bg-blue-500/10 text-blue-200';
      case 'BIM requerido':
        return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
      case 'Due Diligence':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
      default:
        return 'border-slate-700 bg-slate-900/50 text-slate-200';
    }
  }

  projectLens(project: EuropeanProject): { title: string; body: string } {
    const es = this.i18n.lang() === 'es';
    switch (project.infrastructureType) {
      case 'Energetico':
        return {
          title: es ? 'Lectura sectorial' : 'Sector lens',
          body: es
            ? 'La prioridad aqui es asegurar trazabilidad regulatoria, coordinacion tecnica y decision rapida sobre CAPEX, red y paquetes criticos. Techne puede entrar por due diligence, cumplimiento o cuadros de mando operativos.'
            : 'The priority here is regulatory traceability, technical coordination and fast decision-making across CAPEX, grid and critical work packages. Techne can enter through due diligence, compliance or operational dashboards.',
        };
      case 'Hospitalario':
        return {
          title: es ? 'Lectura sectorial' : 'Sector lens',
          body: es
            ? 'En hospitalario, el riesgo esta en la coordinacion documental, la gobernanza BIM, la puesta en marcha y la consistencia entre requisitos clinicos, obra e instalaciones.'
            : 'In healthcare, risk concentrates around document coordination, BIM governance, commissioning and consistency between clinical requirements, construction and building systems.',
        };
      case 'Puentes':
        return {
          title: es ? 'Lectura sectorial' : 'Sector lens',
          body: es
            ? 'En puentes, la palanca principal esta en due diligence, reporting de avance, control de riesgos y vigilancia del rendimiento estructural a lo largo del programa.'
            : 'For bridge programs, the main lever is due diligence, progress reporting, risk control and structural performance monitoring across delivery.',
        };
      case 'Portuario':
        return {
          title: es ? 'Lectura sectorial' : 'Sector lens',
          body: es
            ? 'En terminales portuarias, el valor esta en integrar automatizacion, analitica operativa, gemelo digital y coordinacion entre contratistas sin perder visibilidad ejecutiva.'
            : 'In port terminals, value comes from integrating automation, operational analytics, digital twin logic and contractor coordination without losing executive visibility.',
        };
      default:
        return {
          title: es ? 'Lectura sectorial' : 'Sector lens',
          body: es
            ? 'En proyectos ferroviarios, la ventaja esta en combinar inteligencia de mercado, BIM, aseguramiento tecnico y control documental para anticipar paquetes y ventanas de entrada.'
            : 'In rail projects, the advantage lies in combining market intelligence, BIM, technical assurance and document control to anticipate packages and entry windows.',
        };
    }
  }
}
