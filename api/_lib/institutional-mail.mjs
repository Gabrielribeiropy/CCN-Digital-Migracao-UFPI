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
      const info = await transport.sendMail({ ...message, from: { name: 'CCN Digital', address: settings.from } });
      if (info.rejected?.length) throw new Error('O servidor de e-mail rejeitou um destinatário.');
      return info;
    },
    close: () => transport.close(),
  };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

// Monta a mensagem do painel em HTML (com versão em texto) no padrão visual do CCN Digital.
export function institutionalMessage({ title, name, paragraphs = [], action = null, code = null, note = '' }) {
  const greeting = name ? `Olá, ${String(name).split(' ')[0]}.` : 'Olá.';
  const text = [greeting, '', ...paragraphs.flatMap(line => [line, '']),
    ...(code ? [`Código: ${code}`, ''] : []),
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    ...(note ? [note, ''] : []),
    'Se você não fez esta solicitação, ignore esta mensagem ou avise a coordenação do CCN.', '', 'CCN Digital · Centro de Ciências da Natureza · UFPI'].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f7fb;font-family:Segoe UI,Arial,sans-serif;color:#142b42">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce7f0;border-radius:14px;overflow:hidden">
<tr><td style="background:#082b50;border-bottom:3px solid #22adb0;padding:18px 24px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.02em">CCN Digital <span style="font-weight:400;color:#b9cde0">· Painel administrativo</span></td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 14px;font-size:21px;color:#082b50">${escapeHtml(title)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${escapeHtml(greeting)}</p>
${paragraphs.map(line => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${escapeHtml(line)}</p>`).join('\n')}
${code ? `<p style="margin:18px 0;text-align:center"><span style="display:inline-block;padding:12px 22px;border:1px solid #dce7f0;border-radius:10px;background:#f3f7fb;font:700 30px/1 Consolas,monospace;letter-spacing:.3em;color:#082b50">${escapeHtml(code)}</span></p>` : ''}
${action ? `<p style="margin:20px 0;text-align:center"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 24px;border-radius:10px;background:#075ba9;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(action.label)}</a></p><p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:#60748a;word-break:break-all">Se o botão não abrir, copie este endereço: ${escapeHtml(action.url)}</p>` : ''}
${note ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:9px;background:#fff8e6;font-size:13px;line-height:1.5;color:#6b4e00">${escapeHtml(note)}</p>` : ''}
</td></tr>
<tr><td style="padding:14px 24px 22px;border-top:1px solid #dce7f0;font-size:12px;line-height:1.5;color:#60748a">Se você não fez esta solicitação, ignore esta mensagem ou avise a coordenação do CCN.<br>CCN Digital · Centro de Ciências da Natureza · UFPI</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text };
}

export async function sendInstitutionalMail(to, subject, content) {
  const mailer = await createInstitutionalMailer();
  try { await mailer.send({ to, subject, ...institutionalMessage(content), headers: { 'X-Auto-Response-Suppress': 'All' } }); }
  finally { mailer.close(); }
}
