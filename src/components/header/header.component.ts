import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink],
})
export class HeaderComponent {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  onLogout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
