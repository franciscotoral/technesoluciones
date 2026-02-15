import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CASE_STUDIES } from '../../data/case-studies.data';
import { LanguageService } from '../../services/language.service';

interface UiCaseStudy {
  slug: string;
  title: string;
  summary: string;
  imageUrl: string;
  icon: SafeHtml;
  tags?: string[];
  link?: string;
}

@Component({
  selector: 'app-case-list',
  templateUrl: './case-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent, RouterLink],
})
export class CaseListComponent {
  private sanitizer = inject(DomSanitizer);
  readonly i18n = inject(LanguageService);

  readonly caseStudies = computed<UiCaseStudy[]>(() =>
    CASE_STUDIES.map((item) => ({
      slug: item.slug,
      title: this.i18n.lang() === 'es' ? item.titleEs : item.titleEn,
      summary: this.i18n.lang() === 'es' ? item.summaryEs : item.summaryEn,
      imageUrl: item.imageUrl,
      tags: item.tags,
      link: item.link,
      icon: this.sanitizer.bypassSecurityTrustHtml(item.iconSvg),
    }))
  );
}
