import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { LanguageService } from '../../services/language.service';

const intents = ['demo', 'access', 'proposal', 'contact'] as const;
type Intent = typeof intents[number];
const subjects: Record<Intent, string> = {
  demo: 'Solicitud de demostración',
  access: 'Solicitud de acceso',
  proposal: 'Solicitud de propuesta',
  contact: 'Nuevo contacto',
};

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent, FooterComponent],
})
export class ContactComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  readonly i18n = inject(LanguageService);

  readonly submitting = signal(false);
  readonly submitOk = signal(false);
  readonly submitError = signal<string | null>(null);

  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;
  readonly intent = signal<Intent>(intents.includes(this.query.get('intent') as Intent) ? this.query.get('intent') as Intent : 'contact');

  readonly tools = [
    { id: 'ventanas', es: 'Huella de carbono de ventanas', en: 'Window carbon footprint' },
    { id: 'optimizacion', es: 'Optimización de producción, almacenamiento y transporte', en: 'Production, storage and transport optimisation' },
    { id: 'servicio-tecnico', es: 'Servicio técnico de cambio de producto', en: 'Technical service for product changes' },
    { id: 'otra', es: 'Otra / no lo sé todavía', en: 'Other / not sure yet' },
  ] as const;
  readonly frequencies = [
    { id: 'diaria', es: 'A diario', en: 'Daily' },
    { id: 'semanal', es: 'Semanalmente', en: 'Weekly' },
    { id: 'mensual', es: 'Mensualmente', en: 'Monthly' },
    { id: 'puntual', es: 'Puntualmente', en: 'Occasionally' },
    { id: 'por-definir', es: 'Todavía no lo sé', en: 'Not sure yet' },
  ] as const;
  readonly dataOptions = [
    { id: 'disponibles', es: 'Disponibles y organizados', en: 'Available and organised' },
    { id: 'dispersos', es: 'Disponibles, pero dispersos', en: 'Available, but scattered' },
    { id: 'parciales', es: 'Parciales', en: 'Partially available' },
    { id: 'orientacion', es: 'Necesito orientación', en: 'I need guidance' },
  ] as const;

  readonly contactForm = this.fb.group({
    company: ['', [Validators.required, Validators.minLength(2)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    tool: [this.tools.some(t => t.id === this.query.get('tool')) ? this.query.get('tool')! : '', Validators.required],
    decision: ['', [Validators.required, Validators.minLength(10)]],
    frequency: ['', Validators.required],
    dataAvailability: ['', Validators.required],
    message: [''],
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(query => {
      const intent = query.get('intent') as Intent;
      this.intent.set(intents.includes(intent) ? intent : 'contact');
      // Only an explicit tool parameter replaces the user's selection.
      if (query.has('tool')) {
        const tool = query.get('tool');
        this.contactForm.controls.tool.setValue(this.tools.some(t => t.id === tool) ? tool! : '');
      }
    });
  }

  private showSubmissionError() {
    this.submitting.set(false);
    this.submitError.set(this.i18n.lang() === 'es'
      ? 'No se pudo enviar ahora. Intenta de nuevo en unos minutos.'
      : 'Could not send now. Please try again in a few minutes.');
  }

  submitForm() {
    if (this.submitting()) return;
    this.submitOk.set(false);
    this.submitError.set(null);

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const value = this.contactForm.getRawValue();
    this.submitting.set(true);

    const intent = this.intent();
    const payload = {
      ...value,
      intent,
      _subject: `${subjects[intent]} · ${value.tool} · Techne web`,
    };

    this.http.post<{ success?: boolean | string }>('https://formsubmit.co/ajax/francisco.toral@technesoluciones.es', payload, {
      headers: { Accept: 'application/json' },
    }).subscribe({
      next: response => {
        if (response?.success !== true && response?.success !== 'true') {
          this.showSubmissionError();
          return;
        }
        this.submitting.set(false);
        this.submitOk.set(true);
        // Tracking failure must not turn an accepted request into a failed form.
        try {
          (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.('event', 'lead_request_submitted', { intent, tool: value.tool });
        } catch {
          // Submission succeeded even if analytics is unavailable.
        }
        const tool = this.contactForm.controls.tool.value ?? '';
        this.contactForm.reset({ tool });
      },
      error: () => this.showSubmissionError(),
    });
  }
}
