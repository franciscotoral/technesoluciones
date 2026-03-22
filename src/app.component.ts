import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet],
})
export class AppComponent {
  private readonly theme = inject(ThemeService);
  readonly assistantOpen = signal(false);

  readonly assistantConfig = computed(() => {
    const cfg = (window as Window & {
      __TECHNE_CONFIG__?: {
        openclawWidgetUrl?: string;
        openclawChatUrl?: string;
        calendlyUrl?: string;
      };
    }).__TECHNE_CONFIG__;

    return {
      openclawWidgetUrl: (cfg?.openclawWidgetUrl ?? '').trim(),
      openclawChatUrl: (cfg?.openclawChatUrl ?? '').trim(),
      calendlyUrl: (cfg?.calendlyUrl ?? 'https://calendly.com/administracion-techneconstrucciones').trim(),
    };
  });

  toggleAssistant() {
    this.assistantOpen.set(!this.assistantOpen());
  }

  closeAssistant() {
    this.assistantOpen.set(false);
  }

  openBooking() {
    const url = this.assistantConfig().calendlyUrl;
    const calendly = (window as Window & {
      Calendly?: { initPopupWidget: (cfg: { url: string }) => void };
    }).Calendly;

    if (calendly?.initPopupWidget) {
      calendly.initPopupWidget({ url });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  openOpenClawExternal() {
    const url = this.assistantConfig().openclawChatUrl;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
