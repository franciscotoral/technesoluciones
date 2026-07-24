import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

interface CapabilitiesApiResponse {
  user_id: string;
  email: string | null;
  capabilities: string[];
}

@Injectable({ providedIn: 'root' })
export class CapabilitiesService {
  private readonly auth = inject(AuthService);

  private readonly capabilitiesSignal = signal<string[]>([]);
  readonly capabilities = this.capabilitiesSignal.asReadonly();

  private loaded = false;
  private inFlight: Promise<string[]> | null = null;

  constructor() {
    effect(() => {
      this.auth.userId();
      this.clearCache();
    });
  }

  async getCapabilities(): Promise<string[]> {
    if (this.loaded) return this.capabilitiesSignal();
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchCapabilities();
    try {
      const result = await this.inFlight;
      this.capabilitiesSignal.set(result);
      this.loaded = true;
      return result;
    } finally {
      this.inFlight = null;
    }
  }

  hasModule(key: string): boolean {
    return this.capabilitiesSignal().includes(key);
  }

  clearCache(): void {
    this.loaded = false;
    this.inFlight = null;
    this.capabilitiesSignal.set([]);
  }

  private async fetchCapabilities(): Promise<string[]> {
    const token = this.auth.accessToken();
    if (!token) return [];

    try {
      const response = await fetch('/api/v1/me/capabilities', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];

      const payload = (await response.json()) as Partial<CapabilitiesApiResponse>;
      return Array.isArray(payload.capabilities) ? payload.capabilities : [];
    } catch {
      return [];
    }
  }
}
