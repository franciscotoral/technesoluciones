import { Routes } from '@angular/router';

import { HomeComponent } from './components/home/home.component';
import { CaseListComponent } from './components/case-list/case-list.component';
import { CaseDetailComponent } from './components/case-detail/case-detail.component';
import { ContactComponent } from './components/contact/contact.component';
import { LoginComponent } from './components/login/login.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'cases', component: CaseListComponent },
  { path: 'cases/:slug', component: CaseDetailComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'login', component: LoginComponent },
  { path: '**', redirectTo: '' },
];
