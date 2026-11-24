# Atualização 1.2.1 na VPS — correção da nova senha e do visual do painel

Correção rápida sobre a [1.2.0](ATUALIZACAO-1.2.0.md). Não mexe no banco, no `.env` nem no APK.

## O que corrige

- **"Cannot read properties of null (reading 'reset')" ao definir a nova senha.** A senha era salva, mas o painel quebrava logo depois e mostrava o erro. Quem tentava de novo recebia "Link inválido" ou "Muitas solicitações. Tente mais tarde.". Agora aparece "Senha definida. Volte ao login para entrar." e o botão é desativado para o link não ser reenviado. O mesmo erro acontecia em "Esqueci minha senha" e "Esqueci meu usuário", e também foi corrigido.
- **Painel com visual misturado depois da 1.2.0:** botão cinza "Perdi o autenticador…", título grande demais em "Verificar acesso", assinatura da Averotech desalinhada, "Ver tutorial" sem formatação. O proxy da UFPI guarda o `admin.css` e o `admin.js` em cache por cerca de 1h30, e o navegador combinava o HTML novo com o CSS antigo. Os arquivos agora levam a versão no endereço (`admin.css?v=1.2.1`), e cada atualização força o arquivo novo.

## 1. Atualizar

```bash
cd /opt/ccn-digital/current
git pull --ff-only
sudo systemctl restart ccn-digital.service
sudo systemctl status ccn-digital.service
```

Não é preciso rodar `npm ci`: as dependências não mudaram.

## 2. Conferir

Em `https://ccndigital.ufpi.br/admin`, aperte **Ctrl+F5** uma vez e confira:

- [ ] A assinatura "Desenvolvido com a tecnologia da Averotech ↗" aparece centralizada abaixo dos links, sem sublinhado azul.
- [ ] Na tela "Verificar acesso", o botão "Perdi o autenticador e os códigos de recuperação" aparece como link discreto, não como botão cinza.
- [ ] Em **Usuários**, gere o link de um usuário novo ("Gerar link para entrega pessoal"), abra-o em uma janela anônima e defina a senha. Deve aparecer "Senha definida. Volte ao login para entrar." sem erro, e o login com a nova senha deve funcionar.

Para confirmar que a VPS está na versão nova:

```bash
curl -s https://ccndigital.ufpi.br/admin/ | grep -o 'admin.css?v=[0-9.]*'
```

Deve mostrar `admin.css?v=1.2.1`.

## Quem já tentou definir a senha e recebeu erro

- A senha digitada na **primeira** tentativa foi salva. A pessoa pode entrar com ela normalmente.
- Se não lembrar a senha, o administrador gera um link novo em **Usuários → Gerar link seguro**.
- "Muitas solicitações" é o limite de 5 tentativas de recuperação por hora a partir do mesmo endereço. O bloqueio some sozinho em até 1 hora.

## Se algo der errado

- Logs: `journalctl -u ccn-digital.service -n 100 --no-pager`.
- Voltar à 1.2.0: `git checkout <commit anterior> && sudo systemctl restart ccn-digital.service`. O commit anterior aparece em `git log --oneline -2`.
