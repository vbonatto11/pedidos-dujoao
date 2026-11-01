const { chromium } = require('playwright');
const OUT = process.argv[2] || require('path').join(require('os').tmpdir(), 'dujoao-telas');
const B = 'http://localhost:8790';
const post = async (o) => (await fetch(B + '/exec', { method: 'POST', body: JSON.stringify(o) })).json();
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) falhas++; };
const esp = (s) => String(s).replace(/\s+/g, ' ').trim();
let b;
(async () => {
  await fetch(B + '/__reset');
  await post({ acao: 'pedido', idEnvio: 'r1', nome: 'Marina Alves', email: 'vini@example.com', itens: [{ id: 'torresmo-180', qtd: 1, preco: 2800 }, { id: 'torresmo-60', qtd: 3, preco: 1300 }, { id: 'pururuca-135', qtd: 1, preco: 1500 }, { id: 'farofa-160', qtd: 1, preco: 800 }] });
  await post({ acao: 'pedido', idEnvio: 'r2', nome: 'Rafael Costa', email: 'rafa@example.com', itens: [{ id: 'vulcao-cheddar', qtd: 1, preco: 4990 }, { id: 'porchetta-400', qtd: 1, preco: 3000 }] });
  await post({ acao: 'pedido', idEnvio: 'r3', nome: 'Vinicius', email: 'vini@example.com', itens: [{ id: 'torresmo-180', qtd: 2, preco: 2800 }, { id: 'torresmo-60', qtd: 1, preco: 1300 }, { id: 'pururuca-135', qtd: 1, preco: 1500 }] });
  const r = await post({ acao: 'entrar', senha: 'senha-teste-123' });
  const t180 = r.resumo.produtos.find((p) => p.id === 'torresmo-180');
  ok(t180.quem.map((q) => q.qtd + ' ' + q.nome).join(', ') === '1 Marina Alves, 2 Vinicius', 'resumo (planilha): Torresmo 180 g = ' + t180.quem.map((q) => q.qtd + ' ' + q.nome).join(', '));
  ok(/Torresmo 180 g\*: 3 \(1 Marina Alves, 2 Vinicius\)/.test(r.resumo.textoProdutos), 'texto para o DuJOÃO separa Marina e Vinicius');
  ok(r.resumo.pessoas.map((p) => p.nome + ' ' + p.total).join(' | ') === 'Marina Alves 9000 | Rafael Costa 7990 | Vinicius 8400', 'valores por pessoa separados: ' + r.resumo.pessoas.map((p) => p.nome + ' ' + p.total).join(' | '));

  b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const q = await ctx.newPage();
  const erros = [];
  q.on('pageerror', (e) => erros.push(e.message));
  await q.goto(B + '/painel.html', { waitUntil: 'networkidle' });
  await q.fill('#senha', 'senha-teste-123'); await q.click('#entrar'); await q.waitForSelector('#app:not([hidden])');
  await q.evaluate(() => { window.__imprimiu = 0; window.print = () => { window.__imprimiu++; }; });
  await q.click('#aba-resumo');
  await q.click('#imprimir');
  await q.waitForFunction(() => window.__imprimiu === 1, null, { timeout: 4000 });
  ok(true, 'Imprimir chamou a impressão uma vez');
  const logos = await q.$$eval('#impressao .imp__logo', (l) => l.map((i) => ({ ok: i.complete && i.naturalWidth > 0 })));
  ok(logos.length === 2 && logos.every((x) => x.ok), 'logo carregado dos dois lados do cabeçalho');
  const imp = esp(await q.textContent('#impressao'));
  const sem = imp.replace(/\s/g, '');
  ok(sem.includes('Torresmo180g1MarinaAlves,2Vinicius') && sem.includes('Torresmo60g3MarinaAlves,1Vinicius') && sem.includes('Pururuca135g1MarinaAlves,1Vinicius'), 'impressão: quem pediu está certo');
  await q.emulateMedia({ media: 'print' });
  for (const papel of ['80', '58']) {
    await q.evaluate((pp) => { document.getElementById('impressao').className = 'impressao impressao--' + pp; }, papel);
    await (await q.$('#impressao')).screenshot({ path: OUT + '/imp-logo-' + papel + '.png' });
  }
  await q.emulateMedia({ media: 'screen' });

  const s = await ctx.newPage();
  await s.goto(B + '/', { waitUntil: 'networkidle' });
  const tile = await s.$('.item[data-id="joelho-porco"] .item__foto');
  ok((await tile.textContent()) === 'kgpelo peso' && !(await s.$('.item[data-id="joelho-porco"] .item__foto img')), 'site: joelho mostra "kg pelo peso" no lugar do emblema');
  await tile.screenshot({ path: OUT + '/joelho-tile.png' });
  await (await s.$('.item[data-id="joelho-porco"]')).screenshot({ path: OUT + '/joelho-item.png' });
  ok(!erros.length, 'sem erros' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exitCode = falhas ? 1 : 0;
})().catch(async (e) => { console.error(e); process.exitCode = 1; if (b) await b.close(); });
