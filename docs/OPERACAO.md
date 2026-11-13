# Operação e atualizações

## Ligação com o Android

O APK instalado guarda o endereço da API escolhido quando foi gerado. Salvar links, ordem de cards, Conselho, notícias manuais e configurações no painel altera dados que o aplicativo lê pela API; isso não exige um APK novo. Mudar o **endereço da API** ou o **código Android** exige distribuir uma atualização compatível do aplicativo.

Para mudar a hospedagem sem interromper os celulares existentes:

1. Instale painel, API e PostgreSQL no novo endereço HTTPS e importe os dados editoriais.
2. Teste o endereço novo em um Android real, incluindo notícias, fotos, PDFs, links e atualização de dados pelo painel.
3. Prepare uma atualização Android apontando para a nova API. Mantenha a API antiga atendendo os aparelhos que ainda não receberam essa atualização. Um encaminhamento entre endereços também pode ser usado, mas precisa ser implantado e testado antes de qualquer corte.
4. Só desative a API antiga depois de confirmar a migração dos aparelhos. Instalar apenas o painel na VM **não** redireciona o APK existente.

## Dados e PostgreSQL

`scripts/db-migrate.mjs` aplica `db/001_initial.sql`. Ele cria as tabelas necessárias dentro do banco previamente criado; não apaga registros existentes. Antes de importar dados, faça backup. A configuração editorial pode ser exportada na origem com `node scripts/config-transfer.mjs export CAMINHO` e importada na VM com `node scripts/config-transfer.mjs import CAMINHO --apply`, sempre com as credenciais corretas no ambiente privado de cada lado. O arquivo contém conteúdo institucional e deve ficar fora do Git, com acesso restrito, até o descarte seguro. Senhas, sessões e contadores não são transferidos.

Faça backup periódico de todo o banco PostgreSQL, retenha uma cópia fora da VM e ensaie a restauração em ambiente separado. Monitore espaço em disco, certificado, serviço, logs e atualizações de segurança do Debian e do Node.

## Recuperação de acesso

- **Senha ou nome de usuário:** se SMTP institucional estiver configurado, o próprio titular solicita instruções por e-mail. Sem SMTP, um administrador pode gerar um link temporário e entregá-lo pessoalmente após confirmar a identidade. O link é individual e de uso único.
- **Autenticador perdido, com código de recuperação:** após a senha, use um dos três códigos. Ele permite cadastrar outro autenticador e gera novos códigos.
- **Autenticador e todos os códigos perdidos:** outro administrador entra com sua própria senha e TOTP, confirma a identidade do titular por procedimento institucional e escolhe **Usuários e permissões → Redefinir autenticador**. A senha antiga, os códigos antigos e as sessões são revogados. O painel mostra um link de uso único, válido por uma hora, para entrega privada ao titular. Ele define uma nova senha e cadastra outro QR code. O evento fica no registro de atividades. Dados como data de nascimento ou e-mail informado na tela não substituem essa verificação.
- **Único administrador sem acesso:** o operador autorizado da VM confirma a identidade por procedimento institucional e usa `scripts/provision-mfa.mjs --legacy-admin --replace` ou `--user=UUID --replace`, com ambiente privado carregado. A saída contém chave e códigos que devem ser entregues somente ao titular, sem salvar em Git, logs ou chamados. Este é um procedimento excepcional da operação, não uma rota pública.

## Atualização de código na VM

Execute primeiro em homologação. Registre o commit em uso, faça backup e confira as mudanças. Na VM:

```bash
cd /opt/ccn-digital/current
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run check
sudo systemctl start ccn-digital-migrate.service
sudo systemctl restart ccn-digital.service
sudo systemctl status ccn-digital.service
```

Confira `/api/admin/health`, login, segundo fator, edição e leitura de um item e acesso no Android. Se falhar, volte ao commit anterior e restaure o backup correspondente. Nunca coloque arquivo de ambiente, exportação do banco ou códigos de recuperação no repositório.
