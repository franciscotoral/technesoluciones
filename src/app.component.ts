import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';

import { ChatService } from './services/chat.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet, FormsModule],
})
export class AppComponent {
  private readonly theme = inject(ThemeService);
  readonly chat = inject(ChatService);
  readonly assistantOpen = signal(false);
  draft = '';

  readonly calendlyUrl = computed(() => {
    const cfg = (window as Window & { __TECHNE_CONFIG__?: { calendlyUrl?: string } }).__TECHNE_CONFIG__;
    return (cfg?.calendlyUrl ?? 'https://calendly.com/administracion-techneconstrucciones').trim();
  });

  toggleAssistant() {
    this.assistantOpen.set(!this.assistantOpen());
  }

  closeAssistant() {
    this.assistantOpen.set(false);
  }

  sendMessage() {
    this.chat.send(this.draft);
    this.draft = '';
  }

  openBooking() {
    const url = this.calendlyUrl();
    const calendly = (window as Window & {
      Calendly?: { initPopupWidget: (cfg: { url: string }) => void };
    }).Calendly;

    if (calendly?.initPopupWidget) {
      calendly.initPopupWidget({ url });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
