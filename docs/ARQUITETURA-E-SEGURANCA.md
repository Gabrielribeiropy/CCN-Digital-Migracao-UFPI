# Arquitetura e segurança

O navegador do responsável abre `public/admin/`. A API Node em `server/debian.mjs` atende rotas `/api/admin/*` e fornece ao Android `/api/app-config`, `/api/news`, `/api/media` e `/api/portal`. O Nginx publica o serviço em HTTPS e encaminha as requisições ao Node em `127.0.0.1:3000`. O PostgreSQL guarda configuração, contas, sessões, limites de tentativa, chaves TOTP cifradas e atividades. O banco não é acessado diretamente pelo navegador ou Android.

| Área | Responsabilidade |
|---|---|
| Conteúdo | Links, setores, ordem, Conselho, contatos e notícias manuais são editados no painel e persistidos no PostgreSQL. |
| Notícias oficiais | A API consulta fontes públicas oficiais e mantém cache; o painel controla exibição e também aceita notícia manual. |
| Contas | Papéis e áreas são conferidos na API, além da apresentação visual do painel. |
| Segundo fator | Cada conta possui seu TOTP; chave cifrada em repouso, três códigos de recuperação de uso único e sessões revogadas na redefinição. |
| Conteúdo externo | URLs e IPs de destino são validados; requisições têm limites de tempo, tamanho e frequência. |
| Operação | Chaves, senha de banco, SMTP e certificado ficam fora do Git. A VM precisa de backup, atualização e monitoramento. |

O painel e a API foram preparados para a VM, mas a segurança final depende também da configuração real de HTTPS, proxy, banco, permissões, backup e administração das contas. Faça a conferência de instalação antes de liberar o serviço. Nenhum sistema deve ser tratado como imune a invasões.

## Conferência antes de publicar

1. Execute `npm ci`, `npm run check` e `npm audit --omit=dev` no commit exato a instalar.
2. Confira que `DATABASE_URL`, segredos de sessão e MFA, SMTP, exportações e chaves privadas não estão no Git nem em logs.
3. Teste senha errada, limite de tentativas, TOTP obrigatório, código de recuperação usado duas vezes, redefinição por outro administrador e revogação de sessão.
4. Teste papéis de administrador, editor e consulta nas rotas da API, não somente na interface.
5. Confirme banco sem porta pública, Node em loopback, HTTPS válido e cópia restaurável do backup.
