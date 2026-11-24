import { readFile, writeFile } from 'node:fs/promises';
import { getJson, kvReady, setJson } from '../api/_lib/kv-store.mjs';

const KEY = 'ccn-mobile:app-config:v1';
const [action, path, confirmation] = process.argv.slice(2);
if (!['export', 'import'].includes(action) || !path || !kvReady()) {
  console.error('Uso: node scripts/config-transfer.mjs export|import CAMINHO [--apply]');
  console.error('Configure DATABASE_URL, REDIS_URL ou KV_REST_API_URL e KV_REST_API_TOKEN no ambiente.');
  process.exit(2);
}

if (action === 'export') {
  const config = await getJson(KEY);
  if (!config) throw new Error('Não há configuração persistida para exportar.');
  await writeFile(path, `${JSON.stringify({ key: KEY, exportedAt: new Date().toISOString(), config }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Backup criado em ${path}. Guarde fora do Git e em local protegido.`);
} else {
  if (confirmation !== '--apply') throw new Error('Importação sobrescreve a configuração. Acrescente --apply após conferir o destino.');
  const backup = JSON.parse(await readFile(path, 'utf8'));
  if (backup.key !== KEY || !backup.config || typeof backup.config !== 'object' || Array.isArray(backup.config)) throw new Error('Arquivo de backup inválido.');
  await setJson(KEY, backup.config);
  console.log('Configuração importada. Confira links, ordem e data no painel de homologação.');
}
