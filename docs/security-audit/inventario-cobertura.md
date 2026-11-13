# Cobertura da revisão — 13/11/2026

Estado inicial: repositório público recém-criado, branch `main`, sem commit; arquivos da entrega ainda não rastreados. Projeto de origem: branch `main`, commit `f97488b`, com sete arquivos alterados para recuperação do autenticador. A revisão não modificou o código-fonte.

| Camada | Arquivos e rotas revisados |
|---|---|
| Painel | `public/admin/index.html`, `admin.js`, `admin.css`; login, segundo fator, usuários, conteúdo, notícias, Conselho e aviso. |
| API pública | `api/app-config.mjs`, `news.mjs`, `media.mjs`, `portal.mjs`. |
| API administrativa | `api/admin/login.mjs`, `logout.mjs`, `config.mjs`, `users.mjs`, `recovery.mjs`, `health.mjs`, `diagnostics.mjs`; handlers `me.mjs`, `mfa.mjs`, `notifications.mjs`. |
| Identidade e dados | `admin-auth.mjs`, `admin-mfa.mjs`, `admin-users.mjs`, `admin-request.mjs`, `kv-store.mjs`, `postgres-store.mjs`, `config-store.mjs`, `db/001_initial.sql`. |
| Entradas externas | `fetch-upstream.mjs`, `public-rate-limit.mjs`, `news-service.mjs`, `news-presentation.mjs`. |
| Infraestrutura | `server/debian.mjs`, `deploy/debian/*`, `scripts/*`, `package.json`, `package-lock.json`, `.gitignore`. |

Os IDs de conta entram por `users.mjs` e são restritos a administrador; `me.mjs` altera apenas a própria conta; avisos usam a identidade da sessão. As queries em `admin-users.mjs` e `postgres-store.mjs` usam parâmetros. Botões ocultos no painel não foram considerados controles de segurança: as rotas foram verificadas separadamente.

Fora do repositório: configuração efetiva de DNS, TLS, firewall, VPN, PostgreSQL, backup, SMTP, logs e acesso SSH da VM. O teste de integração PostgreSQL foi ignorado por não haver banco local de homologação.
