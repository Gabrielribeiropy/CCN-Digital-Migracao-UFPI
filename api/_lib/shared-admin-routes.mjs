import me from './handlers/me.mjs';
import mfa from './handlers/mfa.mjs';
import notifications from './handlers/notifications.mjs';

export const sharedAdminRoutes = [
  { path: '/api/admin/me', name: 'me', handler: me },
  { path: '/api/admin/mfa', name: 'mfa', handler: mfa },
  { path: '/api/admin/notifications', name: 'notifications', handler: notifications },
];
