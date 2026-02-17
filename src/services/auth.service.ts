import { computed, Injectable, signal } from '@angular/core';

interface TechneConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

interface SupabaseAuthUser {
  id: string;
  email?: string;
}

interface SupabaseSignInResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseAuthUser;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
}

interface SignInResult {
  ok: boolean;
  error?: string;
}

interface ResolvedConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

declare global {
  interface Window {
    __TECHNE_CONFIG__?: TechneConfig;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'techne_auth_session';
  private readonly expiryGraceMs = 10_000;

  readonly session = signal<StoredSession | null>(this.readStoredSession());
  readonly isAuthenticated = computed(() => {
    const session = this.session();
    if (!session) return false;
    return session.expiresAt > Date.now() + this.expiryGraceMs;
  });
  readonly userEmail = computed(() => this.session()?.email ?? null);
  readonly userId = computed(() => this.session()?.userId ?? null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly hasConfig = computed(() => {
    const config = this.resolveConfig();
    return Boolean(config.supabaseUrl && config.supabaseAnonKey);
  });

  constructor() {
    if (!this.isAuthenticated() && this.session()) {
      this.clearSession();
    }
  }

  async login(email: string, password: string): Promise<SignInResult> {
    const safeEmail = email.trim().toLowerCase();
    if (!safeEmail || !password) {
      return { ok: false, error: 'Email y contrasena son obligatorios.' };
    }

    const config = this.resolveConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      return { ok: false, error: 'Falta configuracion de Supabase en index.html.' };
    }

    const authUrl = `${config.supabaseUrl}/auth/v1/token?grant_type=password`;

    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: safeEmail,
          password,
        }),
      });

      const payload = (await response.json()) as Partial<SupabaseSignInResponse> & {
        error_description?: string;
        msg?: string;
      };

      if (!response.ok || !payload.access_token || !payload.refresh_token || !payload.user?.id || !payload.expires_in) {
        return {
          ok: false,
          error: payload.error_description ?? payload.msg ?? 'Credenciales invalidas o acceso no habilitado.',
        };
      }

      const nextSession: StoredSession = {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: Date.now() + payload.expires_in * 1000,
        userId: payload.user.id,
        email: payload.user.email ?? safeEmail,
      };

      this.session.set(nextSession);
      this.persistSession(nextSession);
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servicio de autenticacion.' };
    }
  }

  logout() {
    this.clearSession();
  }

  getSupabaseConfig(): ResolvedConfig | null {
    const config = this.resolveConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
    return config;
  }

  private resolveConfig(): ResolvedConfig {
    const config = window.__TECHNE_CONFIG__ ?? {};
    return {
      supabaseUrl: (config.supabaseUrl ?? '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: (config.supabaseAnonKey ?? '').trim(),
    };
  }

  private readStoredSession(): StoredSession | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed.expiresAt || !parsed.accessToken || !parsed.userId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private persistSession(session: StoredSession) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }

  private clearSession() {
    this.session.set(null);
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }
}
