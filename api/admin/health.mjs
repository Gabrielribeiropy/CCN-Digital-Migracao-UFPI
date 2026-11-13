import { storeStatus } from '../_lib/config-store.mjs';
import { storageHealthy } from '../_lib/kv-store.mjs';

export default async function handler(_request, response) {
  response.setHeader('cache-control', 'no-store');
  const healthy = await storageHealthy();
  response.status(healthy ? 200 : 503).json({ service: 'CCN Digital Admin API', status: healthy ? 'online' : 'storage-unavailable', storage: storeStatus(), timestamp: new Date().toISOString() });
}
