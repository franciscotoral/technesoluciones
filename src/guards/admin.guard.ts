import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const admin = inject(AdminService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
  }

  const allowed = await admin.isAdmin();
  if (allowed) return true;

  return router.createUrlTree(['/portal'], { queryParams: { denied: 'admin' } });
};
