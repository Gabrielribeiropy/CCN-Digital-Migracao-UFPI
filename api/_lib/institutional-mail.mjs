// Serviço de envio reutilizável para avisos do Conselho e futuras reservas do Auditório.
// Credenciais são lidas apenas do ambiente do servidor.
export function institutionalMailSettings(env = process.env) {
  const host = env.CCN_SMTP_HOST?.trim();
  const port = Number(env.CCN_SMTP_PORT || 587);
  const user = env.CCN_SMTP_USER?.trim();
  const password = env.CCN_SMTP_PASSWORD;
  const from = env.CCN_SMTP_FROM?.trim();
  if (!host || ![465, 587].includes(port) || !user || !password || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) throw new Error('Conta SMTP institucional não configurada.');
  return { host, port, user, password, from };
}

export async function createInstitutionalMailer(env = process.env) {
  const settings = institutionalMailSettings(env);
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.port === 465, requireTLS: settings.port === 587, auth: { user: settings.user, pass: settings.password }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  return {
    send: async (message) => {
      const info = await transport.sendMail({ ...message, from: settings.from });
      if (info.rejected?.length) throw new Error('O servidor de e-mail rejeitou um destinatário.');
      return info;
    },
    close: () => transport.close(),
  };
}
