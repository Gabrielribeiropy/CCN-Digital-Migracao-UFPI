import { createBackupCodes, createMfaSecret, readMfaSecret, saveMfaSecret } from '../api/_lib/admin-mfa.mjs';

const args = process.argv.slice(2);
const identity = args[0] === '--legacy-admin' ? 'legacy:admin' : args[0] === '--legacy-developer' ? 'legacy:developer' : /^--user=[a-f0-9-]{36}$/i.test(args[0] || '') ? `user:${args[0].slice(7)}` : null;
if (!identity || !process.env.DATABASE_URL || !process.env.CCN_MFA_ENCRYPTION_KEY) {
  console.error('Uso na VPS: node scripts/provision-mfa.mjs --legacy-admin (ou --user=UUID). Exige DATABASE_URL e CCN_MFA_ENCRYPTION_KEY no ambiente privado.');
  process.exitCode = 1;
} else {
  try {
    const existing = await readMfaSecret(identity);
    if (existing && !args.includes('--replace')) throw new Error('Autenticador já cadastrado. A substituição exige --replace após confirmar a identidade do titular.');
    const secret = createMfaSecret();
    await saveMfaSecret(identity, secret);
    const backupCodes = await createBackupCodes(identity);
    console.log(`Conta: ${identity}\nChave para inserir manualmente no autenticador (mostrada uma vez): ${secret}\nCódigos de recuperação, cada um de uso único (mostrados uma vez):\n${backupCodes.join('\n')}\nGuarde tudo fora do Git, logs e chamados.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao cadastrar autenticador.');
    process.exitCode = 1;
  }
}
