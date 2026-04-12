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
import { OstlankenDashboardComponent } from './app/pages/ostlanken-dashboard/ostlanken-dashboard.component';
import { ProjectsDashboardComponent } from './app/pages/projects-dashboard/projects-dashboard.component';
import { ProjectDetailComponent } from './app/pages/project-detail/project-detail.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'cases', component: CaseListComponent },
  { path: 'cases/:slug', component: CaseDetailComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'login', component: LoginComponent },
  { path: 'portal', component: PortalComponent, canActivate: [authGuard] },
  { path: 'projects', component: ProjectsDashboardComponent },
  { path: 'projects/:slug', component: ProjectDetailComponent },
  { path: 'ostlanken', component: OstlankenDashboardComponent },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  {
    path: 'diagnostico',
    loadComponent: () =>
      import('./app/pages/diagnostico/diagnostico.component').then(
        m => m.DiagnosticoComponent
      ),
  },
  { path: '**', redirectTo: '' },
];
