import me from '../_lib/handlers/me.mjs';
import mfa from '../_lib/handlers/mfa.mjs';
import notifications from '../_lib/handlers/notifications.mjs';

const handlers = { me, mfa, notifications };

export default function handler(request, response) {
  const route = new URL(request.url || '/', 'http://localhost').searchParams.get('route');
  const selected = handlers[route];
  if (!selected) return response.status(404).json({ error: 'Rota não encontrada.' });
  return selected(request, response);
}
