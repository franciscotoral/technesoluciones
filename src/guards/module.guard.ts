import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { CapabilitiesService } from '../services/capabilities.service';

export const moduleGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const capabilities = inject(CapabilitiesService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
  }

  const moduleKey = route.data['moduleKey'] as string | undefined;
  if (!moduleKey) {
    return router.createUrlTree(['/portal']);
  }

  await capabilities.getCapabilities();
  if (capabilities.hasModule(moduleKey)) return true;

  return router.createUrlTree(['/portal'], { queryParams: { locked: moduleKey } });
};
