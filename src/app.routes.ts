import { Routes } from '@angular/router';

import { HomeComponent } from './components/home/home.component';
import { CaseListComponent } from './components/case-list/case-list.component';
import { CaseDetailComponent } from './components/case-detail/case-detail.component';
import { ContactComponent } from './components/contact/contact.component';
import { LoginComponent } from './components/login/login.component';
import { PortalComponent } from './components/portal/portal.component';
import { authGuard } from './guards/auth.guard';
import { AdminComponent } from './components/admin/admin.component';
import { adminGuard } from './guards/admin.guard';
import { moduleGuard } from './guards/module.guard';
import { OstlankenDashboardComponent } from './app/pages/ostlanken-dashboard/ostlanken-dashboard.component';
import { ProjectsDashboardComponent } from './app/pages/projects-dashboard/projects-dashboard.component';
import { ProjectDetailComponent } from './app/pages/project-detail/project-detail.component';
import { BriefingComponent } from './components/briefing/briefing.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'cases', component: CaseListComponent },
  { path: 'cases/:slug', component: CaseDetailComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'login', component: LoginComponent },
  { path: 'portal', component: PortalComponent, canActivate: [authGuard] },
  {
    path: 'projects',
    component: ProjectsDashboardComponent,
    canActivate: [authGuard, moduleGuard],
    data: { moduleKey: 'pipeline' },
  },
  { path: 'projects/:slug', component: ProjectDetailComponent },
  { path: 'briefing', component: BriefingComponent },
  { path: 'ostlanken', component: OstlankenDashboardComponent },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  {
    path: 'diagnostico',
    loadComponent: () =>
      import('./app/pages/diagnostico/diagnostico.component').then(
        m => m.DiagnosticoComponent
      ),
  },
  // No existe ruta '/calculadora' en el Router de Angular: el portal navega con
  // window.location.href a la SPA React independiente (calculadora-huella/),
  // servida como bundle estatico aparte. moduleGuard no puede protegerla aqui;
  // el gating vive en el portal (hasModule('calculadora')) y, pendiente,
  // en el backend HCC cuando exista.
  {
    path: 'briefing/01',
    loadComponent: () =>
      import('./app/pages/briefing-01/briefing-01.component').then(
        m => m.Briefing01Component
      ),
  },
  { path: '**', redirectTo: '' },
];
