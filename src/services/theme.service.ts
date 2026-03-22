import { Injectable, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'techne_theme';
  readonly theme = signal<AppTheme>(this.readInitialTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  setTheme(theme: AppTheme) {
    this.theme.set(theme);
    this.applyTheme(theme);
    try {
      localStorage.setItem(this.storageKey, theme);
    } catch {
      // Ignore storage errors.
    }
  }

  toggleTheme() {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private readInitialTheme(): AppTheme {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // Ignore storage errors.
    }
    return 'dark';
  }

  private applyTheme(theme: AppTheme) {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  }
}
