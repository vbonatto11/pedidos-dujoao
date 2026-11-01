// Testa as correções da revisão: peso digitado na planilha, gravações em andamento, Ctrl+P, script antigo, foco.
const { chromium } = require('playwright');
const B = 'http://localhost:8790';
const post = async (o) => (await fetch(B + '/exec', { method: 'POST', body: JSON.stringify(o) })).json();
const estado = async () => (await fetch(B + '/__estado')).json();
const editar = async (q) => (await fetch(B + '/__editar?' + new URLSearchParams(q))).text();
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) falhas++; };
const esp = (s) => String(s).replace(/\s+/g, ' ').trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function celula(est, aba, numero, id, coluna) {
  const t = est.abas[aba]; const cab = t[0];
  const nc = cab.indexOf(aba === 'Itens' ? 'Nº pedido' : 'Nº');
  const l = t.find((r, k) => k > 0 && r && String(r[nc]).padStart(4, '0') === numero && (!id || r[cab.indexOf('ID produto')] === id));
  return l[cab.indexOf(coluna)];
}

let b;
(async () => {
  await fetch(B + '/__reset');
  await post({ acao: 'pedido', idEnvio: 'q1', nome: 'Ana Souza', email: 'ana@example.com', whatsapp: '19988887777', itens: [{ id: 'torresmo-180', qtd: 1, preco: 2800 }, { id: 'joelho-porco', qtd: 1, preco: 3990 }] });
  await post({ acao: 'pedido', idEnvio: 'q2', nome: 'Beto Lima', email: 'beto@example.com', itens: [{ id: 'farofa-450', qtd: 1, preco: 2000 }, { id: 'joelho-porco', qtd: 1, preco: 3990 }] });
  await post({ acao: 'pedido', idEnvio: 'q3', nome: 'Cris', email: 'cris@example.com', itens: [{ id: 'joelho-porco', qtd: 1, preco: 3990 }] });
  const token = (await post({ acao: 'entrar', senha: 'senha-teste-123' })).token;
  const pedido = async (n) => (await post({ acao: 'painel', token })).pedidos.find((p) => p.numero === n);

  // 1) peso digitado direto na planilha, sem onEdit (ex.: colado por outro meio): a leitura já soma
  await editar({ aba: 'Itens', numero: '0001', id: 'joelho-porco', coluna: 'Peso (kg)', valor: '1.25', semOnEdit: '1' });
  let p1 = await pedido('0001');
  ok(p1.total === 2800 + 4988 && p1.itens[1].subtotal === 4988, 'peso na planilha sem onEdit: total lido já soma (' + p1.total + ')');
  ok(!('incluido' in p1.itens[1]), 'campo interno não vai para o painel');
  // com onEdit: a planilha fica igual
  await editar({ aba: 'Itens', numero: '0001', id: 'joelho-porco', coluna: 'Peso (kg)', valor: '1.25' });
  let est = await estado();
  ok(celula(est, 'Pedidos', '0001', null, 'Total (R$)') === 77.88 && celula(est, 'Itens', '0001', 'joelho-porco', 'Subtotal (R$)') === 49.88, 'onEdit: Total 77,88 e Subtotal 49,88 na planilha');
  ok(/Joelho de porco semi-pronto \(1,250 kg\)/.test(celula(est, 'Pedidos', '0001', null, 'Itens')), 'onEdit: texto dos itens com o peso');
  p1 = await pedido('0001');
  ok(p1.total === 7788, 'depois do onEdit o total continua 77,88 (sem somar duas vezes): ' + p1.total);
  // corrigir pelo painel depois: troca só o valor do item
  let r = await post({ acao: 'peso', token, numero: '0001', id: 'joelho-porco', peso: 1.3 });
  ok(r.ok && r.pedido.total === 2800 + 5187, 'corrigir pelo painel para 1,300: total ' + r.pedido.total + ' (esperado 7987)');

  // 2) valor do joelho escrito à mão no Subtotal e no Total (antes do campo de peso existir)
  await editar({ aba: 'Itens', numero: '0002', id: 'joelho-porco', coluna: 'Subtotal (R$)', valor: '50' });
  await editar({ aba: 'Pedidos', numero: '0002', coluna: 'Total (R$)', valor: '70' });
  let p2 = await pedido('0002');
  ok(p2.total === 7000 && p2.itens[1].subtotal === 5000, 'valor escrito à mão vale (total 70,00, joelho 50,00)');
  r = await post({ acao: 'peso', token, numero: '0002', id: 'joelho-porco', peso: 1.25 });
  ok(r.ok && r.pedido.total === 2000 + 4988, 'pesar depois troca o valor à mão pelo do peso, sem somar duas vezes: ' + r.pedido.total);

  // 3) item sem Qtd na planilha: erro claro, não "erro interno"
  await editar({ aba: 'Itens', numero: '0003', id: 'joelho-porco', coluna: 'Qtd', valor: '' });
  r = await post({ acao: 'peso', token, numero: '0003', id: 'joelho-porco', peso: 1 });
  ok(!r.ok && r.codigo === 'validacao' && /sem quantidade/.test(r.erro), 'item sem Qtd: ' + r.erro);
  await editar({ aba: 'Itens', numero: '0003', id: 'joelho-porco', coluna: 'Qtd', valor: '1' });

  // ---------- navegador ----------
  b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const q = await ctx.newPage();
  const erros = [];
  q.on('pageerror', (e) => erros.push(e.message));
  await q.goto(B + '/painel.html', { waitUntil: 'networkidle' });
  await q.fill('#senha', 'senha-teste-123'); await q.click('#entrar'); await q.waitForSelector('#app:not([hidden])');
  const kg3 = '.ticket[data-numero="0003"] .ticket__item[data-id="joelho-porco"]';

  // 4) recarga não redesenha o ticket em que você digita (mesmo campo, mesmo texto, sem salvar)
  await q.click(kg3 + ' input');
  await q.keyboard.type('1,2');
  await q.evaluate(() => { document.querySelector('.ticket[data-numero="0003"] input[data-campo="peso"]').dataset.marca = 'x'; });
  await q.evaluate(() => document.getElementById('rodada').dispatchEvent(new Event('change')));
  await q.waitForTimeout(900);
  const foco = await q.evaluate(() => { const a = document.activeElement; return { marca: a.dataset.marca, valor: a.value }; });
  ok(foco.marca === 'x' && foco.valor === '1,2', 'recarga não troca o campo em uso: ' + JSON.stringify(foco));
  ok(!/Peso salvo/.test(await q.textContent('#toast')), 'recarga não salvou o peso pela metade');
  await q.keyboard.type('5');
  await q.keyboard.press('Enter');
  await q.waitForFunction(() => /Peso salvo no pedido nº 0003: 1,250/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok(true, 'continua digitando e salva 1,250');

  // 5) carga que chega durante a gravação é descartada (o ticket não volta para "a pesar")
  await q.route('**/exec', async (route) => {
    const d = route.request().postData() || '';
    if (d.includes('"acao":"peso"')) { await esperar(1500); }
    return route.continue();
  });
  await q.fill(kg3 + ' input', '2');
  await q.click('.ticket[data-numero="0003"] .ticket__nome');
  await q.waitForTimeout(200);
  await q.evaluate(() => document.getElementById('rodada').dispatchEvent(new Event('change'))); // carga no meio da gravação
  await q.waitForFunction(() => /Peso salvo no pedido nº 0003: 2,000/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  const valores = [];
  for (let i = 0; i < 8; i++) { valores.push(esp(await q.textContent(kg3 + ' .ticket__valor'))); await q.waitForTimeout(250); }
  ok(valores.every((v) => v === 'R$ 79,80'), 'depois de salvar, o ticket não volta para "a pesar": ' + [...new Set(valores)].join(' | '));
  await q.unroute('**/exec');

  // 6) Ctrl+P (sem o botão) imprime a lista
  await q.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await q.emulateMedia({ media: 'print' });
  ok(await q.isVisible('#impressao') && /Separar: \d+ itens/.test(await q.textContent('#impressao')), 'Ctrl+P: sai a lista para separar');
  ok(!(await q.isVisible('#app')), 'Ctrl+P: o resto da página não sai');
  await q.emulateMedia({ media: 'screen' });
  // impressão logo depois de pesar: lista e totais batem com os tickets (sem esperar recarga)
  const imp = esp(await q.textContent('#impressao'));
  ok(imp.includes('Joelho de porco semi-pronto (4,550 kg)') && !imp.includes('pesar'), 'impressão usa os pesos da tela: ' + (imp.match(/Joelho[^)]*\)/) || [''])[0]);
  ok(imp.includes('R$ 79,80') && /5 itens\s*R\$ 229,55$/.test(imp), 'total da impressão: ' + imp.slice(-24));

  // 7) produtos: mudança feita durante o "Salvando…" não se perde
  await q.click('#aba-produtos');
  await q.route('**/exec', async (route) => {
    if ((route.request().postData() || '').includes('salvarProdutos')) await esperar(1500);
    return route.continue();
  });
  const pr = (id) => '#produtos-lista .produto[data-id="' + id + '"] input';
  await q.fill(pr('torresmo-180'), '30');
  await q.click('#produtos-salvar');
  await q.waitForTimeout(200);
  ok(await q.isDisabled('#produtos-salvar') && (await q.textContent('#produtos-salvar')) === 'Salvando…', 'botão fica travado durante o envio');
  await q.fill(pr('torresmo-60'), '14');
  ok(await q.isDisabled('#produtos-salvar'), 'digitar outro preço durante o envio não destrava o botão');
  await q.waitForFunction(() => /salva/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  ok((await q.inputValue(pr('torresmo-60'))) === '14' && (await q.textContent('#produtos-mudancas')) === '1 alteração' && !(await q.isDisabled('#produtos-salvar')), 'a mudança feita no meio continua pendente (1 alteração)');
  await q.unroute('**/exec');
  await q.click('#produtos-salvar');
  await q.waitForFunction(() => /salva/.test(document.getElementById('toast').textContent) && document.getElementById('produtos-barra').hidden, null, { timeout: 8000 });
  const cat = (await (await fetch(B + '/exec?acao=catalogo')).json()).produtos;
  ok(cat.find((p) => p.id === 'torresmo-180').preco === 30 && cat.find((p) => p.id === 'torresmo-60').preco === 14, 'os dois preços foram salvos (30 e 14)');

  // 8) painel com o script antigo (sem catálogo): sem campo de peso, com aviso
  const q2 = await ctx.newPage();
  await q2.route('**/exec', async (route) => {
    const resp = await route.fetch();
    const j = await resp.json();
    delete j.catalogo;
    return route.fulfill({ response: resp, body: JSON.stringify(j) });
  });
  await q2.goto(B + '/painel.html', { waitUntil: 'networkidle' });
  await q2.waitForSelector('#app:not([hidden])');
  ok(await q2.$('.ticket[data-numero="0002"] .peso') === null && /atualize o script/.test(await q2.textContent('.ticket[data-numero="0002"] .peso__aviso')), 'script antigo: sem campo de peso, com aviso');
  await q2.close();

  // 9) Ctrl+P na tela de senha: imprime a página normal
  const q3 = await (await b.newContext()).newPage();
  await q3.goto(B + '/painel.html', { waitUntil: 'networkidle' });
  await q3.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  ok(!(await q3.evaluate(() => document.body.classList.contains('imprimir-lista'))), 'Ctrl+P sem entrar: página normal');

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(async (e) => { console.error(e); process.exitCode = 1; if (b) await b.close(); });
