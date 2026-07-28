import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import {
  AdminApiService,
  AdminUser,
  Tenant,
  TenantDataSource,
  TenantModel,
  TenantPipeline,
} from '../../services/admin-api.service';
import { AdminService, ModuleGrantRow, ModuleRow } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import {
  Documento,
  Proyecto,
  ProyectoDetalle,
  ProyectosService,
  Tarea,
} from '../../services/proyectos.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

type AdminTab = 'general' | 'access' | 'proyectos';

type ProyectosVista = 'lista' | 'formulario' | 'detalle';
type ProyectoFiltroEstado = 'todos' | 'activo' | 'pausado' | 'completado';

interface ProyectoFormData {
  nombre: string;
  descripcion: string;
  tipo: Proyecto['tipo'];
  ubicacion: string;
  cliente_user_id: string;
  fecha_inicio: string;
  fecha_prevista_fin: string;
  avance_pct: number;
  proximo_hito: string;
  estado: Proyecto['estado'];
}

const TIPO_PROYECTO_OPTIONS: ReadonlyArray<{ key: Proyecto['tipo']; labelEs: string; labelEn: string }> = [
  { key: 'obra_nueva', labelEs: 'Obra nueva', labelEn: 'New construction' },
  { key: 'rehabilitacion', labelEs: 'Rehabilitación', labelEn: 'Renovation' },
  { key: 'mantenimiento', labelEs: 'Mantenimiento', labelEn: 'Maintenance' },
  { key: 'inspeccion', labelEs: 'Inspección', labelEn: 'Inspection' },
];

const ESTADO_PROYECTO_OPTIONS: ReadonlyArray<{ key: Proyecto['estado']; labelEs: string; labelEn: string }> = [
  { key: 'activo', labelEs: 'Activo', labelEn: 'Active' },
  { key: 'pausado', labelEs: 'Pausado', labelEn: 'Paused' },
  { key: 'completado', labelEs: 'Completado', labelEn: 'Completed' },
];

const FILTRO_ESTADO_OPTIONS: ReadonlyArray<{ key: ProyectoFiltroEstado; labelEs: string; labelEn: string }> = [
  { key: 'todos', labelEs: 'Todos', labelEn: 'All' },
  { key: 'activo', labelEs: 'Activo', labelEn: 'Active' },
  { key: 'pausado', labelEs: 'Pausado', labelEn: 'Paused' },
  { key: 'completado', labelEs: 'Completado', labelEn: 'Completed' },
];

const ESTADO_TAREA_OPTIONS: ReadonlyArray<{ key: Tarea['estado']; labelEs: string; labelEn: string }> = [
  { key: 'pendiente', labelEs: 'Pendiente', labelEn: 'Pending' },
  { key: 'en_progreso', labelEs: 'En progreso', labelEn: 'In progress' },
  { key: 'completada', labelEs: 'Completada', labelEn: 'Completed' },
  { key: 'aprobada', labelEs: 'Aprobada', labelEn: 'Approved' },
];

const DOCUMENTO_CATEGORIA_OPTIONS: ReadonlyArray<{ key: Documento['categoria']; labelEs: string; labelEn: string }> = [
  { key: 'informe', labelEs: 'Informe', labelEn: 'Report' },
  { key: 'factura', labelEs: 'Factura', labelEn: 'Invoice' },
  { key: 'plano', labelEs: 'Plano', labelEn: 'Blueprint' },
  { key: 'foto', labelEs: 'Foto', labelEn: 'Photo' },
  { key: 'checklist', labelEs: 'Checklist', labelEn: 'Checklist' },
  { key: 'contrato', labelEs: 'Contrato', labelEn: 'Contract' },
  { key: 'otro', labelEs: 'Otro', labelEn: 'Other' },
];

interface AdminMetricRow {
  user_id: string;
  metric_label: string;
  metric_value: number;
  currency: string | null;
}

interface AdminProjectRow {
  user_id: string;
  name: string;
  status: string;
  budget: number | null;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [HeaderComponent, FooterComponent],
})
export class AdminComponent implements OnInit {
  readonly i18n = inject(LanguageService);
  readonly auth = inject(AuthService);
  readonly checking = signal(true);
  readonly isAdmin = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  readonly recentMetrics = signal<AdminMetricRow[]>([]);
  readonly recentProjects = signal<AdminProjectRow[]>([]);
  readonly savingMetric = signal(false);
  readonly savingProject = signal(false);

  readonly apiEnabled = signal(false);
  readonly loadingTenants = signal(false);
  readonly savingTenant = signal(false);
  readonly savingDataSource = signal(false);
  readonly runningPipeline = signal(false);
  readonly trainingModel = signal(false);
  readonly deployingModelId = signal<string | null>(null);

  readonly tenants = signal<Tenant[]>([]);
  readonly selectedTenantId = signal<string | null>(null);
  readonly tenantDataSources = signal<TenantDataSource[]>([]);
  readonly tenantPipelines = signal<TenantPipeline[]>([]);
  readonly tenantModels = signal<TenantModel[]>([]);

  readonly activeTab = signal<AdminTab>('general');
  readonly accessModules = signal<ModuleRow[]>([]);
  readonly accessLoading = signal(false);
  readonly accessError = signal<string | null>(null);
  readonly accessUsers = signal<AdminUser[]>([]);
  readonly accessGrants = signal<Record<string, Record<string, ModuleGrantRow>>>({});
  readonly userSearch = signal('');
  readonly accessPage = signal(1);
  readonly accessPageSize = 20;
  readonly savingCell = signal<string | null>(null);
  readonly savedCell = signal<string | null>(null);
  readonly expandedNotes = signal<ReadonlySet<string>>(new Set());
  readonly noteDrafts = signal<Record<string, string>>({});

  readonly filteredAccessUsers = computed(() => {
    const term = this.userSearch().trim().toLowerCase();
    const users = this.accessUsers();
    if (!term) return users;
    return users.filter((u) => (u.email ?? '').toLowerCase().includes(term));
  });

  readonly accessTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredAccessUsers().length / this.accessPageSize))
  );

  readonly pagedAccessUsers = computed(() => {
    const start = (this.accessPage() - 1) * this.accessPageSize;
    return this.filteredAccessUsers().slice(start, start + this.accessPageSize);
  });

  // ── Proyectos: vista y listado ──────────────────────────────────────────
  readonly tipoProyectoOptions = TIPO_PROYECTO_OPTIONS;
  readonly estadoProyectoOptions = ESTADO_PROYECTO_OPTIONS;
  readonly filtroEstadoOptions = FILTRO_ESTADO_OPTIONS;
  readonly estadoTareaOptions = ESTADO_TAREA_OPTIONS;
  readonly documentoCategoriaOptions = DOCUMENTO_CATEGORIA_OPTIONS;

  readonly proyectosVista = signal<ProyectosVista>('lista');
  readonly proyectosLista = signal<Proyecto[]>([]);
  readonly proyectosListaLoading = signal(false);
  readonly proyectosListaLoaded = signal(false);
  readonly proyectosListaError = signal<string | null>(null);
  readonly proyectosUsuariosError = signal<string | null>(null);
  readonly proyectosFiltroEstado = signal<ProyectoFiltroEstado>('todos');

  readonly proyectosListaFiltrada = computed(() => {
    const filtro = this.proyectosFiltroEstado();
    const rows = this.proyectosLista();
    if (filtro === 'todos') return rows;
    return rows.filter((p) => p.estado === filtro);
  });

  // ── Proyectos: formulario (crear/editar) ────────────────────────────────
  readonly proyectoSeleccionadoId = signal<string | null>(null);
  readonly formularioModo = signal<'nuevo' | 'edicion'>('nuevo');
  readonly formularioOrigen = signal<'lista' | 'detalle'>('lista');
  readonly formularioDatos = signal<ProyectoFormData>(this.formularioVacio());
  readonly formularioErrores = signal<Record<string, string>>({});
  readonly formularioGuardando = signal(false);
  readonly formularioError = signal<string | null>(null);
  readonly confirmandoEliminarProyecto = signal(false);
  readonly eliminandoProyecto = signal(false);

  // ── Proyectos: detalle ──────────────────────────────────────────────────
  readonly detalleProyecto = signal<ProyectoDetalle | null>(null);
  readonly detalleLoading = signal(false);
  readonly detalleError = signal<string | null>(null);

  // ── Proyectos: documentos ───────────────────────────────────────────────
  readonly documentoArchivo = signal<File | null>(null);
  readonly documentoCategoria = signal<Documento['categoria']>('informe');
  readonly documentoNombre = signal('');
  readonly documentoDescripcion = signal('');
  readonly subiendoDocumento = signal(false);
  readonly documentoError = signal<string | null>(null);
  readonly confirmandoEliminarDocumentoId = signal<string | null>(null);
  readonly eliminandoDocumentoId = signal<string | null>(null);
  readonly abriendoDocumentoId = signal<string | null>(null);
  readonly abrirDocumentoError = signal<string | null>(null);

  // ── Proyectos: tareas ────────────────────────────────────────────────────
  readonly tareaTitulo = signal('');
  readonly tareaDescripcion = signal('');
  readonly tareaRequiereAprobacion = signal(false);
  readonly creandoTarea = signal(false);
  readonly tareaError = signal<string | null>(null);
  readonly actualizandoTareaId = signal<string | null>(null);
  readonly confirmandoEliminarTareaId = signal<string | null>(null);
  readonly tareaEliminandoId = signal<string | null>(null);

  readonly tareasOrdenadas = computed(() => {
    const p = this.detalleProyecto();
    if (!p) return [];
    return [...p.tareas].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  // ── Proyectos: notas ─────────────────────────────────────────────────────
  readonly notaTexto = signal('');
  readonly notaVisibleCliente = signal(true);
  readonly creandoNota = signal(false);
  readonly notaError = signal<string | null>(null);

  readonly notasOrdenadas = computed(() => {
    const p = this.detalleProyecto();
    if (!p) return [];
    return [...p.notas].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });

  // ── Proyectos: avance rapido / proximo hito ─────────────────────────────
  readonly avanceRapido = signal(0);
  readonly guardandoAvance = signal(false);
  readonly avanceError = signal<string | null>(null);

  readonly proximoHitoRapido = signal('');
  readonly guardandoProximoHito = signal(false);
  readonly proximoHitoError = signal<string | null>(null);

  private readonly admin = inject(AdminService);
  private readonly adminApi = inject(AdminApiService);
  private readonly proyectosService = inject(ProyectosService);
  private readonly router = inject(Router);

  async ngOnInit() {
    await this.loadAccessAndData();
  }

  async loadAccessAndData() {
    this.checking.set(true);
    this.error.set(null);
    this.info.set(null);
    this.apiEnabled.set(this.adminApi.hasApiConfig());

    try {
      const allowed = await this.admin.isAdmin();
      this.isAdmin.set(allowed);
      if (!allowed) {
        this.error.set(
          this.i18n.lang() === 'es'
            ? 'Tu cuenta no tiene permisos de administrador.'
            : 'Your account does not have administrator permissions.'
        );
        return;
      }

      await this.refreshHistory();
      if (this.apiEnabled()) {
        await this.refreshTenants();
      } else {
        this.info.set(
          this.i18n.lang() === 'es'
            ? 'Configura adminApiBaseUrl en index.html para activar la gestion multi-tenant.'
            : 'Set adminApiBaseUrl in index.html to enable multi-tenant management.'
        );
      }
    } catch {
      this.error.set(
        this.i18n.lang() === 'es'
          ? 'No se pudo validar permisos admin.'
          : 'Could not validate admin permissions.'
      );
    } finally {
      this.checking.set(false);
    }
  }

  async refreshHistory() {
    const [metrics, projects] = await Promise.all([this.admin.getRecentMetrics(8), this.admin.getRecentProjects(8)]);
    this.recentMetrics.set(metrics);
    this.recentProjects.set(projects);
  }

  async refreshTenants() {
    this.loadingTenants.set(true);
    try {
      const rows = await this.adminApi.listTenants();
      this.tenants.set(rows);
      if (!rows.length) {
        this.selectedTenantId.set(null);
        this.tenantDataSources.set([]);
        this.tenantPipelines.set([]);
        this.tenantModels.set([]);
        return;
      }

      const activeId = this.selectedTenantId();
      const stillExists = activeId && rows.some((t) => t.id === activeId);
      const nextId = stillExists ? activeId : rows[0].id;
      this.selectedTenantId.set(nextId);
      await this.refreshTenantDetails();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudieron cargar los tenants.' : 'Could not load tenants.');
    } finally {
      this.loadingTenants.set(false);
    }
  }

  async refreshTenantDetails() {
    const tenantId = this.selectedTenantId();
    if (!tenantId) return;

    try {
      const [sources, pipelines, models] = await Promise.all([
        this.adminApi.listDataSources(tenantId),
        this.adminApi.listPipelines(tenantId),
        this.adminApi.listModels(tenantId),
      ]);
      this.tenantDataSources.set(sources);
      this.tenantPipelines.set(pipelines);
      this.tenantModels.set(models);
    } catch {
      this.error.set(
        this.i18n.lang() === 'es' ? 'No se pudo cargar el detalle del tenant.' : 'Could not load tenant detail.'
      );
    }
  }

  async onSelectTenant(tenantId: string) {
    this.selectedTenantId.set(tenantId);
    await this.refreshTenantDetails();
  }

  async onCreateTenant(event: Event, name: string) {
    event.preventDefault();
    this.error.set(null);
    this.info.set(null);
    this.savingTenant.set(true);

    try {
      await this.adminApi.createTenant(name);
      this.info.set(this.i18n.lang() === 'es' ? 'Tenant creado.' : 'Tenant created.');
      await this.refreshTenants();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo crear el tenant.' : 'Could not create tenant.');
    } finally {
      this.savingTenant.set(false);
    }
  }

  async onCreateDataSource(
    event: Event,
    type: string,
    host: string,
    port: string,
    dbName: string,
    schemaName: string,
    username: string,
    password: string
  ) {
    event.preventDefault();
    const tenantId = this.selectedTenantId();
    if (!tenantId) return;

    this.error.set(null);
    this.info.set(null);
    this.savingDataSource.set(true);

    try {
      await this.adminApi.createDataSource(tenantId, {
        type,
        host,
        port: port ? Number(port) : null,
        dbName,
        schemaName: schemaName || null,
        credentials: { username, password },
      });
      this.info.set(this.i18n.lang() === 'es' ? 'Data source creado.' : 'Data source created.');
      await this.refreshTenantDetails();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo crear el data source.' : 'Could not create data source.');
    } finally {
      this.savingDataSource.set(false);
    }
  }

  async onRunPipeline(event: Event, jobType: string, dataSourceId: string) {
    event.preventDefault();
    const tenantId = this.selectedTenantId();
    if (!tenantId) return;

    this.error.set(null);
    this.info.set(null);
    this.runningPipeline.set(true);

    try {
      await this.adminApi.runPipeline(tenantId, jobType, dataSourceId || undefined);
      this.info.set(this.i18n.lang() === 'es' ? 'Pipeline encolado.' : 'Pipeline queued.');
      await this.refreshTenantDetails();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo lanzar el pipeline.' : 'Could not run pipeline.');
    } finally {
      this.runningPipeline.set(false);
    }
  }

  async onTrainModel(event: Event, modelName: string, target: string, validationSplit: string) {
    event.preventDefault();
    const tenantId = this.selectedTenantId();
    if (!tenantId) return;

    this.error.set(null);
    this.info.set(null);
    this.trainingModel.set(true);

    try {
      await this.adminApi.trainModel(tenantId, modelName, {
        target: target || 'target',
        validationSplit: validationSplit ? Number(validationSplit) : 0.2,
      });
      this.info.set(this.i18n.lang() === 'es' ? 'Entrenamiento encolado.' : 'Training queued.');
      await this.refreshTenantDetails();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo entrenar el modelo.' : 'Could not train model.');
    } finally {
      this.trainingModel.set(false);
    }
  }

  async onDeployModel(modelId: string) {
    const tenantId = this.selectedTenantId();
    if (!tenantId) return;

    this.error.set(null);
    this.info.set(null);
    this.deployingModelId.set(modelId);

    try {
      await this.adminApi.deployModel(tenantId, modelId);
      this.info.set(this.i18n.lang() === 'es' ? 'Modelo desplegado.' : 'Model deployed.');
      await this.refreshTenantDetails();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo desplegar el modelo.' : 'Could not deploy model.');
    } finally {
      this.deployingModelId.set(null);
    }
  }

  async onCreateMetric(
    event: Event,
    userId: string,
    metricKey: string,
    metricLabel: string,
    metricValue: string,
    currency: string,
    trendPct: string
  ) {
    event.preventDefault();
    this.error.set(null);
    this.info.set(null);
    this.savingMetric.set(true);
    try {
      await this.admin.createMetric({
        userId,
        metricKey,
        metricLabel,
        metricValue: Number(metricValue),
        currency: currency || 'EUR',
        trendPct: trendPct ? Number(trendPct) : null,
      });
      this.info.set(this.i18n.lang() === 'es' ? 'Metrica creada.' : 'Metric created.');
      await this.refreshHistory();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo crear la metrica.' : 'Could not create metric.');
    } finally {
      this.savingMetric.set(false);
    }
  }

  async onCreateProject(event: Event, userId: string, name: string, status: string, budget: string, progressPct: string) {
    event.preventDefault();
    this.error.set(null);
    this.info.set(null);
    this.savingProject.set(true);
    try {
      await this.admin.createProject({
        userId,
        name,
        status: status || 'active',
        budget: budget ? Number(budget) : null,
        progressPct: progressPct ? Number(progressPct) : null,
      });
      this.info.set(this.i18n.lang() === 'es' ? 'Proyecto creado.' : 'Project created.');
      await this.refreshHistory();
    } catch {
      this.error.set(this.i18n.lang() === 'es' ? 'No se pudo crear el proyecto.' : 'Could not create project.');
    } finally {
      this.savingProject.set(false);
    }
  }

  formatMoney(value: number | null, currency: string | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  onGoPortal() {
    this.router.navigateByUrl('/portal');
  }

  async onSelectTab(tab: AdminTab) {
    this.activeTab.set(tab);
    if (tab === 'access' && this.accessUsers().length === 0 && !this.accessLoading()) {
      await this.loadAccessTab();
    }
    if (tab === 'proyectos' && !this.proyectosListaLoaded() && !this.proyectosListaLoading()) {
      await this.loadProyectosLista();
    }
  }

  async loadAccessTab() {
    this.accessLoading.set(true);
    this.accessError.set(null);
    try {
      const [users, grants, modules] = await Promise.all([
        this.adminApi.listUsers(),
        this.admin.getAllModuleGrants(),
        this.admin.getModules(),
      ]);
      this.accessUsers.set(users);
      this.accessGrants.set(this.buildGrantsMap(grants));
      this.accessModules.set(modules);
      this.accessPage.set(1);
    } catch {
      this.accessError.set(
        this.i18n.lang() === 'es'
          ? 'No se pudieron cargar los usuarios o los accesos.'
          : 'Could not load users or access grants.'
      );
    } finally {
      this.accessLoading.set(false);
    }
  }

  onUserSearchChange(value: string) {
    this.userSearch.set(value);
    this.accessPage.set(1);
  }

  goToAccessPage(page: number) {
    this.accessPage.set(Math.max(1, Math.min(page, this.accessTotalPages())));
  }

  userDisplayName(user: AdminUser): string | null {
    const metadata = user.user_metadata ?? {};
    const name = (metadata['full_name'] ?? metadata['name']) as string | undefined;
    return name?.trim() || null;
  }

  isGranted(userId: string, moduleKey: string): boolean {
    return this.grantFor(userId, moduleKey)?.enabled ?? false;
  }

  grantedAt(userId: string, moduleKey: string): string | null {
    return this.grantFor(userId, moduleKey)?.granted_at ?? null;
  }

  isSavingCell(userId: string, moduleKey: string): boolean {
    return this.savingCell() === this.cellKey(userId, moduleKey);
  }

  isSavedCell(userId: string, moduleKey: string): boolean {
    return this.savedCell() === this.cellKey(userId, moduleKey);
  }

  isNotesExpanded(userId: string, moduleKey: string): boolean {
    return this.expandedNotes().has(this.cellKey(userId, moduleKey));
  }

  toggleNotesExpanded(userId: string, moduleKey: string) {
    const key = this.cellKey(userId, moduleKey);
    const next = new Set(this.expandedNotes());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      if (this.noteDrafts()[key] === undefined) {
        this.noteDrafts.set({ ...this.noteDrafts(), [key]: this.grantFor(userId, moduleKey)?.notes ?? '' });
      }
    }
    this.expandedNotes.set(next);
  }

  noteDraft(userId: string, moduleKey: string): string {
    const key = this.cellKey(userId, moduleKey);
    const draft = this.noteDrafts()[key];
    if (draft !== undefined) return draft;
    return this.grantFor(userId, moduleKey)?.notes ?? '';
  }

  onNoteDraftChange(userId: string, moduleKey: string, value: string) {
    this.noteDrafts.set({ ...this.noteDrafts(), [this.cellKey(userId, moduleKey)]: value });
  }

  async onToggleGrant(userId: string, moduleKey: string, checked: boolean) {
    await this.saveGrant(userId, moduleKey, checked, this.grantFor(userId, moduleKey)?.notes ?? undefined);
  }

  async onSaveNotes(userId: string, moduleKey: string) {
    await this.saveGrant(userId, moduleKey, this.isGranted(userId, moduleKey), this.noteDraft(userId, moduleKey));
  }

  formatDate(iso: string | null): string {
    if (!iso) return '--';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('es-ES');
  }

  private grantFor(userId: string, moduleKey: string): ModuleGrantRow | null {
    return this.accessGrants()[userId]?.[moduleKey] ?? null;
  }

  private cellKey(userId: string, moduleKey: string): string {
    return `${userId}:${moduleKey}`;
  }

  private buildGrantsMap(rows: ModuleGrantRow[]): Record<string, Record<string, ModuleGrantRow>> {
    const map: Record<string, Record<string, ModuleGrantRow>> = {};
    for (const row of rows) {
      (map[row.user_id] ??= {})[row.module_key] = row;
    }
    return map;
  }

  private async saveGrant(userId: string, moduleKey: string, enabled: boolean, notes?: string) {
    const key = this.cellKey(userId, moduleKey);
    this.savingCell.set(key);
    this.savedCell.set(null);

    try {
      const saved = await this.adminApi.upsertGrant({ userId, moduleKey, enabled, notes });
      const nextGrants = { ...this.accessGrants() };
      nextGrants[userId] = {
        ...(nextGrants[userId] ?? {}),
        [moduleKey]: {
          user_id: saved.user_id,
          module_key: saved.module_key,
          enabled: saved.enabled,
          notes: saved.notes,
          granted_at: saved.granted_at ?? new Date().toISOString(),
        },
      };
      this.accessGrants.set(nextGrants);
      this.savedCell.set(key);
      setTimeout(() => {
        if (this.savedCell() === key) this.savedCell.set(null);
      }, 1500);
    } catch {
      this.accessError.set(
        this.i18n.lang() === 'es' ? 'No se pudo guardar el cambio de acceso.' : 'Could not save access change.'
      );
    } finally {
      if (this.savingCell() === key) this.savingCell.set(null);
    }
  }

  // ══ Proyectos: listado ═══════════════════════════════════════════════════

  async loadProyectosLista() {
    this.proyectosListaLoading.set(true);
    this.proyectosListaError.set(null);
    try {
      const rows = await this.proyectosService.getProyectos();
      this.proyectosLista.set(rows);
      this.proyectosListaLoaded.set(true);
    } catch (err) {
      this.proyectosListaError.set(
        this.extractErrorMessage(err, 'No se pudieron cargar los proyectos.', 'Could not load projects.')
      );
      return;
    } finally {
      this.proyectosListaLoading.set(false);
    }

    try {
      await this.ensureUsersLoaded();
    } catch {
      this.proyectosUsuariosError.set(
        this.i18n.lang() === 'es'
          ? 'No se pudieron cargar los datos de los clientes.'
          : 'Could not load client data.'
      );
    }
  }

  onProyectosFiltroChange(filtro: ProyectoFiltroEstado) {
    this.proyectosFiltroEstado.set(filtro);
  }

  clienteEmail(userId?: string | null): string {
    const es = this.i18n.lang() === 'es';
    if (!userId) return es ? 'Sin asignar' : 'Unassigned';
    const user = this.accessUsers().find((u) => u.id === userId);
    if (user?.email) return user.email;
    return es ? 'Usuario no encontrado' : 'Unknown user';
  }

  proyectoTipoLabel(tipo: Proyecto['tipo']): string {
    const opt = this.tipoProyectoOptions.find((o) => o.key === tipo);
    if (!opt) return tipo;
    return this.i18n.lang() === 'es' ? opt.labelEs : opt.labelEn;
  }

  proyectoEstadoLabel(estado: Proyecto['estado']): string {
    const opt = this.estadoProyectoOptions.find((o) => o.key === estado);
    if (!opt) return estado;
    return this.i18n.lang() === 'es' ? opt.labelEs : opt.labelEn;
  }

  proyectoEstadoBadgeClass(estado: Proyecto['estado']): string {
    switch (estado) {
      case 'activo':
        return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
      case 'pausado':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
      case 'completado':
        return 'border-blue-400/30 bg-blue-500/10 text-blue-200';
      default:
        return 'border-slate-600 bg-slate-700/30 text-slate-300';
    }
  }

  tareaEstadoLabel(estado: Tarea['estado']): string {
    const opt = this.estadoTareaOptions.find((o) => o.key === estado);
    if (!opt) return estado;
    return this.i18n.lang() === 'es' ? opt.labelEs : opt.labelEn;
  }

  documentoCategoriaLabel(categoria: Documento['categoria']): string {
    const opt = this.documentoCategoriaOptions.find((o) => o.key === categoria);
    if (!opt) return categoria;
    return this.i18n.lang() === 'es' ? opt.labelEs : opt.labelEn;
  }

  clampPct(value: number | undefined | null): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
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

  // ══ Proyectos: formulario ════════════════════════════════════════════════

  abrirFormularioNuevo() {
    this.formularioModo.set('nuevo');
    this.formularioOrigen.set('lista');
    this.proyectoSeleccionadoId.set(null);
    this.formularioDatos.set(this.formularioVacio());
    this.formularioErrores.set({});
    this.formularioError.set(null);
    this.proyectosVista.set('formulario');
    void this.ensureUsersLoaded();
  }

  abrirFormularioEdicionDesdeLista(p: Proyecto) {
    this.formularioOrigen.set('lista');
    this.abrirFormularioEdicionComun(p);
  }

  abrirFormularioEdicionDesdeDetalle() {
    const p = this.detalleProyecto();
    if (!p) return;
    this.formularioOrigen.set('detalle');
    this.abrirFormularioEdicionComun(p);
  }

  updateFormField<K extends keyof ProyectoFormData>(field: K, value: ProyectoFormData[K]) {
    this.formularioDatos.set({ ...this.formularioDatos(), [field]: value });
  }

  onFormTipoChange(value: string) {
    this.updateFormField('tipo', value as Proyecto['tipo']);
  }

  onFormEstadoChange(value: string) {
    this.updateFormField('estado', value as Proyecto['estado']);
  }

  onDocumentoCategoriaChange(value: string) {
    this.documentoCategoria.set(value as Documento['categoria']);
  }

  onCambiarEstadoTarea(tarea: Tarea, value: string) {
    void this.cambiarEstadoTarea(tarea, value as Tarea['estado']);
  }

  cancelarFormulario() {
    this.formularioError.set(null);
    this.proyectosVista.set(this.formularioOrigen());
  }

  async guardarFormulario() {
    if (this.formularioGuardando()) return;
    if (!this.validarFormulario()) return;

    this.formularioGuardando.set(true);
    this.formularioError.set(null);

    const datos = this.formularioDatos();
    const payloadBase = {
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim() || null,
      tipo: datos.tipo,
      ubicacion: datos.ubicacion.trim() || null,
      cliente_user_id: datos.cliente_user_id || null,
      fecha_inicio: datos.fecha_inicio || null,
      fecha_prevista_fin: datos.fecha_prevista_fin || null,
      proximo_hito: datos.proximo_hito.trim() || null,
    };

    try {
      if (this.formularioModo() === 'nuevo') {
        const creado = await this.proyectosService.crearProyecto(payloadBase);
        this.proyectosLista.set([creado, ...this.proyectosLista()]);
        await this.abrirDetalle(creado.id);
      } else {
        const id = this.proyectoSeleccionadoId();
        if (!id) return;
        const actualizado = await this.proyectosService.actualizarProyecto(id, {
          ...payloadBase,
          avance_pct: this.clampPct(datos.avance_pct),
          estado: datos.estado,
        });
        this.proyectosLista.set(this.proyectosLista().map((p) => (p.id === actualizado.id ? actualizado : p)));
        await this.abrirDetalle(actualizado.id);
      }
    } catch (err) {
      this.formularioError.set(
        this.extractErrorMessage(err, 'No se pudo guardar el proyecto.', 'Could not save the project.')
      );
    } finally {
      this.formularioGuardando.set(false);
    }
  }

  solicitarEliminarProyectoActual() {
    this.confirmandoEliminarProyecto.set(true);
    this.formularioError.set(null);
  }

  cancelarEliminarProyectoActual() {
    this.confirmandoEliminarProyecto.set(false);
  }

  async confirmarEliminarProyectoActual() {
    const id = this.proyectoSeleccionadoId();
    if (!id || this.eliminandoProyecto()) return;

    this.eliminandoProyecto.set(true);
    this.formularioError.set(null);
    try {
      await this.proyectosService.eliminarProyecto(id);
      this.confirmandoEliminarProyecto.set(false);
      this.proyectosVista.set('lista');
      await this.loadProyectosLista();
    } catch (err) {
      this.formularioError.set(
        this.extractErrorMessage(err, 'No se pudo eliminar el proyecto.', 'Could not delete the project.')
      );
    } finally {
      this.eliminandoProyecto.set(false);
    }
  }

  // ══ Proyectos: detalle ═══════════════════════════════════════════════════

  async abrirDetalle(id: string) {
    this.proyectoSeleccionadoId.set(id);
    this.proyectosVista.set('detalle');
    await this.cargarDetalle();
  }

  async cargarDetalle() {
    const id = this.proyectoSeleccionadoId();
    if (!id) return;

    this.detalleLoading.set(true);
    this.detalleError.set(null);
    try {
      const data = await this.proyectosService.getProyecto(id);
      this.detalleProyecto.set(data);
      this.avanceRapido.set(this.clampPct(data.avance_pct));
      this.proximoHitoRapido.set(data.proximo_hito ?? '');
    } catch (err) {
      this.detalleError.set(
        this.extractErrorMessage(err, 'No se pudo cargar el detalle del proyecto.', 'Could not load the project detail.')
      );
    } finally {
      this.detalleLoading.set(false);
    }
  }

  volverALista() {
    this.proyectosVista.set('lista');
    this.detalleProyecto.set(null);
    this.detalleError.set(null);
  }

  // ══ Proyectos: documentos ════════════════════════════════════════════════

  onDocumentoArchivoChange(files: FileList | null) {
    this.documentoArchivo.set(files && files.length ? files[0] : null);
    this.documentoError.set(null);
  }

  async subirDocumento() {
    const proyecto = this.detalleProyecto();
    const archivo = this.documentoArchivo();
    const es = this.i18n.lang() === 'es';
    if (!proyecto || this.subiendoDocumento()) return;

    if (!archivo) {
      this.documentoError.set(es ? 'Selecciona un archivo.' : 'Select a file.');
      return;
    }
    const tipoValido = archivo.type === 'application/pdf' || archivo.type.startsWith('image/');
    if (!tipoValido) {
      this.documentoError.set(
        es ? 'Tipo de archivo no permitido. Usa PDF o imagenes.' : 'File type not allowed. Use PDF or images.'
      );
      return;
    }
    if (archivo.size > 50 * 1024 * 1024) {
      this.documentoError.set(es ? 'El archivo supera el limite de 50MB.' : 'The file exceeds the 50MB limit.');
      return;
    }
    if (!this.documentoNombre().trim()) {
      this.documentoError.set(es ? 'El nombre es obligatorio.' : 'Name is required.');
      return;
    }

    this.subiendoDocumento.set(true);
    this.documentoError.set(null);

    const formData = new FormData();
    formData.append('archivo', archivo);
    formData.append('categoria', this.documentoCategoria());
    formData.append('nombre', this.documentoNombre().trim());
    formData.append('descripcion', this.documentoDescripcion().trim());

    try {
      const nuevo = await this.proyectosService.subirDocumento(proyecto.id, formData);
      this.detalleProyecto.set({ ...proyecto, documentos: [nuevo, ...proyecto.documentos] });
      this.documentoArchivo.set(null);
      this.documentoNombre.set('');
      this.documentoDescripcion.set('');
      this.documentoCategoria.set('informe');
    } catch (err) {
      this.documentoError.set(
        this.extractErrorMessage(err, 'No se pudo subir el documento.', 'Could not upload the document.')
      );
    } finally {
      this.subiendoDocumento.set(false);
    }
  }

  solicitarEliminarDocumento(docId: string) {
    this.confirmandoEliminarDocumentoId.set(docId);
    this.documentoError.set(null);
  }

  cancelarEliminarDocumento() {
    this.confirmandoEliminarDocumentoId.set(null);
  }

  async confirmarEliminarDocumento(docId: string) {
    const proyecto = this.detalleProyecto();
    if (!proyecto || this.eliminandoDocumentoId()) return;

    this.eliminandoDocumentoId.set(docId);
    this.documentoError.set(null);
    try {
      await this.proyectosService.eliminarDocumento(proyecto.id, docId);
      this.detalleProyecto.set({ ...proyecto, documentos: proyecto.documentos.filter((d) => d.id !== docId) });
      this.confirmandoEliminarDocumentoId.set(null);
    } catch (err) {
      this.documentoError.set(
        this.extractErrorMessage(err, 'No se pudo eliminar el documento.', 'Could not delete the document.')
      );
    } finally {
      this.eliminandoDocumentoId.set(null);
    }
  }

  async abrirDocumentoAdmin(doc: Documento) {
    const proyecto = this.detalleProyecto();
    if (!proyecto || this.abriendoDocumentoId()) return;

    this.abriendoDocumentoId.set(doc.id);
    this.abrirDocumentoError.set(null);
    const ventana = window.open('', '_blank');

    try {
      const url = await this.proyectosService.getDocumentoUrl(proyecto.id, doc.id);
      if (ventana) {
        ventana.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      ventana?.close();
      this.abrirDocumentoError.set(
        this.extractErrorMessage(err, 'No se pudo abrir el documento.', 'Could not open the document.')
      );
    } finally {
      this.abriendoDocumentoId.set(null);
    }
  }

  // ══ Proyectos: tareas ════════════════════════════════════════════════════

  async agregarTarea() {
    const proyecto = this.detalleProyecto();
    const es = this.i18n.lang() === 'es';
    if (!proyecto || this.creandoTarea()) return;

    if (!this.tareaTitulo().trim()) {
      this.tareaError.set(es ? 'El titulo es obligatorio.' : 'Title is required.');
      return;
    }

    this.creandoTarea.set(true);
    this.tareaError.set(null);
    try {
      const nueva = await this.proyectosService.crearTarea(proyecto.id, {
        titulo: this.tareaTitulo().trim(),
        descripcion: this.tareaDescripcion().trim() || null,
        requiere_aprobacion_cliente: this.tareaRequiereAprobacion(),
      });
      this.detalleProyecto.set({ ...proyecto, tareas: [...proyecto.tareas, nueva] });
      this.tareaTitulo.set('');
      this.tareaDescripcion.set('');
      this.tareaRequiereAprobacion.set(false);
    } catch (err) {
      this.tareaError.set(this.extractErrorMessage(err, 'No se pudo crear la tarea.', 'Could not create the task.'));
    } finally {
      this.creandoTarea.set(false);
    }
  }

  async cambiarEstadoTarea(tarea: Tarea, nuevoEstado: Tarea['estado']) {
    const proyecto = this.detalleProyecto();
    if (!proyecto || this.actualizandoTareaId()) return;
    if (nuevoEstado === tarea.estado) return;

    this.actualizandoTareaId.set(tarea.id);
    this.tareaError.set(null);
    try {
      const actualizada = await this.proyectosService.actualizarTarea(proyecto.id, tarea.id, {
        estado: nuevoEstado,
      });
      this.detalleProyecto.set({
        ...proyecto,
        tareas: proyecto.tareas.map((t) => (t.id === actualizada.id ? actualizada : t)),
      });
    } catch (err) {
      this.tareaError.set(
        this.extractErrorMessage(err, 'No se pudo actualizar la tarea.', 'Could not update the task.')
      );
    } finally {
      this.actualizandoTareaId.set(null);
    }
  }

  solicitarEliminarTarea(tareaId: string) {
    this.confirmandoEliminarTareaId.set(tareaId);
    this.tareaError.set(null);
  }

  cancelarEliminarTarea() {
    this.confirmandoEliminarTareaId.set(null);
  }

  async confirmarEliminarTarea(tareaId: string) {
    const proyecto = this.detalleProyecto();
    if (!proyecto || this.tareaEliminandoId()) return;

    this.tareaEliminandoId.set(tareaId);
    this.tareaError.set(null);
    try {
      await this.proyectosService.eliminarTarea(proyecto.id, tareaId);
      this.detalleProyecto.set({ ...proyecto, tareas: proyecto.tareas.filter((t) => t.id !== tareaId) });
      this.confirmandoEliminarTareaId.set(null);
    } catch (err) {
      this.tareaError.set(this.extractErrorMessage(err, 'No se pudo eliminar la tarea.', 'Could not delete the task.'));
    } finally {
      this.tareaEliminandoId.set(null);
    }
  }

  // ══ Proyectos: notas ═════════════════════════════════════════════════════

  async agregarNota() {
    const proyecto = this.detalleProyecto();
    const es = this.i18n.lang() === 'es';
    if (!proyecto || this.creandoNota()) return;

    if (!this.notaTexto().trim()) {
      this.notaError.set(es ? 'El texto es obligatorio.' : 'Text is required.');
      return;
    }

    this.creandoNota.set(true);
    this.notaError.set(null);
    try {
      const nueva = await this.proyectosService.crearNota(proyecto.id, {
        texto: this.notaTexto().trim(),
        visible_cliente: this.notaVisibleCliente(),
      });
      this.detalleProyecto.set({ ...proyecto, notas: [nueva, ...proyecto.notas] });
      this.notaTexto.set('');
    } catch (err) {
      this.notaError.set(this.extractErrorMessage(err, 'No se pudo crear la nota.', 'Could not create the note.'));
    } finally {
      this.creandoNota.set(false);
    }
  }

  // ══ Proyectos: avance rapido / proximo hito ═════════════════════════════

  async guardarAvanceRapido() {
    const proyecto = this.detalleProyecto();
    if (!proyecto || this.guardandoAvance()) return;

    this.guardandoAvance.set(true);
    this.avanceError.set(null);
    try {
      const actualizado = await this.proyectosService.actualizarProyecto(proyecto.id, {
        avance_pct: this.clampPct(this.avanceRapido()),
      });
      this.detalleProyecto.set({ ...proyecto, avance_pct: actualizado.avance_pct, updated_at: actualizado.updated_at });
      this.avanceRapido.set(this.clampPct(actualizado.avance_pct));
      this.proyectosLista.set(this.proyectosLista().map((p) => (p.id === actualizado.id ? actualizado : p)));
    } catch (err) {
      this.avanceError.set(
        this.extractErrorMessage(err, 'No se pudo guardar el avance.', 'Could not save the progress.')
      );
    } finally {
      this.guardandoAvance.set(false);
    }
  }

  async guardarProximoHitoRapido() {
    const proyecto = this.detalleProyecto();
    if (!proyecto || this.guardandoProximoHito()) return;

    this.guardandoProximoHito.set(true);
    this.proximoHitoError.set(null);
    try {
      const actualizado = await this.proyectosService.actualizarProyecto(proyecto.id, {
        proximo_hito: this.proximoHitoRapido().trim() || null,
      });
      this.detalleProyecto.set({ ...proyecto, proximo_hito: actualizado.proximo_hito, updated_at: actualizado.updated_at });
      this.proximoHitoRapido.set(actualizado.proximo_hito ?? '');
      this.proyectosLista.set(this.proyectosLista().map((p) => (p.id === actualizado.id ? actualizado : p)));
    } catch (err) {
      this.proximoHitoError.set(
        this.extractErrorMessage(err, 'No se pudo actualizar el proximo hito.', 'Could not update the next milestone.')
      );
    } finally {
      this.guardandoProximoHito.set(false);
    }
  }

  private formularioVacio(): ProyectoFormData {
    return {
      nombre: '',
      descripcion: '',
      tipo: 'obra_nueva',
      ubicacion: '',
      cliente_user_id: '',
      fecha_inicio: '',
      fecha_prevista_fin: '',
      avance_pct: 0,
      proximo_hito: '',
      estado: 'activo',
    };
  }

  private abrirFormularioEdicionComun(p: Proyecto) {
    this.formularioModo.set('edicion');
    this.proyectoSeleccionadoId.set(p.id);
    this.formularioDatos.set({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      tipo: p.tipo,
      ubicacion: p.ubicacion ?? '',
      cliente_user_id: p.cliente_user_id ?? '',
      fecha_inicio: p.fecha_inicio ?? '',
      fecha_prevista_fin: p.fecha_prevista_fin ?? '',
      avance_pct: this.clampPct(p.avance_pct),
      proximo_hito: p.proximo_hito ?? '',
      estado: p.estado,
    });
    this.formularioErrores.set({});
    this.formularioError.set(null);
    this.proyectosVista.set('formulario');
    void this.ensureUsersLoaded();
  }

  private validarFormulario(): boolean {
    const datos = this.formularioDatos();
    const errores: Record<string, string> = {};
    const es = this.i18n.lang() === 'es';

    if (!datos.nombre.trim()) {
      errores['nombre'] = es ? 'El nombre es obligatorio.' : 'Name is required.';
    }

    if (datos.fecha_inicio && datos.fecha_prevista_fin) {
      const inicio = new Date(datos.fecha_inicio);
      const fin = new Date(datos.fecha_prevista_fin);
      if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fin.getTime()) && fin < inicio) {
        errores['fecha_prevista_fin'] = es
          ? 'La fecha prevista de fin no puede ser anterior a la fecha de inicio.'
          : 'The expected end date cannot be before the start date.';
      }
    }

    this.formularioErrores.set(errores);
    return Object.keys(errores).length === 0;
  }

  private async ensureUsersLoaded(): Promise<void> {
    if (this.accessUsers().length > 0) return;
    const users = await this.adminApi.listUsers();
    this.accessUsers.set(users);
  }

  private extractErrorMessage(err: unknown, fallbackEs: string, fallbackEn: string): string {
    if (err instanceof Error && err.message) return err.message;
    return this.i18n.lang() === 'es' ? fallbackEs : fallbackEn;
  }
}
