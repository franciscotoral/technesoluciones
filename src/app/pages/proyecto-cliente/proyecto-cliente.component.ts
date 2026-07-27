import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { FooterComponent } from '../../../components/footer/footer.component';
import { HeaderComponent } from '../../../components/header/header.component';
import { LanguageService } from '../../../services/language.service';
import { ApiError, Documento, ProyectoDetalle, ProyectosService, Tarea } from '../../../services/proyectos.service';

type TabId = 'resumen' | 'documentos' | 'checklist' | 'historial';
type DocFiltro = 'todos' | 'informe' | 'factura' | 'plano' | 'foto' | 'otros';

interface CategoriaTab {
  key: DocFiltro;
  labelEs: string;
  labelEn: string;
}

const OTROS_CATEGORIAS = new Set(['checklist', 'contrato', 'otro']);

@Component({
  selector: 'app-proyecto-cliente',
  standalone: true,
  imports: [RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './proyecto-cliente.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProyectoClienteComponent {
  readonly i18n = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly proyectosService = inject(ProyectosService);

  private readonly proyectoId: string;

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  readonly proyecto = signal<ProyectoDetalle | null>(null);

  readonly activeTab = signal<TabId>('resumen');
  readonly docFiltro = signal<DocFiltro>('todos');

  readonly openingDocIds = signal<ReadonlySet<string>>(new Set());
  readonly docOpenErrors = signal<Record<string, string>>({});

  readonly photoUrls = signal<Record<string, string>>({});
  readonly photoLoadingIds = signal<ReadonlySet<string>>(new Set());
  readonly photoErrorIds = signal<ReadonlySet<string>>(new Set());

  readonly confirmingTareaId = signal<string | null>(null);
  readonly approvingTareaId = signal<string | null>(null);
  readonly approveError = signal<string | null>(null);

  readonly tabs: ReadonlyArray<{ id: TabId; labelEs: string; labelEn: string }> = [
    { id: 'resumen', labelEs: 'Resumen', labelEn: 'Summary' },
    { id: 'documentos', labelEs: 'Documentos', labelEn: 'Documents' },
    { id: 'checklist', labelEs: 'Checklist', labelEn: 'Checklist' },
    { id: 'historial', labelEs: 'Historial', labelEn: 'History' },
  ];

  readonly categoriaTabs: ReadonlyArray<CategoriaTab> = [
    { key: 'todos', labelEs: 'Todos', labelEn: 'All' },
    { key: 'informe', labelEs: 'Informes', labelEn: 'Reports' },
    { key: 'factura', labelEs: 'Facturas', labelEn: 'Invoices' },
    { key: 'plano', labelEs: 'Planos', labelEn: 'Blueprints' },
    { key: 'foto', labelEs: 'Fotos', labelEn: 'Photos' },
    { key: 'otros', labelEs: 'Otros', labelEn: 'Other' },
  ];

  readonly avancePct = computed(() => {
    const p = this.proyecto();
    if (!p) return 0;
    return Math.max(0, Math.min(100, p.avance_pct ?? 0));
  });

  readonly tareasPendientesAprobacion = computed(() => {
    const p = this.proyecto();
    if (!p) return [];
    return p.tareas.filter((t) => t.requiere_aprobacion_cliente && t.estado === 'completada');
  });

  readonly tareasPendientesCount = computed(() => this.tareasPendientesAprobacion().length);

  readonly ultimaNotaVisible = computed(() => this.notasVisibles()[0] ?? null);

  readonly documentosFiltrados = computed(() => {
    const p = this.proyecto();
    if (!p) return [];
    const filtro = this.docFiltro();
    if (filtro === 'todos') return p.documentos;
    if (filtro === 'otros') return p.documentos.filter((d) => OTROS_CATEGORIAS.has(d.categoria));
    return p.documentos.filter((d) => d.categoria === filtro);
  });

  readonly fotos = computed(() => this.documentosFiltrados().filter((d) => d.categoria === 'foto'));
  readonly documentosNoFoto = computed(() => this.documentosFiltrados().filter((d) => d.categoria !== 'foto'));

  readonly tareasPendientesGrupo = computed(() => {
    const p = this.proyecto();
    if (!p) return [];
    return p.tareas
      .filter(
        (t) =>
          t.estado === 'pendiente' ||
          t.estado === 'en_progreso' ||
          (t.estado === 'completada' && t.requiere_aprobacion_cliente)
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  readonly tareasFinalizadasGrupo = computed(() => {
    const p = this.proyecto();
    if (!p) return [];
    return p.tareas
      .filter((t) => t.estado === 'aprobada' || (t.estado === 'completada' && !t.requiere_aprobacion_cliente))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  readonly notasVisibles = computed(() => {
    const p = this.proyecto();
    if (!p) return [];
    return p.notas
      .filter((n) => n.visible_cliente)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });

  constructor() {
    this.proyectoId = this.route.snapshot.paramMap.get('id') ?? '';

    effect(() => {
      if (this.activeTab() !== 'documentos') return;
      for (const foto of this.fotos()) {
        if (this.photoUrls()[foto.id]) continue;
        if (this.photoLoadingIds().has(foto.id)) continue;
        void this.loadPhotoUrl(foto);
      }
    });

    if (!this.proyectoId) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    void this.loadProyecto();
  }

  async loadProyecto(): Promise<void> {
    if (!this.proyectoId) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);

    try {
      const data = await this.proyectosService.getProyecto(this.proyectoId);
      this.proyecto.set(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        this.notFound.set(true);
      } else {
        this.error.set(this.extractMessage(err, 'No se pudo cargar el proyecto.', 'Could not load the project.'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  selectTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  selectDocFiltro(filtro: DocFiltro): void {
    this.docFiltro.set(filtro);
  }

  goToPortal(): void {
    this.router.navigateByUrl('/portal');
  }

  isOpeningDoc(docId: string): boolean {
    return this.openingDocIds().has(docId);
  }

  docOpenError(docId: string): string | null {
    return this.docOpenErrors()[docId] ?? null;
  }

  async abrirDocumento(doc: Documento): Promise<void> {
    if (this.openingDocIds().has(doc.id)) return;

    this.openingDocIds.set(new Set(this.openingDocIds()).add(doc.id));
    const nextErrors = { ...this.docOpenErrors() };
    delete nextErrors[doc.id];
    this.docOpenErrors.set(nextErrors);

    const nuevaVentana = window.open('', '_blank');

    try {
      const url = await this.proyectosService.getDocumentoUrl(this.proyectoId, doc.id);
      if (nuevaVentana) {
        nuevaVentana.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      nuevaVentana?.close();
      this.docOpenErrors.set({
        ...this.docOpenErrors(),
        [doc.id]: this.extractMessage(err, 'No se pudo abrir el documento.', 'Could not open the document.'),
      });
    } finally {
      const next = new Set(this.openingDocIds());
      next.delete(doc.id);
      this.openingDocIds.set(next);
    }
  }

  isPhotoLoading(docId: string): boolean {
    return this.photoLoadingIds().has(docId);
  }

  hasPhotoError(docId: string): boolean {
    return this.photoErrorIds().has(docId);
  }

  solicitarConfirmacionAprobar(tareaId: string): void {
    this.confirmingTareaId.set(tareaId);
    this.approveError.set(null);
  }

  cancelarAprobacion(): void {
    this.confirmingTareaId.set(null);
    this.approveError.set(null);
  }

  async confirmarAprobarTarea(tarea: Tarea): Promise<void> {
    this.approvingTareaId.set(tarea.id);
    this.approveError.set(null);

    try {
      await this.proyectosService.aprobarTarea(this.proyectoId, tarea.id);

      const current = this.proyecto();
      if (current) {
        this.proyecto.set({
          ...current,
          tareas: current.tareas.map((t) => (t.id === tarea.id ? { ...t, estado: 'aprobada' as const } : t)),
        });
      }

      this.confirmingTareaId.set(null);
      void this.refetchProyectoSilently();
    } catch (err) {
      this.approveError.set(this.extractMessage(err, 'No se pudo aprobar la tarea.', 'Could not approve the task.'));
    } finally {
      this.approvingTareaId.set(null);
    }
  }

  estadoBadgeClass(estado: ProyectoDetalle['estado']): string {
    switch (estado) {
      case 'activo':
        return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
      case 'pausado':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
      case 'completado':
        return 'border-blue-400/30 bg-blue-500/10 text-blue-200';
    }
  }

  estadoTextClass(estado: ProyectoDetalle['estado']): string {
    switch (estado) {
      case 'activo':
        return 'text-emerald-300';
      case 'pausado':
        return 'text-amber-300';
      case 'completado':
        return 'text-blue-300';
    }
  }

  estadoLabel(estado: ProyectoDetalle['estado']): string {
    const es = this.i18n.lang() === 'es';
    switch (estado) {
      case 'activo':
        return es ? 'Activo' : 'Active';
      case 'pausado':
        return es ? 'Pausado' : 'Paused';
      case 'completado':
        return es ? 'Completado' : 'Completed';
    }
  }

  tipoLabel(tipo: ProyectoDetalle['tipo']): string {
    const es = this.i18n.lang() === 'es';
    switch (tipo) {
      case 'obra_nueva':
        return es ? 'Obra nueva' : 'New construction';
      case 'rehabilitacion':
        return es ? 'Rehabilitación' : 'Renovation';
      case 'mantenimiento':
        return es ? 'Mantenimiento' : 'Maintenance';
      case 'inspeccion':
        return es ? 'Inspección' : 'Inspection';
    }
  }

  tareaEstadoLabel(estado: Tarea['estado']): string {
    const es = this.i18n.lang() === 'es';
    switch (estado) {
      case 'pendiente':
        return es ? 'Pendiente' : 'Pending';
      case 'en_progreso':
        return es ? 'En progreso' : 'In progress';
      case 'completada':
        return es ? 'Completada' : 'Completed';
      case 'aprobada':
        return es ? 'Aprobada' : 'Approved';
    }
  }

  bannerTexto(): string {
    const n = this.tareasPendientesCount();
    const es = this.i18n.lang() === 'es';
    if (es) {
      return n === 1 ? 'Tienes 1 tarea pendiente de tu aprobación' : `Tienes ${n} tareas pendientes de tu aprobación`;
    }
    return n === 1 ? 'You have 1 task pending your approval' : `You have ${n} tasks pending your approval`;
  }

  formatFecha(value?: string | null): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat(this.i18n.lang() === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium' }).format(date);
  }

  formatFechaHora(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  formatSize(bytes?: number | null): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  }

  private async loadPhotoUrl(doc: Documento): Promise<void> {
    this.photoLoadingIds.set(new Set(this.photoLoadingIds()).add(doc.id));
    const nextErrors = new Set(this.photoErrorIds());
    nextErrors.delete(doc.id);
    this.photoErrorIds.set(nextErrors);

    try {
      const url = await this.proyectosService.getDocumentoUrl(this.proyectoId, doc.id);
      this.photoUrls.set({ ...this.photoUrls(), [doc.id]: url });
    } catch {
      const errs = new Set(this.photoErrorIds());
      errs.add(doc.id);
      this.photoErrorIds.set(errs);
    } finally {
      const loading = new Set(this.photoLoadingIds());
      loading.delete(doc.id);
      this.photoLoadingIds.set(loading);
    }
  }

  private async refetchProyectoSilently(): Promise<void> {
    try {
      const data = await this.proyectosService.getProyecto(this.proyectoId);
      this.proyecto.set(data);
    } catch {
      // El estado optimista local ya refleja la aprobacion; si el refresco
      // silencioso falla, lo dejamos como esta en vez de romper la vista.
    }
  }

  private extractMessage(err: unknown, fallbackEs: string, fallbackEn: string): string {
    if (err instanceof Error && err.message) return err.message;
    return this.i18n.lang() === 'es' ? fallbackEs : fallbackEn;
  }
}
