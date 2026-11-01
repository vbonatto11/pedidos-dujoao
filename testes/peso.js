// Testa: peso dos itens por quilo, preços pelo painel e impressão.
const { chromium } = require('playwright');
const B = 'http://localhost:8790';
const SHOTS = process.argv[2] || require('path').join(require('os').tmpdir(), 'dujoao-telas');
const post = async (o) => (await fetch(B + '/exec', { method: 'POST', body: JSON.stringify(o) })).json();
const estado = async () => (await fetch(B + '/__estado')).json();
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) falhas++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function linhaItem(est, numero, id) {
  const it = est.abas.Itens; const cab = it[0];
  const l = it.find((r) => r && String(r[cab.indexOf('Nº pedido')]).padStart(4, '0') === numero && r[cab.indexOf('ID produto')] === id);
  return { peso: l[cab.indexOf('Peso (kg)')], subtotal: l[cab.indexOf('Subtotal (R$)')] };
}
function linhaPedido(est, numero) {
  const pd = est.abas.Pedidos; const cab = pd[0];
  const l = pd.find((r) => r && String(r[cab.indexOf('Nº')]).padStart(4, '0') === numero);
  return { total: l[cab.indexOf('Total (R$)')], itens: l[cab.indexOf('Itens')] };
}

let b;
(async () => {
  await fetch(B + '/__reset');
  await post({ acao: 'pedido', idEnvio: 'p1', nome: 'bia lima', email: 'bia@example.com', whatsapp: '19988887777', itens: [{ id: 'torresmo-180', qtd: 2, preco: 2800 }, { id: 'farofa-450', qtd: 1, preco: 2000 }] });
  await post({ acao: 'pedido', idEnvio: 'p2', nome: 'Caio Prado', email: 'caio@example.com', whatsapp: '19977776666', itens: [{ id: 'vulcao-nozes', qtd: 1, preco: 4990 }, { id: 'joelho-porco', qtd: 1, preco: 3990 }, { id: 'hamburguer-provolone', qtd: 2, preco: 2200 }] });
  await post({ acao: 'pedido', idEnvio: 'p3', nome: 'Duda Reis', email: 'duda@example.com', itens: [{ id: 'joelho-porco', qtd: 2, preco: 3990 }], obs: 'Peças grandes, por favor' });
  await post({ acao: 'pedido', idEnvio: 'p4', nome: 'Eva Cancelada', email: 'eva@example.com', itens: [{ id: 'joelho-porco', qtd: 1, preco: 3990 }] });

  b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const q = await ctx.newPage();
  const erros = [];
  q.on('pageerror', (e) => erros.push(e.message));
  q.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await q.goto(B + '/painel.html', { waitUntil: 'networkidle' });
  await q.fill('#senha', 'senha-teste-123'); await q.click('#entrar'); await q.waitForSelector('#app:not([hidden])');

  // cancela o pedido 4 para ver que ticket cancelado não tem campo de peso
  await q.click('.ticket[data-numero="0004"] .ticket__cancelar');
  await q.click('#dialogo-sim');
  await q.waitForTimeout(400);
  await q.click('[data-filtro="todos"]');

  const T2 = '.ticket[data-numero="0002"]';
  const T3 = '.ticket[data-numero="0003"]';
  const kg2 = T2 + ' .ticket__item[data-id="joelho-porco"]';
  const kg3 = T3 + ' .ticket__item[data-id="joelho-porco"]';

  ok(await q.$(T2 + ' .ticket__item:not(.ticket__item--kg) .peso') === null, 'só item por quilo tem campo de peso');
  ok(await q.getAttribute(kg2 + ' .peso', 'class') === 'peso peso--falta', 'joelho sem peso aparece como "falta"');
  ok((await q.textContent(kg2 + ' .ticket__valor')) === 'a pesar', 'valor do joelho: "a pesar"');
  ok((await q.textContent(kg2 + ' .ticket__produto small')).replace(/\s/g, ' ').includes('R$ 39,90 o kg'), 'mostra o preço do kg');
  ok((await q.textContent(T2 + ' .ticket__total strong')).replace(/\s/g, ' ') === 'R$ 93,90 + peso', 'total antes de pesar: R$ 93,90 + peso');
  ok((await q.textContent(kg3 + ' .peso__calc')) === 'Digite o peso total das 2 peças.', 'duas peças: pede o peso total');

  await q.click('#aba-tickets');
  await (await q.$(T2)).screenshot({ path: SHOTS + '/peso-1-antes.png' });

  // digita 1,25 no pedido 2: conta na hora, sem salvar ainda
  await q.click(kg2 + ' input');
  await q.keyboard.type('1,25');
  const calc = (await q.textContent(kg2 + ' .peso__calc')).replace(/\s/g, ' ');
  ok(calc === '1,250 kg × R$ 39,90 = R$ 49,88', 'conta ao digitar: ' + calc);
  ok((await q.textContent(T2 + ' .ticket__total strong')).replace(/\s/g, ' ') === 'R$ 143,78', 'total do ticket já soma o peso');
  ok(await q.isVisible(kg2 + ' .peso__salvar') && (await q.textContent(kg2 + ' .peso__salvar')) === 'Salvar', 'botão Salvar aparece');
  let href = decodeURIComponent((await q.getAttribute(T2 + ' .ticket__cobrar', 'href')).split('text=')[1]);
  href = href.replace(/\u00a0/g, ' ');
  console.log('      mensagem:\n' + href.split('\n').map((l) => '      | ' + l).join('\n'));
  ok(href.includes('• *1* Joelho de porco semi-pronto - 1,250 kg (R$ 49,88)') && href.includes('*Total: R$ 143,78.*'), 'cobrança já usa o peso digitado');
  await (await q.$(T2)).screenshot({ path: SHOTS + '/peso-2-digitando.png' });

  // sai do campo: salva sozinho
  await q.click(T2 + ' .ticket__nome');
  await q.waitForFunction(() => /Peso salvo no pedido nº 0002: 1,250\skg/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok(!(await q.isVisible(kg2 + ' .peso__salvar')), 'depois de salvar, o botão some');
  ok((await q.inputValue(kg2 + ' input')) === '1,250', 'campo mostra 1,250');
  let est = await estado();
  let li = linhaItem(est, '0002', 'joelho-porco');
  ok(li.peso === 1.25 && li.subtotal === 49.88, 'planilha Itens: peso 1,25 e subtotal 49,88 (' + li.peso + ', ' + li.subtotal + ')');
  let lp = linhaPedido(est, '0002');
  ok(lp.total === 143.78 && /Joelho de porco semi-pronto \(1,250 kg\)/.test(lp.itens), 'planilha Pedidos: total 143,78 e itens com o peso (' + lp.total + ')');

  // pedido 3: "2350" vira 2,350 kg; Enter salva
  await q.click(kg3 + ' input');
  await q.keyboard.type('2350');
  ok((await q.textContent(kg3 + ' .peso__calc')).replace(/\s/g, ' ') === '2,350 kg × R$ 39,90 = R$ 93,77', '"2350" entendido como 2,350 kg');
  await q.keyboard.press('Enter');
  await q.waitForFunction(() => /Peso salvo no pedido nº 0003: 2,350\skg/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  est = await estado();
  ok(linhaPedido(est, '0003').total === 93.77, 'Enter salva: total do pedido 3 = 93,77');

  // inválido e depois apagar o peso
  await q.fill(kg3 + ' input', '');
  await q.click(kg3 + ' input');
  await q.keyboard.type('abc');
  ok((await q.getAttribute(kg3 + ' .peso', 'class')).includes('peso--erro') && (await q.textContent(kg3 + ' .peso__calc')) === 'Confira o peso. Exemplo: 1,250', 'texto inválido avisa');
  ok(!(await q.isVisible(kg3 + ' .peso__salvar')), 'inválido: sem botão salvar');
  ok((await q.textContent(T3 + ' .ticket__total strong')).replace(/\s/g, ' ') === 'R$ 93,77', 'inválido não mexe no total');
  await q.fill(kg3 + ' input', '');
  ok((await q.textContent(kg3 + ' .peso__salvar')) === 'Salvar', 'campo vazio: dá para salvar (volta para a pesar)');
  await q.click(kg3 + ' .peso__salvar');
  await q.waitForFunction(() => /Peso apagado no pedido nº 0003/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  est = await estado();
  li = linhaItem(est, '0003', 'joelho-porco');
  ok(li.peso === '' && li.subtotal === '' && linhaPedido(est, '0003').total === 0, 'apagar o peso volta o pedido 3 para R$ 0,00 + peso');
  ok((await q.textContent(kg3 + ' .ticket__valor')) === 'a pesar', 'ticket volta para "a pesar"');

  // impressão antes de pesar o pedido 3: linha para anotar o peso
  await q.evaluate(() => { window.print = () => { window.__imprimiu = (window.__imprimiu || 0) + 1; }; });
  await q.waitForTimeout(1600); // recarga automática depois de salvar
  await q.click('#aba-resumo');
  const prodTxt = (await q.textContent('#lista-produtos')).replace(/\s+/g, ' ');
  ok(prodTxt.includes('Joelho de porco semi-pronto (1,250 kg + a pesar)'), 'resumo por produto mostra kg + a pesar');
  await q.check('input[name="papel"][value="80"]', { force: true });
  await q.click('#imprimir');
  ok(await q.evaluate(() => window.__imprimiu === 1), 'botão Imprimir chama a impressão');
  const imp = (await q.textContent('#impressao')).replace(/\s+/g, ' ');
  ok(/Separar: 9 itens/.test(imp), 'impressão: Separar 9 itens');
  ok(imp.includes('Joelho de porco semi-pronto (1,250 kg + pesar)'), 'impressão: joelho com kg + pesar');
  ok(imp.includes('1 Joelho de porco semi-pronto (1,250 kg, R$ 49,88)'), 'impressão: pedido do Caio com peso e valor');
  ok((await q.$$('#impressao .imp__peso')).length === 1, 'impressão: 1 linha para anotar o peso (pedido 3)');
  ok(!imp.includes('Eva'), 'impressão: pedido cancelado fica de fora');
  await q.emulateMedia({ media: 'print' });
  for (const papel of ['80', '58']) {
    await q.evaluate((pp) => { document.getElementById('impressao').className = 'impressao impressao--' + pp; }, papel);
    const caixa = await (await q.$('#impressao')).boundingBox();
    ok(Math.abs(caixa.width - (papel === '80' ? 72 : 48) * 96 / 25.4) < 2, 'largura ' + papel + ' mm: ' + Math.round(caixa.width) + 'px');
    await q.screenshot({ path: SHOTS + '/impressao-' + papel + '.png', fullPage: true });
  }
  await q.emulateMedia({ media: 'screen' });

  // pedido 3 com 2,35 de novo, depois marca o 2 como pago
  await q.click('#aba-tickets');
  await q.fill(kg3 + ' input', '2,35');
  await q.click(T3 + ' .ticket__nome');
  await q.waitForFunction(() => /Peso salvo no pedido nº 0003: 2,350\skg/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  await q.click(T2 + ' .alternar[data-campo="pago"]');
  await q.waitForTimeout(1800);
  await q.click('#aba-resumo');
  const pesTxt = (await q.textContent('#lista-pessoas')).replace(/\s+/g, ' ');
  ok(pesTxt.includes('Caio Prado') && pesTxt.includes('R$ 143,78') && pesTxt.includes('R$ 93,77') && !/\+ peso/.test(pesTxt), 'valores por pessoa já com o peso: ' + pesTxt);
  const r = await post({ acao: 'entrar', senha: 'senha-teste-123' });
  ok(/Joelho de porco semi-pronto\*: 3 \(1 Caio Prado, 2 Duda Reis\), 3,600 kg/.test(r.resumo.textoProdutos), 'texto para o DuJOÃO: 3 peças, 3,600 kg');
  ok(r.resumo.total === 7600 + 14378 + 9377, 'total da rodada: ' + r.resumo.total);

  // script antigo (sem a ação peso): mensagem clara
  await q.click('#aba-tickets');
  await q.route('**/exec', async (route) => {
    const d = route.request().postData() || '';
    if (d.includes('"acao":"peso"')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"codigo":"acao","erro":"Ação desconhecida."}' });
    return route.continue();
  });
  await q.fill(kg3 + ' input', '2,4');
  await q.click(T3 + ' .ticket__nome');
  await q.waitForFunction(() => /atualize o script da planilha/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok((await q.textContent(kg3 + ' .peso__salvar')) === 'Tentar de novo' && (await q.textContent(kg3 + ' .peso__calc')).includes('Não salvou.'), 'falha ao salvar: "Não salvou." + Tentar de novo');
  await q.unroute('**/exec');
  await q.click(kg3 + ' .peso__salvar');
  await q.waitForFunction(() => /Peso salvo no pedido nº 0003: 2,400\skg/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok(linhaPedido(await estado(), '0003').total === 95.76, 'Tentar de novo salva (2,4 kg = R$ 95,76)');
  await q.screenshot({ path: SHOTS + '/peso-3-tickets.png', fullPage: true });

  // cancelado não tem campo
  ok(await q.$('.ticket[data-numero="0004"] .peso') === null || !(await q.isVisible('.ticket[data-numero="0004"]')), 'cancelado sem campo de peso');

  // preços pelo painel
  await q.click('#aba-produtos');
  const torr = '#produtos-lista .produto[data-id="torresmo-180"]';
  await q.fill(torr + ' input', 'abc');
  ok((await q.getAttribute(torr + ' .produto__preco', 'class')).includes('erro') && await q.isDisabled('#produtos-salvar'), 'preço inválido marca vermelho e trava o salvar');
  await q.fill(torr + ' input', '29,5');
  await q.click('#produtos-lista .produto[data-id="pururuca-135"] .interruptor');
  ok((await q.textContent('#produtos-mudancas')) === '2 alterações', 'barra: 2 alterações');
  await q.screenshot({ path: SHOTS + '/produtos.png', fullPage: false });
  await q.click('#produtos-salvar');
  await q.waitForFunction(() => /Alterações salvas/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok(await q.isHidden('#produtos-barra'), 'barra some depois de salvar');
  ok((await q.inputValue(torr + ' input')) === '29,50', 'preço formatado 29,50');
  const cat = await (await fetch(B + '/exec?acao=catalogo')).json();
  const t180 = cat.produtos.find((p) => p.id === 'torresmo-180');
  const pur = cat.produtos.find((p) => p.id === 'pururuca-135');
  ok(t180.preco === 29.5 && pur.disponivel === false, 'catálogo do site: torresmo 29,50 e pururuca esgotada');

  const s = await ctx.newPage();
  s.on('pageerror', (e) => erros.push('site: ' + e.message));
  await s.goto(B + '/', { waitUntil: 'networkidle' });
  const site = (await s.textContent('#cardapio')).replace(/\s+/g, ' ');
  ok(site.includes('R$ 29,50'), 'site mostra o preço novo');
  ok(/Pururuca 135 g.*Esgotado/i.test(site), 'site mostra pururuca esgotada');

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(async (e) => { console.error(e); process.exitCode = 1; if (b) await b.close(); });
