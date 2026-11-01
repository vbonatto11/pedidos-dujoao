# Testes

Tudo roda no seu computador, sem tocar na planilha de verdade.

## O simulador

`servidor.js` roda o `apps-script/Codigo.gs` de verdade dentro do Node, com uma planilha em memória (abas Pedidos, Itens, Produtos e Resumo). Ele também serve o site e troca a URL do `config.js` pela do simulador.

```bash
node testes/servidor.js 8790
```

- Site: http://localhost:8790/
- Painel: http://localhost:8790/painel.html. A senha é `senha-teste-123`.
- Os e-mails "enviados" ficam numa pasta temporária: `dujoao-emails-8790`.

Variáveis opcionais:

| Variável | O que faz |
| --- | --- |
| `ATRASO` | Atraso de cada resposta em ms (padrão 250) |
| `MAX_LINHAS` | Linhas de cada aba (padrão 1000). Valores baixos testam a aba crescendo |
| `COTA` | Cota de e-mails do dia (padrão 100) |

Rotas só de teste:

| Rota | O que faz |
| --- | --- |
| `/__reset` | Começa do zero |
| `/__estado` | Mostra todas as abas, as propriedades e os e-mails |
| `/__produto?id=…&preco=…&disponivel=0` | Muda um produto como se fosse na aba Produtos |
| `/__editar?aba=Itens&numero=0002&id=joelho-porco&coluna=Peso (kg)&valor=1.25` | Edita uma célula como se fosse à mão e dispara o `onEdit` (com `semOnEdit=1`, não dispara) |
| `/__email?n=1` | Mostra o e-mail número n |
| `/__exec?f=atualizarResumo` | Roda uma função do script |

## Rodar todos os testes

Precisa de Node 18 ou mais novo e do Playwright com Chromium:

```bash
npm i -D playwright && npx playwright install chromium
bash testes/rodar.sh
```

O `rodar.sh` sobe o simulador na porta 8790, roda cada arquivo e mostra `OK` ou `FALHA` por verificação. As capturas de tela ficam em `/tmp/dujoao-telas`.

| Arquivo | O que testa |
| --- | --- |
| `api-teste.js` | Pedido, preço que mudou, limites, senha e bloqueio do painel, aba que cresce |
| `api-peso.js` | Ação `peso`: validações, troca do valor no total, apagar o peso |
| `peso.js` | Campo de peso no ticket, cobrança, impressão 80/58 mm, aba Produtos |
| `peso2.js` | Peso digitado na planilha, recargas durante gravação, Ctrl+P, script antigo |
| `imp-logo.js` | Logo na impressão, quem pediu (mesmo e-mail com nomes diferentes), selo "kg" no site |
| `regressao.js` | Site: catálogo, loja fechada, esgotado, telas pequenas |
| `novos.js` | Repetir último pedido e mensagem de cobrança |
| `visor.js` | Foto do produto em tela cheia com zoom |
| `filtro.js`, `cobranca.js` | Filtros dos tickets e texto da cobrança, mostrados na tela |

Os textos de dinheiro usam espaço não separável (`R$ 28,00`). Nos testes, compare com `\s` ou troque ` ` por espaço.
