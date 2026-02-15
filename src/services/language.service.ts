import { Injectable, signal } from '@angular/core';

type Lang = 'es' | 'en';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly storageKey = 'techne_lang';

  readonly lang = signal<Lang>(this.getInitialLang());

  constructor() {
    this.applyHtmlLang(this.lang());
  }

  setLang(lang: Lang) {
    this.lang.set(lang);
    this.applyHtmlLang(lang);
    try {
      localStorage.setItem(this.storageKey, lang);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }

  private getInitialLang(): Lang {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved === 'es' || saved === 'en') return saved;
    } catch {
      // Ignore storage errors in restricted environments.
    }

    const browserLang = (navigator.language || '').toLowerCase();
    return browserLang.startsWith('es') ? 'es' : 'en';
  }

  private applyHtmlLang(lang: Lang) {
    document.documentElement.lang = lang;
  }
}
