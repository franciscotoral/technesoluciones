import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent],
})
export class LoginComponent {
  readonly submitted = signal(false);
  readonly i18n = inject(LanguageService);

  onSubmit(event: Event) {
    event.preventDefault();
    this.submitted.set(true);
  }
}
