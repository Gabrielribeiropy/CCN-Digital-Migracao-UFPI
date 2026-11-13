# Instalação na VM Debian

O operador entra na VM por SSH conforme a política de acesso da instituição. Os comandos abaixo são executados **na VM**. Ajuste nomes e caminhos com a equipe que administra o servidor. O subdomínio HTTPS do painel e da API precisa ser acessível pelos celulares fora do campus.

## Requisitos

- Debian atualizado, Node.js LTS com correções de segurança, npm, Git, PostgreSQL e Nginx.
- DNS e certificado HTTPS válidos para o subdomínio.
- Saída HTTPS da VM para notícias, páginas, imagens e PDFs oficiais.
- Backup automático do PostgreSQL, fora da VM, com restauração testada.
- Node e PostgreSQL sem portas públicas; somente o proxy HTTPS recebe acesso externo.

## Código e banco

Use uma conta de implantação autorizada. O repositório público pode ser clonado por HTTPS; o SSH é o acesso à VM.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin ccn-digital
sudo install -d -o "$USER" -g ccn-digital -m 2750 /opt/ccn-digital
umask 027
git clone https://github.com/Gabrielribeiropy/CCN-Digital-Migracao-UFPI.git /opt/ccn-digital/current
cd /opt/ccn-digital/current
npm ci
npm run check
command -v node
```

Os arquivos `.service` usam `/usr/bin/node`. Se `command -v node` mostrar outro caminho, ajuste os modelos antes de instalá-los. Crie usuário e banco exclusivos, sem colocar senha na linha de comando:

```bash
sudo -u postgres createuser --pwprompt ccn_app
sudo -u postgres createdb --owner=ccn_app ccn_digital
```

## Configuração privada

O [modelo de ambiente](ccn-digital.env.example) contém somente nomes. Crie o arquivo privado fora do repositório:

```bash
sudo install -d -o root -g ccn-digital -m 0750 /etc/ccn-digital
sudo install -o root -g ccn-digital -m 0640 deploy/debian/ccn-digital.env.example /etc/ccn-digital/ccn-digital.env
npm run admin:hash
openssl rand -hex 32
openssl rand -hex 32
sudoedit /etc/ccn-digital/ccn-digital.env
```

Defina `DATABASE_URL`, `CCN_PUBLIC_ORIGIN` com a origem HTTPS real, `HOST=127.0.0.1`, `PORT=3000`, `CCN_TRUST_PROXY=loopback`, `CCN_ADMIN_MFA_REQUIRED=true`, usuário e hash de senha inicial. Use chaves aleatórias **diferentes** para `CCN_ADMIN_SESSION_SECRET` e `CCN_MFA_ENCRYPTION_KEY`. A senha do PostgreSQL e as chaves ficam somente no arquivo privado. `CCN_SMTP_*` é opcional para convites e recuperação de senha por e-mail; os avisos de mandato aparecem no painel sem e-mail.

```bash
sudo -u ccn-digital node --env-file=/etc/ccn-digital/ccn-digital.env scripts/verify-vps-env.mjs
sudo -u ccn-digital node --env-file=/etc/ccn-digital/ccn-digital.env scripts/db-migrate.mjs
```

A migração cria tabelas de configuração, contas, sessões, tokens e atividades no banco **já criado**. Pode ser repetida sem apagar dados. Não cria a VM, o usuário PostgreSQL, DNS, certificado nem backup.

## Serviço e HTTPS

```bash
sudo install -o root -g root -m 0644 deploy/debian/ccn-digital.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/debian/ccn-digital-migrate.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/debian/ccn-digital-prune.service /etc/systemd/system/
sudo install -o root -g root -m 0644 deploy/debian/ccn-digital-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start ccn-digital-migrate.service
sudo systemctl enable --now ccn-digital.service ccn-digital-prune.timer
sudo systemctl status ccn-digital.service
```

Inclua [nginx-location.conf](nginx-location.conf) em um `server` HTTPS exclusivo, com certificado administrado pela instituição. Execute `sudo nginx -t` antes de recarregar. O proxy deve sobrescrever `X-Real-IP`; o servidor descarta cabeçalhos de IP enviados diretamente pelo cliente.

## Primeiro acesso e conferência

Abra `https://SUBDOMINIO-REAL/admin`. A conta inicial entra com a senha definida no ambiente privado e cadastra o autenticador pelo QR code. Guarde os três códigos de recuperação. Crie contas individuais no painel; após testar outro administrador, a conta inicial pode ser desativada com `CCN_LEGACY_ADMIN_DISABLED=true`.

```bash
curl -fS https://SUBDOMINIO-REAL/api/admin/health
curl -fS -o /dev/null https://SUBDOMINIO-REAL/admin
curl -fS -o /dev/null 'https://SUBDOMINIO-REAL/api/news?limit=1'
```

Teste também login, segundo fator, permissões, edição e leitura de um link, notícias, imagens, PDFs e páginas oficiais em um Android real. **Mantenha a API anterior ativa até concluir a transição dos Androids instalados.** Veja [operação e continuidade](../../docs/OPERACAO.md).
