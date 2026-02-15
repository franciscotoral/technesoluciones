import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CASE_STUDIES } from '../../data/case-studies.data';
import { LanguageService } from '../../services/language.service';

interface Service {
  nameEs: string;
  nameEn: string;
  descriptionEs: string;
  descriptionEn: string;
  icon: SafeHtml;
}

interface UiService {
  name: string;
  description: string;
  icon: SafeHtml;
}

interface Partner {
  name: string;
  logoUrl: string;
}

interface UiCaseStudy {
  slug: string;
  title: string;
  summary: string;
  imageUrl: string;
  icon: SafeHtml;
  tags?: string[];
  link?: string;
}

declare global { interface Window { Calendly?: any; } }

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink],
})
export class HomeComponent {
  private sanitizer = inject(DomSanitizer);
  readonly i18n = inject(LanguageService);

  readonly services = signal<Service[]>([
    {
      nameEs: 'CE-Marking y EAD/ETA',
      nameEn: 'CE-Marking & EAD/ETA',
      descriptionEs: 'Navegamos marcos regulatorios complejos para certificación de producto y acceso a mercado.',
      descriptionEn: 'Navigating complex regulatory landscapes for product certification and market access.',
      icon: this.sanitizer.bypassSecurityTrustHtml('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>')
    },
    {
      nameEs: 'BIM y Gemelos Digitales',
      nameEn: 'BIM & Digital Twins',
      descriptionEs: 'Creamos modelos 3D inteligentes para diseño, construcción y eficiencia operativa.',
      descriptionEn: 'Creating intelligent 3D models for design, construction, and operational efficiency.',
      icon: this.sanitizer.bypassSecurityTrustHtml('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>')
    },
    {
      nameEs: 'Dashboards IA/IoT para QA',
      nameEn: 'IA/IoT & QA Dashboards',
      descriptionEs: 'Aplicamos IA e IoT para aseguramiento de calidad en tiempo real y decisiones basadas en datos.',
      descriptionEn: 'Leveraging AI and IoT for real-time quality assurance and data-driven insights.',
      icon: this.sanitizer.bypassSecurityTrustHtml('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75 13.5 13.5m0 0a3 3 0 1 0-4.243-4.243 3 3 0 0 0 4.243 4.243Zm0 0L15.75 15.75M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0Z" /></svg>')
    },
    {
      nameEs: 'Due Diligence Técnica',
      nameEn: 'Technical Due Diligence',
      descriptionEs: 'Realizamos evaluaciones técnicas completas para decisiones de inversión y adquisición.',
      descriptionEn: 'Comprehensive technical assessments for investment and acquisition decisions.',
      icon: this.sanitizer.bypassSecurityTrustHtml('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 6.75h16.5m-16.5 3.75h16.5" /></svg>')
    },
    {
      nameEs: 'PMO e Ingeniería de Costes',
      nameEn: 'PMO & Cost Engineering',
      descriptionEs: 'Aportamos gestión experta y control económico para cumplir plazo y presupuesto.',
      descriptionEn: 'Expert project management and cost control to deliver projects on time and budget.',
      icon: this.sanitizer.bypassSecurityTrustHtml('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941" /></svg>')
    },
    {
      nameEs: 'Integración Odoo/Power BI',
      nameEn: 'Odoo/Power BI Integration',
      descriptionEs: 'Integramos ERP y analítica avanzada para cuadros de mando de negocio accionables.',
      descriptionEn: 'Seamless integration of ERP systems with powerful business intelligence dashboards.',
      icon: this.sanitizer.bypassSecurityTrustHtml('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Z" /></svg>')
    }
  ]);

  readonly uiServices = computed<UiService[]>(() =>
    this.services().map((s) => ({
      name: this.i18n.lang() === 'es' ? s.nameEs : s.nameEn,
      description: this.i18n.lang() === 'es' ? s.descriptionEs : s.descriptionEn,
      icon: s.icon,
    }))
  );

  readonly partners = signal<Partner[]>([
    { name: 'CSIC', logoUrl: 'assets/partners/csic.svg' },
    { name: 'UAM', logoUrl: 'assets/partners/uam.png' },
    { name: 'FLC', logoUrl: 'assets/partners/flc.png' },
  ]);

  readonly sectors = signal<string[]>(['Residential', 'Industrial', 'Healthcare', 'Energy']);
  readonly heroMuted = signal(true);

  readonly caseStudies = computed<UiCaseStudy[]>(() =>
    CASE_STUDIES.map((item) => ({
      slug: item.slug,
      title: this.i18n.lang() === 'es' ? item.titleEs : item.titleEn,
      summary: this.i18n.lang() === 'es' ? item.summaryEs : item.summaryEn,
      imageUrl: item.imageUrl,
      tags: item.tags,
      link: item.link,
      icon: this.sanitizer.bypassSecurityTrustHtml(item.iconSvg),
    }))
  );

  private readonly CALENDLY_URL =
    'https://calendly.com/administracion-techneconstrucciones?hide_gdpr_banner=1';

  onLogoError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    img.style.display = 'none';
  }

  toggleVideoMute(video: HTMLVideoElement) {
    video.muted = !video.muted;
    this.heroMuted.set(video.muted);
  }

  openCalendly(evt?: Event) {
    evt?.preventDefault();

    const open = () => window.Calendly?.initPopupWidget({ url: this.CALENDLY_URL });

    if (window.Calendly) {
      open();
      return;
    }

    const id = 'calendly-widget-script';
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.id = id;
      s.src = 'https://assets.calendly.com/assets/external/widget.js';
      s.async = true;
      s.onload = open;
      document.body.appendChild(s);
    } else {
      open();
    }
  }
}
