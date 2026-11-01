# Pedidos DuJOÃO (B2C): contexto para o Claude

Site de pedidos coletivos e painel de controle para as vendas que o Vinicius faz da DuJOÃO, A Casa do Torresmo (empresa do pai dele, João Bonatto), entre os colegas de trabalho. Os pedidos são juntados em **rodadas** semanais, separados na loja do pai, entregues e cobrados por PIX depois da entrega.

- Site: https://vbonatto11.github.io/pedidos-dujoao/
- Painel (com senha): https://vbonatto11.github.io/pedidos-dujoao/painel.html
- Guia de uso e instalação para o Vinicius: `LEIAME.md`

## Como o Vinicius usa

1. Manda o link do site no grupo. Cada pessoa escolhe os produtos, confirma com nome e e-mail e recebe um e-mail de confirmação.
2. No painel, aba **Resumo**, copia o pedido total para o WhatsApp do pai e imprime a lista para separar, numa térmica de 80 mm.
3. Pesa o que é vendido por quilo e digita o peso no ticket. Marca **Entregue** e **Pago**, e cobra pelo botão **Cobrar no WhatsApp**.
4. Quando fecha a semana, começa uma **rodada nova**. As rodadas antigas continuam no seletor.

## Arquitetura

- **Front:** HTML, CSS e JavaScript puro, sem build e sem dependências, publicado pelo GitHub Pages (branch `main`, raiz, com `.nojekyll`). Cada `push` na `main` vai para o ar em cerca de 1 minuto.
- **Backend:** Google Apps Script (`apps-script/Codigo.gs`), ligado à planilha "Pedidos DuJOÃO" da conta Google do Vinicius.
  - Está implantado como App da Web, executando como o dono e com acesso para qualquer pessoa.
  - A URL `/exec` fica em `config.js` (`urlPlanilha`).
- **Chamadas:**
  - `GET ?acao=catalogo`.
  - `POST` com JSON no corpo, como `text/plain`, para não ter preflight de CORS.
  - As respostas são `{ ok, codigo, erro, ... }`.
- **Ações do POST:**
  - Públicas: `pedido`, `catalogo`, `entrar`.
  - Com token do painel: `painel`, `marcar`, `loja`, `novaRodada`, `salvarProdutos`, `peso`.
- **Planilha:**
  - Abas `Pedidos`, `Itens`, `Produtos` e `Resumo`.
  - As colunas são achadas pelo nome do cabeçalho (`CAMPOS` no script), e `aba_()` cria as colunas que faltarem.
  - A aba `Resumo` é reescrita pelo script.
- **Propriedades do script:**
  - `SENHA_PAINEL`, `SAL_PAINEL`: senha e sal do painel.
  - `RODADA`: rodada atual.
  - `ABERTO`: `sim` ou `nao`.
  - `AVISO`: aviso do topo do site.
  - `SEQ`: último número de pedido.
  - `PLANILHA_ID`: planilha ligada ao script.
  - A senha nunca fica no código.

| Arquivo | O que é |
| --- | --- |
| `index.html`, `assets/loja.js` | Site de pedidos (carrinho, comanda, envio, visor de foto, repetir último pedido) |
| `painel.html`, `assets/painel.js` | Painel: Tickets, Resumo (copiar, imprimir, abrir/fechar, aviso, rodada) e Produtos |
| `assets/estilo.css` | Visual das duas páginas, incluindo `@media print` da impressão |
| `assets/catalogo.js` | Catálogo de reserva e fotos (`foto` 640 px e `fotoGrande` em `.webp`) |
| `config.js` | URL do script, WhatsApp, PIX, responsável, Instagram |
| `apps-script/Codigo.gs` | Backend: pedidos, e-mails, painel, resumo, menu da planilha |
| `testes/` | Simulador do Apps Script e testes com Playwright (veja `testes/LEIAME.md`) |

## Regras que não podem quebrar

- **Dinheiro** é guardado em centavos no JavaScript e em reais na planilha.
- **Preço:** o servidor confere o preço pela aba `Produtos`. Se o preço que o cliente viu mudou, ele devolve `codigo: 'preco'` com o catálogo novo e o site pede para confirmar de novo.
- **Pedido repetido:** um envio repetido com o mesmo `idEnvio`, na mesma rodada e em até 24 h, devolve o mesmo pedido.
- **Ordem de gravação:** os itens são gravados antes da linha em `Pedidos`, porque é essa linha que confirma o pedido.
- **Texto livre** vai para a planilha com apóstrofo na frente (`texto_`), para não virar fórmula nem número.
- **Itens por quilo** (`unidade: 'kg'`, hoje o joelho de porco):
  - Sem peso, ficam "a pesar", fora do total. O total aparece com "+ peso".
  - Com peso, o valor é `round(preçoDoKgEmCentavos × gramas / 1000)`, e o painel e a planilha fazem a mesma conta.
  - A coluna `Subtotal` de `Itens` guarda o valor que **já está somado** no `Total` do pedido.
  - Ao salvar um peso (`salvarPeso_`), o total troca só a diferença. Assim, um ajuste feito à mão no total continua valendo.
  - Um peso digitado direto na aba `Itens` entra no total na leitura (`lerPedidos_`). O `onEdit` (`conciliarPesos_`) acerta a planilha.
- **Pessoa no resumo:** é o mesmo e-mail com o mesmo nome (`chaveCliente_`).
  - Dois nomes com o mesmo e-mail aparecem separados.
  - O mesmo nome com e-mails diferentes ganha o começo do e-mail entre parênteses.
- **"Em aberto"** é o pedido não cancelado que ainda não está pago **e** entregue ao mesmo tempo.
- **Segurança do painel:**
  - O token é `SHA-256(sal:senha)`. Trocar a senha desconecta todos os aparelhos.
  - Depois de 8 senhas erradas, o painel bloqueia por 10 minutos (`CacheService`).
- **Limites:**
  - No máximo 6 pedidos por e-mail por hora e 60 pedidos a cada 10 minutos.
  - O Gmail comum manda cerca de 100 e-mails por dia, e cada pedido usa 2.
- **Mensagem de cobrança:** o formato foi combinado com o Vinicius. Um item por linha (`• *2* Torresmo - 180g/cada`), total em negrito, PIX do João Bonatto e "Muito obrigado!!".
- **E-mail de confirmação:** o cabeçalho é só texto, sem imagem externa, para não cair no spam.

## Painel: detalhes que já deram problema

- Ele recarrega a cada 60 s. Toda gravação usa `inicioMutacao()` / `fimMutacao()`, e as cargas que chegam durante uma gravação são descartadas.
- **Campo de peso:**
  - O que foi digitado fica em `pesosEdicao` e aparece na hora (`pedidoEfetivo`).
  - O ticket em que se está digitando não é redesenhado.
  - O peso salva no `change`, no Enter ou no botão.
- **Aba Produtos:** o que muda durante um "Salvando…" continua pendente.
- **Impressão:**
  - É montada a partir dos pedidos da tela (`montarImpressao`, `produtosDe`).
  - O botão espera o logo carregar. O Ctrl+P também imprime a lista (`beforeprint` mais a classe `imprimir-lista`).
  - Tem três larguras: 80 mm (72 mm úteis), 58 mm (48 mm) e A4.
- **Script antigo:** o painel precisa funcionar com o script anterior até o Vinicius atualizar. Por exemplo, sem `dados.catalogo`, ele esconde o campo de peso e mostra um aviso.

## Visual

- Cores: vinho `#641312` e ouro `#F8A828`.
- Fontes: Bodoni Moda nos títulos, Archivo na interface e em **todos os números**, porque o "1" da Bodoni parece um "I".
- Pensado primeiro para o celular:
  - alvos de toque de 44 px;
  - hover só dentro de `@media (hover: hover)`, no fim do CSS;
  - campos com 16 px, para o iPhone não dar zoom.
- Elementos visuais: comanda e tickets em "papel" com borda serrilhada (`.serrilha`), fita dourada em SVG no topo do site, e selos de peso no lugar da foto quando o produto não tem foto.
- O `Intl` em pt-BR usa espaço não separável (`R$ 28,00`). Cuidado em regex e em testes.
- O CSS novo entra antes do bloco `/* Efeitos de passar o mouse` em `estilo.css`.

## Como publicar

- **Site e painel:** commit e push na `main`. O navegador pode guardar a versão antiga por até 10 minutos (Ctrl+F5).
- **Script:**
  - Quando `apps-script/Codigo.gs` muda, o Vinicius precisa colar o código novo no Apps Script e criar uma **Nova versão** da implantação (passo a passo no `LEIAME.md`). A URL não muda.
  - Junte as mudanças de script para ele atualizar uma vez só, e avise sempre que uma atualização for necessária.
- **Commits:** em português, curtos, dizendo o que mudou para quem usa.

## Testes

```bash
node testes/servidor.js 8790   # site e painel locais; senha do painel: senha-teste-123
bash testes/rodar.sh           # todos os testes
```

O simulador roda o `Codigo.gs` de verdade, com uma planilha em memória. Teste no simulador antes de publicar. Para mudanças maiores, vale também uma revisão independente.

## Pendências

- **Fotos dos produtos:**
  - Gere a versão de 640 px e a grande (`-g`) em `.webp`, em `assets/img`.
  - Ligue as duas em `assets/catalogo.js` (`foto` e `fotoGrande`).
  - O visor de foto já funciona para qualquer produto que tenha foto.
