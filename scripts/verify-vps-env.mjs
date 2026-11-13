import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateVpsEnvironment(env) {
  const errors = [];
  const required = ['DATABASE_URL', 'CCN_ADMIN_SESSION_SECRET', 'CCN_PUBLIC_ORIGIN', 'CCN_MFA_ENCRYPTION_KEY', ...(env.CCN_LEGACY_ADMIN_DISABLED === 'true' ? [] : ['CCN_ADMIN_USERNAME', 'CCN_ADMIN_PASSWORD_HASH'])];
  for (const name of required) if (!env[name]) errors.push(`${name} não configurada.`);

  try {
    const database = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.username || !database.password || database.pathname.length < 2 || /SUBSTITUIR/i.test(database.password)) {
      errors.push('DATABASE_URL deve apontar para o PostgreSQL exclusivo com credenciais reais.');
    }
  } catch { if (env.DATABASE_URL) errors.push('DATABASE_URL inválida.'); }

  try {
    const origin = new URL(env.CCN_PUBLIC_ORIGIN);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || /exemplo|example/i.test(origin.hostname)) {
      errors.push('CCN_PUBLIC_ORIGIN deve ser a origem HTTPS real, sem caminho.');
    }
  } catch { if (env.CCN_PUBLIC_ORIGIN) errors.push('CCN_PUBLIC_ORIGIN inválida.'); }

  const hashPattern = /^[a-f0-9]{32}:[a-f0-9]{128}$/i;
  if (env.CCN_ADMIN_PASSWORD_HASH && !hashPattern.test(env.CCN_ADMIN_PASSWORD_HASH)) errors.push('CCN_ADMIN_PASSWORD_HASH inválido; gere um hash próprio.');
  if (env.CCN_ADMIN_SESSION_SECRET && (env.CCN_ADMIN_SESSION_SECRET.length < 32 || /GERAR_|SUBSTITUIR/i.test(env.CCN_ADMIN_SESSION_SECRET))) errors.push('CCN_ADMIN_SESSION_SECRET deve ser aleatório e ter pelo menos 32 caracteres.');
  if (env.CCN_MFA_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(env.CCN_MFA_ENCRYPTION_KEY)) errors.push('CCN_MFA_ENCRYPTION_KEY deve ter 32 bytes aleatórios em hexadecimal.');
  if (env.CCN_ADMIN_MFA_REQUIRED !== 'true') errors.push('CCN_ADMIN_MFA_REQUIRED deve ser true na VPS. Cadastre o autenticador antes de iniciar o serviço.');
  if (env.CCN_DEVELOPER_USERNAME || env.CCN_DEVELOPER_PASSWORD_HASH) {
    if (!env.CCN_DEVELOPER_USERNAME || !hashPattern.test(env.CCN_DEVELOPER_PASSWORD_HASH || '')) errors.push('Configure usuário e hash válidos para a conta técnica.');
    if (env.CCN_DEVELOPER_USERNAME && env.CCN_DEVELOPER_USERNAME === env.CCN_ADMIN_USERNAME) errors.push('A conta técnica deve ter usuário diferente do administrador.');
  }
  const smtpNames = ['CCN_SMTP_HOST', 'CCN_SMTP_PORT', 'CCN_SMTP_USER', 'CCN_SMTP_PASSWORD', 'CCN_SMTP_FROM'];
  if (smtpNames.some((name) => env[name])) {
    for (const name of smtpNames) if (!env[name] || /SEGREDO_FORA_DO_GIT|SUBSTITUIR|exemplo/i.test(env[name])) errors.push(`${name} incompleta ou ainda com marcador.`);
    const smtpPort = Number(env.CCN_SMTP_PORT);
    if (![465, 587].includes(smtpPort)) errors.push('CCN_SMTP_PORT deve ser 465 (TLS) ou 587 (STARTTLS).');
    if (env.CCN_SMTP_FROM && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.CCN_SMTP_FROM)) errors.push('CCN_SMTP_FROM deve ser um e-mail válido.');
  }
  if (env.REDIS_URL || env.KV_REST_API_URL || env.KV_REST_API_TOKEN) errors.push('A VPS PostgreSQL não deve configurar Redis/KV.');
  if ((env.HOST || '127.0.0.1') !== '127.0.0.1') errors.push('HOST deve ser 127.0.0.1 atrás do proxy HTTPS.');
  if (env.CCN_TRUST_PROXY !== 'loopback') errors.push('CCN_TRUST_PROXY deve ser loopback com X-Real-IP sobrescrito pelo proxy local.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT deve ser uma porta válida.');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = validateVpsEnvironment(process.env);
  if (errors.length) {
    console.error(`Configuração da VPS incompleta:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else console.log('Configuração da VPS validada (sem testar conexão com o banco).');
}
