# Atualização 1.2.0 na VPS — painel administrativo e APK

Roteiro para atualizar a instalação Debian em `/opt/ccn-digital/current`, que já roda o CCN Digital (veja [README.md](README.md) e [OPERACAO.md](../../docs/OPERACAO.md)). Siga na ordem e só distribua o APK 1.2.0 no fim.

## O que muda

- **Criação de usuário corrigida.** O bloco "Redefinir autenticador" era um formulário dentro do formulário de configurações; o navegador o descartava e o script do painel parava antes do botão "Criar usuário". Agora o cadastro, a redefinição e o Enter nos campos funcionam.
- **Qualquer e-mail válido** é aceito no cadastro, inclusive de servidores terceirizados. A variável `CCN_ADMIN_EMAIL_DOMAINS` deixou de existir.
- **Perdi o autenticador:** depois da senha correta, a pessoa pode receber um código de 6 dígitos no e-mail cadastrado (10 minutos, até 5 tentativas), apagar o autenticador antigo e cadastrar outro. Depende de SMTP.
- **E-mails formatados** em nome de "CCN Digital": convite, nova senha, lembrete de usuário, código do autenticador e avisos de senha alterada, permissões alteradas e autenticador redefinido. Sem SMTP, nada é enviado e o painel continua funcionando.
- **Painel:** mensagens de erro em vermelho e de sucesso em verde, botão "Copiar chave" no cadastro do autenticador, QR Code em preto, tutorial de primeiro acesso (só no computador), topo e avisos ajustados para celular.
- `api/admin/shared-routes.mjs` passou para `api/_lib/shared-admin-routes.mjs`. Não exige ação na VPS.

## 1. Atualizar o código

```bash
cd /opt/ccn-digital/current
git pull --ff-only
npm ci
sudo systemctl restart ccn-digital.service
sudo systemctl status ccn-digital.service
journalctl -u ccn-digital.service -n 50 --no-pager
```

Não há migração de banco nesta versão.

## 2. Ajustar `/etc/ccn-digital/ccn-digital.env`

Edite como root e mantenha a permissão `0640`. Nunca copie valores deste arquivo para o Git, chamados ou mensagens.

1. Confirme `CCN_PUBLIC_ORIGIN=https://ccndigital.ufpi.br`. Os links de convite e de nova senha usam esse endereço.
2. Se existir a linha `CCN_ADMIN_EMAIL_DOMAINS`, apague-a.
3. Configure o envio pela conta institucional `ccn_digital@ufpi.edu.br` (Google Workspace da UFPI):
   - Na conta, ative a verificação em duas etapas e crie uma **senha de app** em https://myaccount.google.com/apppasswords. Se a opção não aparecer, a STI precisa liberar senhas de app para a conta.
   - Preencha:

     ```
     CCN_SMTP_HOST=smtp.gmail.com
     CCN_SMTP_PORT=587
     CCN_SMTP_USER=ccn_digital@ufpi.edu.br
     CCN_SMTP_PASSWORD=<senha de app de 16 letras, sem espaços>
     CCN_SMTP_FROM=ccn_digital@ufpi.edu.br
     ```

4. Reinicie: `sudo systemctl restart ccn-digital.service`.
5. Confira que o envio está ativo: `curl -s https://ccndigital.ufpi.br/api/admin/recovery` deve responder `{"available":true}`.

## 3. Importar o conteúdo editorial da Vercel

A VPS ainda tem a configuração inicial (Conselho, cards da tela inicial, links e ordem dos setores). O conteúdo atual foi exportado da Vercel em 24/11/2026 para um arquivo JSON entregue **por canal privado**, fora do Git, porque contém nomes e contatos do Conselho.

```bash
sudo install -m 0600 -o root -g root config-vercel-2026-11-24.json /root/
cd /opt/ccn-digital/current
sudo bash -c 'set -a; . /etc/ccn-digital/ccn-digital.env; set +a; node scripts/config-transfer.mjs import /root/config-vercel-2026-11-24.json --apply'
```

A importação substitui a configuração editorial da VPS. Depois de conferir o painel, apague o arquivo: `sudo shred -u /root/config-vercel-2026-11-24.json`.

## 4. Testar antes de liberar o APK

No navegador, em `https://ccndigital.ufpi.br/admin`:

- [ ] Login com senha errada mostra a mensagem em vermelho.
- [ ] Login correto e código do autenticador abrem o painel. No computador, o tutorial aparece no primeiro acesso.
- [ ] Cards, páginas, serviços, Conselho e notícias batem com a Vercel.
- [ ] **Usuários → + Novo usuário** com e-mail que não seja `@ufpi.edu.br`: cria o usuário e o convite chega formatado.
- [ ] O mesmo com "Gerar link para entrega pessoal": o link aparece e funciona.
- [ ] Na tela do código, "Perdi o autenticador e os códigos de recuperação" envia o código; com ele, o painel pede novo cadastro e chega o e-mail de aviso.
- [ ] **Redefinir autenticador** de outro usuário gera o link e envia o e-mail.
- [ ] No celular: topo, menu da conta e avisos (sino) cabem na tela.

No aplicativo, as rotas usadas pelo Android devem responder 200:

```bash
for p in app-config news portal media; do curl -s -o /dev/null -w "$p %{http_code}\n" https://ccndigital.ufpi.br/api/$p; done
```

## 5. Distribuir o APK 1.2.0

O APK 1.2.0 (versionCode 10) já está compilado e aponta para `https://ccndigital.ufpi.br`. As mudanças desta atualização são do servidor e não exigem novo APK. Distribua somente depois dos passos 3 e 4; antes disso, quem instalar veria o conteúdo antigo.

## Se algo der errado

- Logs: `journalctl -u ccn-digital.service -n 100 --no-pager`.
- `{"available":false}` na recuperação: alguma variável `CCN_SMTP_*` falta ou está inválida, ou `CCN_PUBLIC_ORIGIN` não é HTTPS.
- Convite não chega: confira a senha de app e a caixa de spam. O usuário já fica criado; use "Gerar link seguro" na lista.
- Voltar à versão anterior: `git checkout 6ee3ec2 && npm ci && sudo systemctl restart ccn-digital.service`.
