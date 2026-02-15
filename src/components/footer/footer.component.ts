import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class FooterComponent {
  readonly currentYear = new Date().getFullYear();
  readonly i18n = inject(LanguageService);
}
