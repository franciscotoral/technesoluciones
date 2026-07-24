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
import { AdminService, ModuleGrantRow } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';

type AdminTab = 'general' | 'access';

const ACCESS_MODULES: ReadonlyArray<{ key: string; name: string }> = [
  { key: 'pipeline', name: 'Pipeline de Construcción' },
  { key: 'calculadora', name: 'Calculadora de Huella de Carbono' },
  { key: 'diagnostico', name: 'Diagnóstico Normativo' },
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
  readonly accessModules = ACCESS_MODULES;
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

  private readonly admin = inject(AdminService);
  private readonly adminApi = inject(AdminApiService);
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
  }

  async loadAccessTab() {
    this.accessLoading.set(true);
    this.accessError.set(null);
    try {
      const [users, grants] = await Promise.all([this.adminApi.listUsers(), this.admin.getAllModuleGrants()]);
      this.accessUsers.set(users);
      this.accessGrants.set(this.buildGrantsMap(grants));
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
}
