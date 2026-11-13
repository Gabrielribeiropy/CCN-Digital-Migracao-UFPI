# Relatório de Auditoria de Segurança — CCN Digital

**Data:** 13/11/2026. **Escopo:** pacote público de painel, API e instalação Debian. **Estado:** branch `main`, sem commit inicial durante a revisão; projeto de origem `f97488b`. **Veredito pré-envio: COM RESSALVAS.** Foi confirmado um achado médio no fluxo recém-adicionado de recuperação do autenticador. A implantação na VM ainda exige homologar PostgreSQL, TLS, backup e autenticação com contas reais.

## Stack detectada

| Camada | Tecnologia e controle |
|---|---|
| Painel | HTML, CSS e JavaScript; campos exibidos via `escapeHtml`; não contém credenciais. |
| API | Node.js com módulos ECMAScript; sessão em cookie HttpOnly, SameSite=Strict e Secure sob HTTPS. |
| Banco | PostgreSQL por `pg`; SQL parametrizado; banco acessado apenas pela API, sem RLS exposto ao cliente. |
| Autenticação | Senha derivada por scrypt, TOTP cifrado com AES-256-GCM, três códigos de recuperação de uso único. |
| Autorização | Papéis administrador, editor e consulta; checagem no servidor por rota e por área. |
| Infraestrutura | Debian, systemd, Nginx HTTPS, Node em loopback; valores privados em arquivo fora do Git. |

## Resultado e pontos fortes

**Contagem de achados confirmados:** crítica 0, alta 0, média 1, baixa 0. `npm audit --omit=dev`: 0 alertas. `npm run check`: 50 testes passaram; 1 teste PostgreSQL foi ignorado por ausência de banco local. O pacote não contém `.env` preenchido, senha, token, APK, PDF ou backup.

### SEC-001 — Redefinição do autenticador sem troca da senha anterior

**Categoria:** autenticação e recuperação. **Severidade:** MÉDIA. **Evidência:** `api/admin/users.mjs:39-42` invalida sessões e remove o segundo fator, mas `api/_lib/admin-users.mjs:55-57` preserva o hash da senha. **Condição de exploração:** após um administrador aprovar a recuperação, alguém que já conheça a senha antiga da conta poderia entrar durante a janela de recadastro e registrar o próprio autenticador antes do titular. **Impacto:** tomada da conta afetada; a ação exige uma redefinição prévia feita por administrador autenticado e conhecimento da senha antiga. **Correção recomendada:** revogar a senha antiga e exigir um link temporário de uso único entregue ao titular para definir nova senha antes de cadastrar o novo TOTP. **Complexidade:** moderada. **Confiança:** alta, pelo fluxo observado. A ação já foi autorizada pelo pedido de recuperação segura, mas não foi aplicada durante esta auditoria somente leitura.

**Rechecagem após a auditoria:** a ação agora define `password_hash=NULL`, incrementa `auth_version`, apaga o TOTP e os códigos antigos e emite um link de uma hora para nova senha. O link é exibido somente ao administrador que acabou de confirmar senha e TOTP, para entrega privada após identificação do titular. `consumeAccessToken` marca o token como usado e a entrada seguinte exige novo cadastro do autenticador. **Achados médios abertos: 0.** Os 50 testes locais passaram novamente; a integração com PostgreSQL real permanece para homologação na VM.

- `api/admin/users.mjs:9-25` exige sessão administrativa, mesmo domínio e limite de alterações; a redefinição de TOTP exige também senha e código atual do **outro** administrador (`users.mjs:26-42`).
- `api/_lib/admin-users.mjs:51-57` busca a conta ativa por ID e invalida suas sessões; `api/_lib/admin-mfa.mjs:97-108` revoga o conjunto de códigos, configuração pendente e chave antiga.
- `api/_lib/admin-auth.mjs:74-108` revalida sessão, papel e versão do fator. `api/_lib/admin-users.mjs` usa consultas SQL parametrizadas.
- `server/debian.mjs:40-56` aceita IP de proxy somente pelo loopback e fixa a origem pública; `api/_lib/fetch-upstream.mjs` valida destino/IP antes de buscar conteúdo externo.
- `public/admin/admin.js` aplica `escapeHtml` ao montar dados no HTML. A API valida novamente o papel e a área; ocultar controles na interface não substitui autorização.

## Checklist de 20 controles

| Controle | Resultado e evidência |
|---|---|
| 1 MFA | Presente: `admin-mfa.mjs`, `login.mjs`. |
| 2 RBAC | Presente: `admin-auth.mjs`, `admin/config.mjs`, `admin/users.mjs`. |
| 3 Limite por IP | Presente: `kv-store.mjs`, `admin-request.mjs`, `public-rate-limit.mjs`. |
| 4 HTTPS | Modelo presente; certificado e redirecionamento reais não verificáveis aqui. |
| 5 Dados em repouso | Scrypt e AES-256-GCM presentes; criptografia do disco da VM não verificável. |
| 6 WAF | Não verificável pela entrega; decisão da infraestrutura. |
| 7 Atividades e logs | Registro de atividades presente; coleta central da VM não verificável. |
| 8 Ambiente privado | Modelo sem valores e `.gitignore`; permissões finais exigem conferência na VM. |
| 9 Backup | Procedimento documentado; automação e restauração não verificáveis aqui. |
| 10 Segredos no Git | Nenhum segredo real encontrado no pacote preparado. |
| 11 Isolamento por ID | IDs administrativos exigem papel; consultas e atualizações restritas no servidor. |
| 12 Rotas administrativas | Sessão e papel conferidos na API. |
| 13 Frontend sensível | Sem chave privada no painel; ações privilegiadas vão à API. |
| 14 RLS | Não se aplica: PostgreSQL não é exposto ao cliente; API usa usuário próprio. |
| 15 Abuso de endpoints | Login, recuperação, segundo fator e proxies têm limites. |
| 16 Manipulação de chamadas | Dados do cliente validados novamente nos handlers. |
| 17 Custos externos | Não há serviço pago obrigatório no pacote; SMTP é opcional. |
| 18 Origem do servidor | Node e banco em rede local conforme modelos; firewall real não verificável. |
| 19 IDs previsíveis | Usuários usam UUID; autorização independe do formato do ID. |
| 20 Links de senha | Token com hash no banco, uso único e expiração; recuperação do fator precisa revogar também a senha antiga (SEC-001). |

## Checklist de 11 práticas

| Prática | Resultado |
|---|---|
| 1 Segredos | Modelos sem valores; arquivo privado fora do Git. |
| 2 API no frontend | Apenas URLs públicas e chamadas do painel; sem chave privada. |
| 3 Validação | Tipo, formato e tamanho conferidos nos handlers e no servidor. |
| 4 Autorização | Papel/área conferidos no servidor. |
| 5 Ataques comuns | SQL parametrizado, escape no painel, validação de URLs/IP e tamanho de corpo. |
| 6 Registro | Alterações de contas e conteúdo registradas; logs da VM não verificáveis. |
| 7 Senhas | Scrypt, senha longa, reset de uso único e expiração. |
| 8 Backup | Roteiro presente; execução real pendente. |
| 9 Dependências | `npm audit --omit=dev`: 0. |
| 10 Transporte | Modelo HTTPS e cabeçalhos básicos; configuração real pendente. |
| 11 Não confiar no painel | A API repete autenticação, papel e validação. |

## Recomendações antes de liberar a VM

1. **P1 — SEC-001 corrigido no código:** homologar com PostgreSQL real que senha antiga, link reutilizado e sessões antigas são recusados.
2. **P1 — Homologação institucional:** criar PostgreSQL, preencher arquivo privado, verificar HTTPS, login e MFA com contas reais e testar o Android. Esses pontos não são falhas confirmadas do código.
3. **P1 — Continuidade do aplicativo:** manter a API antiga para APKs já instalados até haver atualização ou encaminhamento testado.
4. **P2 — Operação:** ativar backup fora da VM, testar restauração e definir monitoramento de serviço, disco e certificado.

## Cobertura, limites e issues

O inventário detalhado está em [inventario-cobertura.md](inventario-cobertura.md). O código, as dependências e os modelos de serviço foram revisados. PostgreSQL real, DNS, certificado, SMTP, firewall, backup e contas institucionais não puderam ser verificados pelo repositório.

## ISSUES PARA O GITHUB

--- ISSUE 1 ---

**Título:** [Segurança] Exigir nova senha após recuperação do autenticador. **Labels sugeridas:** `security`, `medium`. **Descrição e evidência:** SEC-001 em `api/admin/users.mjs:39-42` e `api/_lib/admin-users.mjs:55-57`. A senha antiga permanece válida após a remoção do fator. Quem conhece essa senha pode cadastrar outro TOTP antes do titular. **Sugestão:** revogar senha e sessões, gerar token temporário de uso único e exigir nova senha antes do recadastro.

**Critérios de aceite:** [x] implementação revoga senha, sessões, fator e códigos; [x] token de uso único com expiração; [ ] ensaio completo com PostgreSQL real e contas institucionais na VM.

--- FIM ISSUE 1 ---

Nenhuma linha do código-fonte foi alterada pela etapa de auditoria. Somente os arquivos em `docs/security-audit/` foram criados durante ela.
