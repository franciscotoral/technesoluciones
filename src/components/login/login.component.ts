import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent],
})
export class LoginComponent {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  async onSubmit(event: Event, email: string, password: string) {
    event.preventDefault();
    this.errorMessage.set(null);

    if (!this.auth.hasConfig()) {
      this.errorMessage.set(
        this.i18n.lang() === 'es'
          ? 'Configura Supabase en index.html para activar el login.'
          : 'Configure Supabase in index.html to enable login.'
      );
      return;
    }

    this.loading.set(true);
    const result = await this.auth.login(email, password);
    this.loading.set(false);

    if (!result.ok) {
      this.errorMessage.set(
        result.error ?? (this.i18n.lang() === 'es' ? 'No se pudo iniciar sesión.' : 'Could not sign in.')
      );
      return;
    }

    this.router.navigateByUrl(this.getRedirectUrl());
  }

  private getRedirectUrl(): string {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    return redirect && redirect.startsWith('/') ? redirect : '/portal';
  }
}
