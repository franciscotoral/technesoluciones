import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';

import { HeaderComponent } from '../../../components/header/header.component';
import { FooterComponent } from '../../../components/footer/footer.component';
import { LanguageService } from '../../../services/language.service';

@Component({
  selector: 'app-briefing-01',
  templateUrl: './briefing-01.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, HeaderComponent, FooterComponent],
})
export class Briefing01Component {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  readonly i18n = inject(LanguageService);

  readonly submitting = signal(false);
  readonly submitOk = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    inject(Title).setTitle('Briefing Normativo Europeo Q2 2026 | Techne Regulatory Briefing Nº 01');
    inject(Meta).updateTag({
      name: 'description',
      content: 'CPR 2026-2029, Digital Product Passport, EPBD, CBAM e Industrial Accelerator Act. Lo que fabricantes y contratistas deben saber este trimestre.',
    });
  }

  submit() {
    this.submitOk.set(false);
    this.submitError.set(null);

    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const value = this.emailForm.getRawValue();
    this.submitting.set(true);

    this.http.post('https://formsubmit.co/ajax/francisco.toral@technesoluciones.es', {
      email: value.email,
      _subject: 'Nueva suscripción al Briefing Techne (footer Nº 01)',
    }, {
      headers: { Accept: 'application/json' },
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitOk.set(true);
        this.emailForm.reset();
      },
      error: () => {
        this.submitting.set(false);
        this.submitError.set('No se pudo procesar. Inténtalo de nuevo.');
      },
    });
  }
}
