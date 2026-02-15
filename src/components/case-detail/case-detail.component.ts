import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CASE_STUDIES } from '../../data/case-studies.data';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-case-detail',
  templateUrl: './case-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink],
})
export class CaseDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly i18n = inject(LanguageService);

  readonly allCases = CASE_STUDIES;

  readonly slug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' }
  );

  readonly currentIndex = computed(() =>
    this.allCases.findIndex((item) => item.slug === this.slug())
  );

  readonly caseStudy = computed(() => {
    const idx = this.currentIndex();
    return idx >= 0 ? this.allCases[idx] : undefined;
  });

  readonly previousCase = computed(() => {
    const idx = this.currentIndex();
    if (idx <= 0) return null;
    return this.allCases[idx - 1];
  });

  readonly nextCase = computed(() => {
    const idx = this.currentIndex();
    if (idx < 0 || idx >= this.allCases.length - 1) return null;
    return this.allCases[idx + 1];
  });
}
