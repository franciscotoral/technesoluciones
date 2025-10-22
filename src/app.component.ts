import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';

interface Service {
  name: string;
  description: string;
  icon: SafeHtml;
}

interface Partner {
  name: string;
  logoUrl: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    HeaderComponent,
    FooterComponent,
  ],
})
export class AppComponent {
  private sanitizer = inject(DomSanitizer);

  readonly services = signal<Service[]>([
    {
      name: 'CE‑Marking & EAD/ETA',
      description: 'Navigating complex regulatory landscapes for product certification and market access.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`)
    },
    {
      name: 'BIM & Digital Twins',
      description: 'Creating intelligent 3D models for design, construction, and operational efficiency.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>`)
    },
    {
      name: 'IA/IoT & QA Dashboards',
      description: 'Leveraging AI and IoT for real-time quality assurance and data-driven insights.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75 13.5 13.5m0 0a3 3 0 1 0-4.243-4.243 3 3 0 0 0 4.243 4.243Zm0 0L15.75 15.75M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0Z" /></svg>`)
    },
    {
      name: 'Technical Due Diligence',
      description: 'Comprehensive technical assessments for investment and acquisition decisions.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 6.75h16.5m-16.5 3.75h16.5" /></svg>`)
    },
    {
      name: 'PMO & Cost Engineering',
      description: 'Expert project management and cost control to deliver projects on time and budget.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941" /></svg>`)
    },
    {
      name: 'Odoo/Power BI Integration',
      description: 'Seamless integration of ERP systems with powerful business intelligence dashboards.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Z" /></svg>`)
    }
  ]);

  readonly partners = signal<Partner[]>([
      { name: 'CSIC', logoUrl: 'assets/partners/csic.svg' },
      { name: 'UAM',  logoUrl: 'assets/partners/uam.png'  },
      { name: 'FLC',  logoUrl: 'assets/partners/flc.png'  },
  ]);

  readonly sectors = signal<string[]>([
    'Residential', 'Industrial', 'Healthcare', 'Energy'
  ]);
}