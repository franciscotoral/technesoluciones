import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-briefing',
  templateUrl: './briefing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, HeaderComponent, FooterComponent],
})
export class BriefingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  readonly i18n = inject(LanguageService);

  readonly submitting = signal(false);
  readonly submitOk = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly subscribeForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    country: ['', Validators.required],
    profile: ['', Validators.required],
  });

  submit() {
    this.submitOk.set(false);
    this.submitError.set(null);

    if (this.subscribeForm.invalid) {
      this.subscribeForm.markAllAsTouched();
      return;
    }

    const value = this.subscribeForm.getRawValue();
    this.submitting.set(true);

    const payload = {
      name: value.name,
      email: value.email,
      country: value.country,
      profile: value.profile,
      _subject: 'Nueva suscripción al Briefing Techne',
    };

    this.http.post('https://formsubmit.co/ajax/francisco.toral@technesoluciones.es', payload, {
      headers: { Accept: 'application/json' },
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitOk.set(true);
        this.subscribeForm.reset();
      },
      error: () => {
        this.submitting.set(false);
        this.submitError.set('No se pudo procesar la suscripción. Inténtalo de nuevo en unos minutos.');
      },
    });
  }
}
