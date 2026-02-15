import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
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

  readonly contactForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    company: [''],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  submitForm() {
    this.submitOk.set(false);
    this.submitError.set(null);

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const value = this.contactForm.getRawValue();
    this.submitting.set(true);

    const payload = {
      name: value.name,
      email: value.email,
      company: value.company,
      message: value.message,
      _subject: 'Nuevo contacto desde Techne web',
    };

    this.http.post('https://formsubmit.co/ajax/francisco.toral@technesoluciones.es', payload, {
      headers: { Accept: 'application/json' },
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitOk.set(true);
        this.contactForm.reset();
      },
      error: () => {
        this.submitting.set(false);
        this.submitError.set(this.i18n.lang() === 'es'
          ? 'No se pudo enviar ahora. Intenta de nuevo en unos minutos.'
          : 'Could not send now. Please try again in a few minutes.');
      },
    });
  }
}
