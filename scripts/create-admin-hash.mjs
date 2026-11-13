import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo; não envie a senha como argumento.');
const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const readline = createInterface({ input: process.stdin, output: muted, terminal: true });
const ask = (prompt) => new Promise((resolve) => {
  process.stdout.write(prompt);
  readline.question('', (value) => { process.stdout.write('\n'); resolve(value); });
});

try {
  const password = await ask('Nova senha (mínimo 16 caracteres): ');
  const confirmation = await ask('Repita a senha: ');
  if (password.length < 16 || password !== confirmation) throw new Error('Senhas diferentes ou curtas demais.');
  const salt = randomBytes(16).toString('hex');
  console.log(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
} finally { readline.close(); }
