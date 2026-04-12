import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagnosticoService } from './diagnostico.service';
import { DiagnosticoForm, DiagnosticoResult, Screen } from './diagnostico.model';
import { HeaderComponent } from '../../../components/header/header.component';
import { FooterComponent } from '../../../components/footer/footer.component';

@Component({
  selector: 'app-diagnostico',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, FooterComponent],
  templateUrl: './diagnostico.component.html',
  styleUrl: './diagnostico.component.css'
})
export class DiagnosticoComponent {
  private svc = inject(DiagnosticoService);

  screen = signal<Screen>('intro');
  emailSent = signal(false);
  error = signal('');
  email = '';
  result = signal<DiagnosticoResult | null>(null);

  form: DiagnosticoForm = {
    empresa: '', sector: '', sectorCustom: '',
    actividad: '', empleados: '', certs: [],
    docState: '', urgencia: 2, problemas: [], extra: ''
  };

  sectores = [
    { val: 'construccion', label: 'Construcción' },
    { val: 'fabricacion', label: 'Fabricación industrial' },
    { val: 'quimica', label: 'Química / farmacéutica' },
    { val: 'seguridad', label: 'Seguridad privada / defensa' },
    { val: 'alimentacion', label: 'Alimentación' },
    { val: 'logistica', label: 'Logística / transporte' },
    { val: 'tratamiento_superficies', label: 'Tratamiento de superficies' },
    { val: 'residuos', label: 'Gestión de residuos' },
    { val: 'otro', label: 'Otro' }
  ];

  empleadosOpts = ['1–5', '6–25', '26–100', 'Más de 100'];

  certOpts = [
    { val: 'ninguna', label: 'Ninguna' },
    { val: 'iso9001', label: 'ISO 9001' },
    { val: 'iso14001', label: 'ISO 14001' },
    { val: 'ce', label: 'Marcado CE' },
    { val: 'otras', label: 'Otras' }
  ];

  docOpts = [
    { val: 'nada', label: 'Sin documentación formal' },
    { val: 'basica', label: 'Documentación básica' },
    { val: 'parcial', label: 'Sistema parcialmente implantado' },
    { val: 'madura', label: 'Sistema maduro, necesito actualizar' }
  ];

  problemaOpts = [
    { val: 'clientes_exigen', label: 'Clientes exigen certificación' },
    { val: 'residuos', label: 'Gestión de residuos sin protocolo' },
    { val: 'producto_ce', label: 'Producto sin marcado CE' },
    { val: 'dop', label: 'Sin Declaración de Prestaciones' },
    { val: 'multas', label: 'Riesgo de multas por inspección' },
    { val: 'auditoria', label: 'Auditoría próxima' },
    { val: 'proveedores', label: 'Proveedores no cumplen requisitos' },
    { val: 'medioambiente', label: 'Obligaciones medioambientales' },
    { val: 'epi', label: 'Equipos de protección al fin de vida' }
  ];

  urgenciaLabel(): string {
    const labels: Record<number, string> = {
      1: 'Muy baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Crítica'
    };
    return labels[this.form.urgencia];
  }

  selectSingle(field: keyof DiagnosticoForm, val: string) {
    (this.form as any)[field] = val;
  }

  toggleMulti(field: 'certs' | 'problemas', val: string) {
    const arr = this.form[field] as string[];
    const idx = arr.indexOf(val);
    idx === -1 ? arr.push(val) : arr.splice(idx, 1);
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
    this.svc.generar(this.form).subscribe({
      next: (result) => {
        this.result.set(result);
        this.screen.set('report');
      },
      error: () => {
        this.error.set('Error al generar el diagnóstico. Inténtalo de nuevo.');
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
