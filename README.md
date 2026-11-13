# CCN Digital — painel e API

Este repositório entrega o **painel administrativo e a API** do CCN Digital para uma máquina virtual Debian. O aplicativo Android fica instalado nos celulares e consulta a API por HTTPS. A visualização do aplicativo no navegador não faz parte desta instalação.

O código contém o esquema do banco, os serviços e os arquivos de configuração de referência. **Nenhuma credencial ou dado de produção está no Git.** A equipe responsável pela VM preenche os valores privados no servidor.

## Comece por aqui

1. [Instalação por SSH na VM Debian](deploy/debian/README.md)
2. [Operação, atualização e continuidade do Android](docs/OPERACAO.md)
3. [Arquitetura e segurança](docs/ARQUITETURA-E-SEGURANCA.md)

| Caminho | Função |
|---|---|
| `public/admin/` | Interface do painel |
| `api/` | API pública e administrativa |
| `server/debian.mjs` | Servidor HTTP local, atrás do proxy HTTPS |
| `db/001_initial.sql` | Tabelas e índices PostgreSQL |
| `scripts/` | Migração, verificação, limpeza e transferência de conteúdo |
| `deploy/debian/` | Modelos de Nginx, systemd e ambiente |
| `tests/` | Testes da API e das regras do painel |

Para futuras mudanças, publique aqui apenas a versão aprovada do painel e da API. Na VM, a equipe atualiza a branch `main` seguindo o [roteiro de operação](docs/OPERACAO.md). Conteúdo salvo no painel chega ao Android pela API; alterações no código Android ou no endereço da API exigem atualização do aplicativo.
