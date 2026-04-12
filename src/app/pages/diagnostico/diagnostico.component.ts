import { Component, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagnosticoService } from './diagnostico.service';
import { DiagnosticoForm, DiagnosticoResult, Screen } from './diagnostico.model';
import { HeaderComponent } from '../../../components/header/header.component';
import { FooterComponent } from '../../../components/footer/footer.component';
import { LanguageService } from '../../../services/language.service';

@Component({
  selector: 'app-diagnostico',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, FooterComponent],
  templateUrl: './diagnostico.component.html',
  styleUrl: './diagnostico.component.css'
})
export class DiagnosticoComponent implements OnDestroy {
  private svc = inject(DiagnosticoService);
  readonly i18n = inject(LanguageService);

  screen = signal<Screen>('intro');
  emailSent = signal(false);
  error = signal('');
  email = '';
  result = signal<DiagnosticoResult | null>(null);

  // ── Narrative loader ──────────────────────────────────────────
  loaderStep = signal(0);
  loaderProgress = signal(0);
  private loaderInterval: number | null = null;

  readonly loaderMessages = {
    es: [
      { icon: '🏭', msg: 'Analizando sector y actividad...' },
      { icon: '📋', msg: 'Consultando normativa aplicable...' },
      { icon: '🔗', msg: 'Revisando cadena de suministro...' },
      { icon: '⚠️', msg: 'Detectando brechas regulatorias...' },
      { icon: '📄', msg: 'Redactando flujo documental...' }
    ],
    en: [
      { icon: '🏭', msg: 'Analysing sector and activity...' },
      { icon: '📋', msg: 'Checking applicable regulations...' },
      { icon: '🔗', msg: 'Reviewing supply chain...' },
      { icon: '⚠️', msg: 'Detecting regulatory gaps...' },
      { icon: '📄', msg: 'Drafting document workflow...' }
    ]
  };

  private startLoader() {
    this.loaderStep.set(0);
    this.loaderProgress.set(0);
    const totalMs = 25000;
    const stepMs  = 5000;
    const tickMs  = 100;
    let elapsed = 0;

    this.loaderInterval = window.setInterval(() => {
      elapsed += tickMs;
      const t = Math.min(elapsed / totalMs, 1);
      // ease-out quad: starts fast, decelerates toward 95%
      this.loaderProgress.set(Math.round(95 * (1 - (1 - t) * (1 - t))));
      this.loaderStep.set(Math.min(Math.floor(elapsed / stepMs), 4));
      if (elapsed >= totalMs) {
        window.clearInterval(this.loaderInterval!);
        this.loaderInterval = null;
      }
    }, tickMs);
  }

  private stopLoader() {
    if (this.loaderInterval !== null) {
      window.clearInterval(this.loaderInterval);
      this.loaderInterval = null;
    }
  }

  ngOnDestroy() { this.stopLoader(); }

  // ── Form data ─────────────────────────────────────────────────
  form: DiagnosticoForm = {
    empresa: '', sector: '', sectorCustom: '',
    actividad: '', empleados: '', certs: [],
    docState: '', urgencia: 2, problemas: [], extra: ''
  };

  sectores = [
    { val: 'construccion',            es: 'Construcción',                  en: 'Construction' },
    { val: 'fabricacion',             es: 'Fabricación industrial',        en: 'Industrial manufacturing' },
    { val: 'quimica',                 es: 'Química / farmacéutica',        en: 'Chemical / pharmaceutical' },
    { val: 'seguridad',               es: 'Seguridad privada / defensa',   en: 'Private security / defense' },
    { val: 'alimentacion',            es: 'Alimentación',                  en: 'Food industry' },
    { val: 'logistica',               es: 'Logística / transporte',        en: 'Logistics / transport' },
    { val: 'tratamiento_superficies', es: 'Tratamiento de superficies',    en: 'Surface treatment' },
    { val: 'residuos',                es: 'Gestión de residuos',           en: 'Waste management' },
    { val: 'otro',                    es: 'Otro',                          en: 'Other' }
  ];

  empleadosOpts = [
    { val: '1–5',        en: '1–5' },
    { val: '6–25',       en: '6–25' },
    { val: '26–100',     en: '26–100' },
    { val: 'Más de 100', en: 'More than 100' }
  ];

  certOpts = [
    { val: 'ninguna',  es: 'Ninguna',    en: 'None' },
    { val: 'iso9001',  es: 'ISO 9001',   en: 'ISO 9001' },
    { val: 'iso14001', es: 'ISO 14001',  en: 'ISO 14001' },
    { val: 'ce',       es: 'Marcado CE', en: 'CE Marking' },
    { val: 'otras',    es: 'Otras',      en: 'Others' }
  ];

  docOpts = [
    { val: 'nada',    es: 'Sin documentación formal',             en: 'No formal documentation' },
    { val: 'basica',  es: 'Documentación básica',                 en: 'Basic documentation' },
    { val: 'parcial', es: 'Sistema parcialmente implantado',      en: 'Partially implemented system' },
    { val: 'madura',  es: 'Sistema maduro, necesito actualizar',  en: 'Mature system, needs updating' }
  ];

  problemaOpts = [
    { val: 'clientes_exigen', es: 'Clientes exigen certificación',       en: 'Clients require certification' },
    { val: 'residuos',        es: 'Gestión de residuos sin protocolo',   en: 'Waste management without protocol' },
    { val: 'producto_ce',     es: 'Producto sin marcado CE',             en: 'Product without CE marking' },
    { val: 'dop',             es: 'Sin Declaración de Prestaciones',     en: 'No Declaration of Performance' },
    { val: 'multas',          es: 'Riesgo de multas por inspección',     en: 'Risk of fines from inspection' },
    { val: 'auditoria',       es: 'Auditoría próxima',                   en: 'Upcoming audit' },
    { val: 'proveedores',     es: 'Proveedores no cumplen requisitos',   en: 'Suppliers not meeting requirements' },
    { val: 'medioambiente',   es: 'Obligaciones medioambientales',       en: 'Environmental obligations' },
    { val: 'epi',             es: 'Equipos de protección al fin de vida', en: 'End-of-life protective equipment' }
  ];

  // ── Chain progress ────────────────────────────────────────────
  chainStep(): number {
    const map: Record<string, number> = {
      step1: 1, step2: 2, step3: 3, loading: 4, report: 4
    };
    return map[this.screen()] ?? 1;
  }

  // ── Urgencia ──────────────────────────────────────────────────
  urgenciaLabel(): string {
    const es: Record<number, string> = {
      1: 'Muy baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Crítica'
    };
    const en: Record<number, string> = {
      1: 'Very low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Critical'
    };
    return this.i18n.lang() === 'es' ? es[this.form.urgencia] : en[this.form.urgencia];
  }

  // ── Selection helpers ─────────────────────────────────────────
  selectSingle(field: keyof DiagnosticoForm, val: string) {
    (this.form as any)[field] = val;
    navigator.vibrate && navigator.vibrate(8);
  }

  toggleMulti(field: 'certs' | 'problemas', val: string) {
    const arr = this.form[field] as string[];
    const idx = arr.indexOf(val);
    idx === -1 ? arr.push(val) : arr.splice(idx, 1);
    navigator.vibrate && navigator.vibrate(8);
  }

  isSelected(field: keyof DiagnosticoForm, val: string): boolean {
    const v = this.form[field];
    return Array.isArray(v) ? v.includes(val) : v === val;
  }

  goTo(s: Screen) { this.screen.set(s); }

  step1Valid(): boolean {
    return !!this.form.sector && !!this.form.actividad.trim();
  }

  step2Valid(): boolean {
    return !!this.form.empleados && !!this.form.docState;
  }

  generate() {
    this.screen.set('loading');
    this.error.set('');
    this.startLoader();
    this.svc.generar(this.form, this.i18n.lang()).subscribe({
      next: (result) => {
        this.stopLoader();
        this.result.set(result);
        this.screen.set('report');
      },
      error: () => {
        this.stopLoader();
        this.error.set(
          this.i18n.lang() === 'es'
            ? 'Error al generar el diagnóstico. Inténtalo de nuevo.'
            : 'Error generating the assessment. Please try again.'
        );
        this.screen.set('step3');
      }
    });
  }

  submitEmail() {
    if (!this.email || !this.email.includes('@')) return;
    const r = this.result();
    if (!r) return;
    this.svc.guardarLead(this.form, this.email, r).subscribe({
      next: () => this.emailSent.set(true),
      error: () => this.emailSent.set(true)
    });
  }

  normasArray(): string[] {
    return (this.result()?.normas || '').split('|').map(n => n.trim()).filter(Boolean);
  }

  brechasArray(): string[] {
    return (this.result()?.brechas || '').split('\n').filter(Boolean);
  }

  flujoArray(): string[] {
    return (this.result()?.flujo || '').split('\n').filter(Boolean);
  }

  restart() { window.location.reload(); }
}
