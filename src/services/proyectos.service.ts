import { Injectable, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo: 'obra_nueva' | 'rehabilitacion' | 'mantenimiento' | 'inspeccion';
  ubicacion?: string;
  cliente_user_id?: string;
  avance_pct: number;
  proximo_hito?: string;
  fecha_inicio?: string;
  fecha_prevista_fin?: string;
  estado: 'activo' | 'pausado' | 'completado';
  tareas_pendientes_aprobacion?: number;
  documentos_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Documento {
  id: string;
  proyecto_id: string;
  nombre: string;
  categoria: 'informe' | 'factura' | 'plano' | 'foto' | 'checklist' | 'contrato' | 'otro';
  storage_path: string;
  mime_type?: string;
  size_bytes?: number;
  descripcion?: string;
  created_at: string;
}

export interface Tarea {
  id: string;
  proyecto_id: string;
  titulo: string;
  descripcion?: string;
  requiere_aprobacion_cliente: boolean;
  aprobada_por?: string;
  aprobada_at?: string;
  estado: 'pendiente' | 'en_progreso' | 'completada' | 'aprobada';
  created_at: string;
}

export interface Nota {
  id: string;
  proyecto_id: string;
  texto: string;
  visible_cliente: boolean;
  created_at: string;
}

export interface ProyectoDetalle extends Proyecto {
  tareas: Tarea[];
  notas: Nota[];
  documentos: Documento[];
}

export interface ProyectoCreateInput {
  nombre: string;
  descripcion?: string | null;
  tipo: Proyecto['tipo'];
  ubicacion?: string | null;
  cliente_user_id?: string | null;
  fecha_inicio?: string | null;
  fecha_prevista_fin?: string | null;
  proximo_hito?: string | null;
}

export interface ProyectoUpdateInput {
  nombre?: string;
  descripcion?: string | null;
  tipo?: Proyecto['tipo'];
  ubicacion?: string | null;
  cliente_user_id?: string | null;
  avance_pct?: number;
  proximo_hito?: string | null;
  fecha_inicio?: string | null;
  fecha_prevista_fin?: string | null;
  estado?: Proyecto['estado'];
}

export interface TareaCreateInput {
  titulo: string;
  descripcion?: string | null;
  requiere_aprobacion_cliente?: boolean;
}

export interface TareaUpdateInput {
  titulo?: string;
  descripcion?: string | null;
  requiere_aprobacion_cliente?: boolean;
  estado?: Tarea['estado'];
}

export interface NotaCreateInput {
  texto: string;
  visible_cliente?: boolean;
}

interface ApiErrorPayload {
  detail?: string;
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class ProyectosService {
  private readonly auth = inject(AuthService);

  private readonly proyectosSignal = signal<Proyecto[]>([]);
  readonly proyectos = this.proyectosSignal.asReadonly();

  private readonly loadingSignal = signal(false);
  readonly loading = this.loadingSignal.asReadonly();

  private readonly errorSignal = signal<string | null>(null);
  readonly error = this.errorSignal.asReadonly();

  private readonly cacheTtlMs = 5 * 60 * 1000;
  private cacheLoadedAt = 0;
  private inFlight: Promise<Proyecto[]> | null = null;

  constructor() {
    effect(() => {
      this.auth.userId();
      this.clearProyectosCache();
    });
  }

  async getProyectos(): Promise<Proyecto[]> {
    const cacheAge = Date.now() - this.cacheLoadedAt;
    if (this.cacheLoadedAt && cacheAge < this.cacheTtlMs) {
      return this.proyectosSignal();
    }
    if (this.inFlight) return this.inFlight;

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.inFlight = this.request<Proyecto[]>('/api/v1/proyectos');

    try {
      const result = await this.inFlight;
      this.proyectosSignal.set(result);
      this.cacheLoadedAt = Date.now();
      return result;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'No se pudieron cargar los proyectos.');
      throw err;
    } finally {
      this.loadingSignal.set(false);
      this.inFlight = null;
    }
  }

  async getProyecto(id: string): Promise<ProyectoDetalle> {
    return this.request<ProyectoDetalle>(`/api/v1/proyectos/${encodeURIComponent(id)}`);
  }

  async getDocumentoUrl(proyectoId: string, docId: string): Promise<string> {
    const payload = await this.request<{ url: string }>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/documentos/${encodeURIComponent(docId)}/url`
    );
    return payload.url;
  }

  async aprobarTarea(proyectoId: string, tareaId: string): Promise<void> {
    await this.request<Tarea>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/tareas/${encodeURIComponent(tareaId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'aprobada' }),
      }
    );
    // avance_pct/documentos_count no cambian, pero tareas_pendientes_aprobacion si.
    this.clearProyectosCache();
  }

  async crearProyecto(data: ProyectoCreateInput): Promise<Proyecto> {
    const result = await this.request<Proyecto>('/api/v1/proyectos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    this.clearProyectosCache();
    return result;
  }

  async actualizarProyecto(id: string, data: ProyectoUpdateInput): Promise<Proyecto> {
    const result = await this.request<Proyecto>(`/api/v1/proyectos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    this.clearProyectosCache();
    return result;
  }

  async eliminarProyecto(id: string): Promise<void> {
    await this.request<void>(`/api/v1/proyectos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.clearProyectosCache();
  }

  async subirDocumento(proyectoId: string, formData: FormData): Promise<Documento> {
    const result = await this.request<Documento>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/documentos`,
      { method: 'POST', body: formData }
    );
    this.clearProyectosCache();
    return result;
  }

  async eliminarDocumento(proyectoId: string, docId: string): Promise<void> {
    await this.request<{ ok: boolean }>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/documentos/${encodeURIComponent(docId)}`,
      { method: 'DELETE' }
    );
    this.clearProyectosCache();
  }

  async crearTarea(proyectoId: string, data: TareaCreateInput): Promise<Tarea> {
    const result = await this.request<Tarea>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/tareas`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    this.clearProyectosCache();
    return result;
  }

  async actualizarTarea(proyectoId: string, tareaId: string, data: TareaUpdateInput): Promise<Tarea> {
    const result = await this.request<Tarea>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/tareas/${encodeURIComponent(tareaId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    this.clearProyectosCache();
    return result;
  }

  async eliminarTarea(proyectoId: string, tareaId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/proyectos/${encodeURIComponent(proyectoId)}/tareas/${encodeURIComponent(tareaId)}`,
      { method: 'DELETE' }
    );
    this.clearProyectosCache();
  }

  async crearNota(proyectoId: string, data: NotaCreateInput): Promise<Nota> {
    return this.request<Nota>(`/api/v1/proyectos/${encodeURIComponent(proyectoId)}/notas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  clearProyectosCache(): void {
    this.cacheLoadedAt = 0;
    this.inFlight = null;
    this.proyectosSignal.set([]);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.auth.accessToken();
    if (!token) {
      throw new Error('Sesion no valida.');
    }

    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor.');
    }

    if (!response.ok) {
      let message = 'Error al comunicarse con el servidor.';
      try {
        const payload = (await response.json()) as ApiErrorPayload;
        message = payload.detail ?? payload.error ?? payload.message ?? message;
      } catch {
        // Ignore json parsing errors; keep the generic message.
      }
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
