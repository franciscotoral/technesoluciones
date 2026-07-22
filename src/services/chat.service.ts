import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../environments/environment';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(false);

  send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.loading()) return;

    const history = [...this.messages(), { role: 'user', content: trimmed } as ChatMessage];
    this.messages.set(history);
    this.loading.set(true);

    this.http.post<{ reply: string }>(`${this.base}/api/chat`, { messages: history }).subscribe({
      next: (res) => {
        this.messages.set([...this.messages(), { role: 'assistant', content: res.reply }]);
        this.loading.set(false);
      },
      error: () => {
        this.messages.set([
          ...this.messages(),
          { role: 'assistant', content: 'Ha ocurrido un error contactando con el asistente. Inténtalo de nuevo en unos segundos.' },
        ]);
        this.loading.set(false);
      },
    });
  }
}
