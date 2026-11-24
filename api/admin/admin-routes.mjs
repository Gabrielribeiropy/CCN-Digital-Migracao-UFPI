import { sharedAdminRoutes } from '../_lib/shared-admin-routes.mjs';

const handlers = new Map(sharedAdminRoutes.map(({ name, handler }) => [name, handler]));

export default function handler(request, response) {
  const route = new URL(request.url || '/', 'http://localhost').searchParams.get('route');
  const selected = handlers.get(route);
  if (!selected) return response.status(404).json({ error: 'Rota não encontrada.' });
  return selected(request, response);
}
