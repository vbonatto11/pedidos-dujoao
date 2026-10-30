# Pedidos DuJOÃO

Site de pedidos e painel de tickets para os pedidos coletivos DuJOÃO, A Casa do Torresmo.

- **Site de pedidos:** https://vbonatto11.github.io/pedidos-dujoao/
- **Painel (com senha):** https://vbonatto11.github.io/pedidos-dujoao/painel.html

## Como funciona

1. A pessoa abre o link, escolhe os produtos com **+** e **−**, confere o pedido e confirma com nome e e-mail.
2. O pedido é gravado na sua **Planilha Google** (abas Pedidos e Itens). Os preços são conferidos pela aba Produtos.
3. A pessoa recebe um e-mail de confirmação com os itens, o total e o PIX. Você recebe um aviso a cada pedido.
4. No **painel**, cada pedido vira um ticket: você marca **Pago**, **Entregue** ou cancela. A aba **Resumo** junta tudo por produto, pronto para copiar e mandar no WhatsApp.

Enquanto a planilha não estiver ligada, o site continua funcionando: o botão vira "Enviar pedido pelo WhatsApp".

---

## 1. Ligar o site no GitHub Pages (uma vez)

No GitHub, abra o repositório **pedidos-dujoao** → **Settings** → **Pages**.
Em *Build and deployment*: **Source: Deploy from a branch**, **Branch: main**, pasta **/ (root)** → **Save**.
Em 1 ou 2 minutos o site fica no ar no endereço acima.

## 2. Criar a planilha e o script (uma vez, uns 5 minutos, pelo computador)

1. Abra **sheets.new** e dê o nome **Pedidos DuJOÃO** à planilha.
2. Menu **Extensões → Apps Script**.
3. Apague o código que aparece e cole **todo** o conteúdo do arquivo `apps-script/Codigo.gs`.
4. No começo do código, troque `'TROQUE-ESTA-SENHA'` por uma senha sua (mínimo 6 caracteres). É a senha do painel.
5. Clique no disquete para salvar.
6. Na barra de cima, escolha a função **configurar** e clique em **Executar**.
   O Google pede autorização: **Revisar permissões** → escolha sua conta → **Avançado** → **Acessar Pedidos DuJOÃO (não seguro)** → **Permitir**.
   O aviso de "não seguro" aparece porque o script é seu e não passou pela verificação do Google. Ele só mexe nesta planilha e manda e-mails pela sua conta.
7. Volte para a planilha: devem aparecer as abas **Pedidos**, **Itens**, **Produtos** e **Resumo**, e o menu **DuJOÃO**.
8. No Apps Script: **Implantar → Nova implantação** → engrenagem → **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
9. Abra `config.js` aqui no GitHub (lápis para editar), cole a URL em `urlPlanilha: ''` e salve com **Commit changes**.

## 3. Testar

1. Faça um pedido de teste no site com o seu e-mail.
2. Confira: o e-mail de confirmação chegou, o aviso de pedido novo chegou e a linha apareceu na aba Pedidos.
3. Entre no painel com a senha, veja o ticket e cancele o pedido de teste.

---

## No dia a dia

- **Compartilhar:** mande o link do site no grupo. A prévia no WhatsApp mostra o logo.
- **Controlar:** no painel, filtre por *A pagar* ou *A entregar* e marque os tickets. Toque no telefone do ticket para falar com a pessoa no WhatsApp.
- **Pedir ao DuJOÃO:** aba **Resumo → Copiar para o WhatsApp**.
- **Cobrar:** aba **Resumo → Copiar valores** (quem já pagou aparece com "(pago)").
- **Fechar para novos pedidos:** desligue *Recebendo pedidos* no Resumo.
- **Aviso no topo do site:** por exemplo "Pedidos até quinta". Fica no Resumo.
- **Nova rodada:** quando fechar o pedido com o DuJOÃO, toque em *Começar nova rodada*. Os pedidos antigos ficam salvos e aparecem no seletor de rodada.

Também dá para marcar Pago, Entregue e Cancelado direto na planilha. O Resumo se atualiza sozinho.

## Mudar preços e produtos

Tudo pela aba **Produtos** da planilha:

- **Preço:** mude a coluna *Preço (R$)*.
- **Esgotou:** desmarque *Disponível*. O produto aparece como indisponível no site.
- **Produto novo:** adicione uma linha com um *ID* novo (sem espaços, por exemplo `linguica-cheddar`). Use uma *Categoria* que já existe para ele entrar na mesma seção.
- **Por quilo:** escreva `kg` em *Unidade*. O site mostra "pelo peso" e não soma no total.

O site lê a aba Produtos toda vez que alguém abre a página. As fotos ficam em `assets/img` e são ligadas pelo ID em `assets/catalogo.js`.

## Se mudar o código do script

Depois de editar no Apps Script: **Implantar → Gerenciar implantações** → lápis → *Versão*: **Nova versão** → **Implantar**. A URL continua a mesma.

## Limites

Uma conta Gmail comum manda cerca de 100 e-mails por dia por script. Cada pedido usa 2 (cliente + aviso para você). Se passar disso, mude `AVISAR_A_CADA_PEDIDO` para `false`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html`, `assets/loja.js` | Página de pedidos |
| `painel.html`, `assets/painel.js` | Painel de tickets |
| `assets/estilo.css` | Visual das duas páginas |
| `config.js` | URL da planilha, WhatsApp e PIX |
| `assets/catalogo.js` | Produtos padrão e fotos |
| `apps-script/Codigo.gs` | Script da planilha (backend) |
