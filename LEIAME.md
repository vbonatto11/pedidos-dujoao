# Pedidos DuJOÃO

Site de pedidos e painel de tickets para os pedidos coletivos DuJOÃO, A Casa do Torresmo.

- **Site de pedidos:** https://vbonatto11.github.io/pedidos-dujoao/
- **Painel (com senha):** https://vbonatto11.github.io/pedidos-dujoao/painel.html

## Como funciona

1. A pessoa abre o link, escolhe os produtos com **+** e **−**, confere o pedido e confirma com nome e e-mail.
2. O pedido é gravado na sua **Planilha Google** (abas Pedidos e Itens). Os preços são conferidos pela aba Produtos: se um preço mudou, o site avisa e mostra o valor novo antes de confirmar.
3. A pessoa recebe um e-mail de confirmação com os itens, o total e o PIX. Você recebe um aviso a cada pedido.
4. No **painel**, cada pedido vira um ticket: você marca **Pago**, **Entregue** ou cancela. A aba **Resumo** junta tudo por produto, pronto para copiar e mandar no WhatsApp ou imprimir. A aba **Produtos** muda preços e o que está à venda.

Enquanto a planilha não estiver ligada, o site continua funcionando: o botão vira "Enviar pedido pelo WhatsApp".

---

## 1. Ligar o site no GitHub Pages (uma vez)

No GitHub, abra o repositório **pedidos-dujoao** → **Settings** → **Pages**.
Em *Build and deployment*: **Source: Deploy from a branch**, **Branch: main**, pasta **/ (root)** → **Save**.
Em 1 ou 2 minutos o site fica no ar no endereço acima.

## 2. Criar a planilha e o script (uma vez, uns 5 minutos, pelo computador)

1. Abra **sheets.new** e dê o nome **Pedidos DuJOÃO** à planilha.
2. Menu **Extensões → Apps Script**. Apague o código que aparece, cole **todo** o conteúdo do arquivo `apps-script/Codigo.gs` e clique no disquete para salvar.
3. **Implantar → Nova implantação** → engrenagem ao lado de "Selecionar tipo" → **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique em **Implantar**.
4. O Google pede autorização: **Autorizar acesso** → escolha sua conta → **Avançado** → **Acessar Pedidos DuJOÃO (não seguro)** → **Permitir**.
   O aviso de "não seguro" aparece porque o script é seu e não passou pela verificação do Google. Ele só mexe nesta planilha e manda e-mails pela sua conta.
5. Copie a **URL do app da Web** (termina em `/exec`).
6. Volte para a aba da planilha e recarregue a página. Aparece o menu **DuJOÃO** no topo: **DuJOÃO → Definir senha do painel** e crie uma senha (mínimo 8 caracteres). Se o Google pedir autorização de novo, autorize e clique no menu outra vez.
   As abas **Pedidos**, **Itens**, **Produtos** e **Resumo** são criadas sozinhas.
7. Abra `config.js` aqui no GitHub (lápis para editar), cole a URL em `urlPlanilha: ''` e salve com **Commit changes**.

## 3. Testar

1. Faça um pedido de teste no site com o seu e-mail.
2. Confira: o e-mail de confirmação chegou, o aviso de pedido novo chegou e a linha apareceu na aba Pedidos.
3. Entre no painel com a senha, veja o ticket e cancele o pedido de teste.

---

## No dia a dia

- **Compartilhar:** mande o link do site no grupo. A prévia no WhatsApp mostra o logo.
- **Controlar:** a lista *Em aberto* mostra só o que falta pagar ou entregar. Quando um ticket fica **Pago** e **Entregue**, ele vai para *Concluídos*. *Todos* mostra a rodada inteira. Toque no telefone do ticket para falar com a pessoa no WhatsApp.
- **Pedir ao DuJOÃO:** aba **Resumo → Copiar resumo para o WhatsApp**.
- **Imprimir para separar:** aba **Resumo → Imprimir para separar**. Escolha o papel (**Térmica 80 mm**, **Térmica 58 mm** ou **A4**) e o que sai: o total de cada produto para separar e/ou um bloco por pessoa, com caixinhas para ir marcando. Na janela de impressão, escolha a impressora térmica, margens **Nenhuma** e escala **100%**. O painel lembra a sua escolha de papel.
- **Itens por quilo (joelho):** no ticket aparece o campo **Peso**. Digite o peso da balança em quilos (`1,250`) ou em gramas (`1250`) e saia do campo: o valor é calculado pelo preço do kg, somado no total do pedido e já entra na mensagem de cobrança e no resumo. Se o pedido tem 2 peças, digite o peso das duas juntas. Apagar o peso volta o item para "a pesar". Na impressão, item ainda sem peso sai com uma linha para anotar.
- **Cobrar:** aba **Resumo → Copiar valores**. Quem já pagou aparece com "(pago)", e quem pagou só parte aparece com quanto falta.
- **Fechar para novos pedidos:** desligue *Recebendo pedidos* no Resumo.
- **Aviso no topo do site:** por exemplo "Pedidos até quinta". Fica no Resumo.
- **Nova rodada:** quando fechar o pedido com o DuJOÃO, toque em *Começar nova rodada*. Os pedidos antigos ficam salvos e aparecem no seletor de rodada.

Também dá para marcar Pago, Entregue e Cancelado direto na planilha. O Resumo se atualiza sozinho.
Pessoas com o mesmo nome e e-mails diferentes aparecem separadas no resumo, com o começo do e-mail entre parênteses.

## Mudar preços e produtos

**Pelo painel (celular ou computador):** aba **Produtos**. Mude o preço ou desligue o que acabou e toque em **Salvar**. O site passa a usar os valores novos na hora. Pedidos que já foram feitos continuam com o preço da época.

**Pela planilha**, na aba **Produtos** (também serve para produto novo):

- **Preço:** mude a coluna *Preço (R$)*.
- **Esgotou:** desmarque *Disponível*. O produto aparece como esgotado no site.
- **Produto novo:** adicione uma linha com um *ID* novo (sem espaços, por exemplo `linguica-cheddar`). Use uma *Categoria* que já existe para ele entrar na mesma seção.
- **Por quilo:** escreva `kg` em *Unidade*. O site mostra "pelo peso" e não soma no total. Depois de pesar, digite o peso no ticket do painel (veja *No dia a dia*).

O site lê a aba Produtos toda vez que alguém abre a página. As fotos ficam em `assets/img` e são ligadas pelo ID em `assets/catalogo.js`.

Pode inserir colunas novas nas abas e mudar a ordem delas. Só não renomeie os cabeçalhos que o script criou.

## Senha do painel

A senha não fica no código. Para trocar: **DuJOÃO → Definir senha do painel**. Isso desconecta o painel de todos os aparelhos.
Depois de 8 senhas erradas seguidas, o painel bloqueia novas tentativas por 10 minutos.

## Atualizar o script (quando o código mudar aqui no GitHub)

1. Abra `apps-script/Codigo.gs` aqui no GitHub → botão **Raw** → selecione tudo e copie.
2. Na planilha: **Extensões → Apps Script**. Apague o código antigo, cole o novo e clique no disquete.
3. **Implantar → Gerenciar implantações** → lápis → *Versão*: **Nova versão** → **Implantar**. A URL continua a mesma, não precisa mexer no `config.js`.

A coluna nova *Peso (kg)* aparece sozinha na aba Itens no primeiro uso.

## Limites

- Uma conta Gmail comum manda cerca de 100 e-mails por dia por script. Cada pedido usa 2 (cliente + aviso para você). Se passar disso, mude `AVISAR_A_CADA_PEDIDO` para `false`.
- Para evitar abuso, o mesmo e-mail faz no máximo 6 pedidos por hora, e o site aceita até 60 pedidos a cada 10 minutos. Os números ficam no `CONFIG` do script.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html`, `assets/loja.js` | Página de pedidos |
| `painel.html`, `assets/painel.js` | Painel de tickets |
| `assets/estilo.css` | Visual das duas páginas |
| `config.js` | URL da planilha, WhatsApp e PIX |
| `assets/catalogo.js` | Produtos padrão e fotos |
| `apps-script/Codigo.gs` | Script da planilha (backend) |
