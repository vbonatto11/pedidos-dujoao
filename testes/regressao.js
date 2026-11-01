const { chromium } = require('playwright');
const B = 'http://localhost:8790';
const OUT = process.argv[2] || require('path').join(require('os').tmpdir(), 'dujoao-telas');
let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) falhas++; };
const estado = async () => (await fetch(B + '/__estado')).json();
const post = async (o) => (await fetch(B + '/exec', { method: 'POST', body: JSON.stringify(o) })).json();
async function celular(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); falhas++; });
  return { ctx, p };
}
async function preencher(p, nome) {
  await p.fill('#nome', nome); await p.fill('#email', nome.toLowerCase().replace(/\s/g, '.') + '@example.com');
}
(async () => {
  const browser = await chromium.launch();

  // 1. falha de rede + carrinho alterado não duplica
  await fetch(B + '/__reset');
  { const { ctx, p } = await celular(browser);
    let derrubou = false;
    await p.route('**/exec', async (route) => {
      if (route.request().method() === 'POST' && !derrubou) { derrubou = true; await route.fetch(); return route.abort(); }
      return route.continue();
    });
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    await p.click('.item[data-id="torresmo-180"] .qtd__mais');
    await p.click('#abrir'); await preencher(p, 'Teste Rede');
    await p.click('#confirmar');
    await p.waitForSelector('#alerta:not([hidden])');
    ok(/internet/.test(await p.textContent('#alerta')), 'falha de rede mostra aviso');
    await p.click('#linhas .qtd__mais');
    await p.click('#confirmar');
    await p.waitForSelector('#etapa-sucesso:not([hidden])');
    const e = await estado();
    ok(e.abas.Pedidos.length - 1 === 1, 'só 1 pedido gravado depois da falha + alteração (' + (e.abas.Pedidos.length - 1) + ')');
    ok(/já tinha sido registrado/.test(await p.textContent('#etapa-sucesso')), 'confirmação avisa que o pedido anterior já valia');
    // fechar a folha mantém acesso à confirmação
    await p.click('#fechar'); await p.waitForTimeout(450);
    ok(await p.isVisible('#barra.barra--visivel') && /Pedido confirmado/.test(await p.textContent('#barra')), 'barra mostra "Pedido confirmado" depois de fechar');
    await p.click('#abrir'); await p.waitForTimeout(450);
    ok(await p.isVisible('#etapa-sucesso'), 'tocar na barra reabre a confirmação');
    await p.screenshot({ path: OUT + '/r1-reaberto.png' });
    await ctx.close(); }

  // 2. preço mudou na planilha com o carrinho aberto
  await fetch(B + '/__reset');
  { const { ctx, p } = await celular(browser);
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    for (let i = 0; i < 3; i++) await p.click('.item[data-id="farofa-160"] .qtd__mais');
    await fetch(B + '/__produto?id=farofa-160&preco=10');
    await p.click('#abrir'); await preencher(p, 'Teste Preco');
    await p.click('#confirmar');
    await p.waitForSelector('#alerta:not([hidden])');
    ok(/preço/.test(await p.textContent('#alerta')), 'pedido com preço velho é barrado com aviso');
    ok((await p.textContent('#total-valor')).includes('30,00'), 'total atualizado para R$ 30,00: ' + await p.textContent('#total-valor'));
    await p.click('#confirmar');
    await p.waitForSelector('#etapa-sucesso:not([hidden])');
    ok((await p.textContent('#etapa-sucesso')).includes('30,00'), 'pedido confirmado com o preço novo');
    const guardado = await p.evaluate(() => localStorage.getItem('dujoao.catalogo.v1'));
    ok(guardado && guardado.includes('"preco":10'), 'catálogo da planilha guardado no aparelho');
    await ctx.close(); }

  // 3. loja fechada com aviso + 4. painel segue a rodada nova
  await fetch(B + '/__reset');
  { const tok = (await post({ acao: 'entrar', senha: 'senha-teste-123' })).token;
    await post({ acao: 'loja', token: tok, aberto: false, aviso: 'Voltamos a receber na segunda.' });
    const { ctx, p } = await celular(browser);
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    const aviso = await p.textContent('#aviso');
    ok(/fechados/.test(aviso) && /segunda/.test(aviso), 'loja fechada mostra aviso do dono junto: "' + aviso + '"');
    ok((await p.textContent('#fita-texto')) === 'Pedidos fechados', 'fita diz "Pedidos fechados"');
    ok(await p.isDisabled('.item[data-id="torresmo-180"] .qtd__mais'), 'botões + desativados');
    await p.screenshot({ path: OUT + '/r3-fechada.png' });
    await post({ acao: 'loja', token: tok, aberto: true, aviso: '' });
    await ctx.close();
    // painel aberto em outro aparelho
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const q = await pc.newPage();
    await q.goto(B + '/painel.html', { waitUntil: 'networkidle' });
    await q.fill('#senha', 'senha-teste-123'); await q.click('#entrar');
    await q.waitForSelector('#app:not([hidden])');
    ok(!(await q.evaluate(() => localStorage.getItem('dujoao.painel.token') || '')).includes('senha'), 'painel guarda token, não a senha');
    await post({ acao: 'novaRodada', token: tok });
    await post({ acao: 'pedido', idEnvio: 'r2', nome: 'Rodada Dois', email: 'r2@example.com', itens: [{ id: 'torresmo-60', qtd: 1, preco: 1300 }] });
    await q.click('#atualizar'); await q.waitForTimeout(900);
    ok(/2 \(atual\)/.test(await q.textContent('#rodada')) && (await q.$$('.ticket')).length === 1, 'painel passou sozinho para a rodada 2 com o pedido novo');
    await pc.close(); }

  // 5. computador 1366x768: botão para seguir sempre visível
  await fetch(B + '/__reset');
  { const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage();
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    for (const id of ['torresmo-180', 'pururuca-135', 'farofa-450', 'linguica-toscana', 'vulcao-nozes', 'banha-400', 'codeguim-500']) await p.click(`.item[data-id="${id}"] .qtd__mais`);
    const box = await p.locator('#ir-dados').boundingBox();
    ok(box && box.y + box.height <= 768, 'desktop: "Continuar para seus dados" visível (y=' + Math.round(box.y) + ')');
    await p.screenshot({ path: OUT + '/r5-desktop.png' });
    await p.click('#ir-dados'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.activeElement.id === 'nome'), 'Continuar leva ao campo de nome');
    await ctx.close(); }

  // 6. último chip, foco e toast
  { const { ctx, p } = await celular(browser);
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    await p.click('.chip[data-alvo="secao-resfriados"]'); await p.waitForTimeout(1500);
    ok((await p.getAttribute('.chip[data-alvo="secao-resfriados"]', 'aria-current')) === 'true', 'tocar em Resfriados marca Resfriados');
    await p.focus('.item[data-id="banha-400"] .qtd__mais'); await p.keyboard.press('Enter');
    await p.focus('.item[data-id="banha-400"] .qtd__menos'); await p.keyboard.press('Enter');
    ok(await p.evaluate(() => document.activeElement.closest('.qtd') && document.activeElement.classList.contains('qtd__mais')), 'tirar o último item deixa o foco no +');
    await p.click('.item[data-id="torresmo-60"] .qtd__mais');
    await fetch(B + '/__produto?id=torresmo-60&disponivel=0');
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    const t = await p.locator('#toast').boundingBox();
    const txt = await p.textContent('#toast');
    ok(t && t.width > 250 && /Torresmo 60/.test(txt), 'toast largo e diz qual produto saiu: "' + txt + '"');
    ok(/Esgotado/.test(await p.textContent('.item[data-id="torresmo-60"]')), 'produto esgotado aparece como "Esgotado"');
    await p.screenshot({ path: OUT + '/r6-esgotado.png' });
    await ctx.close(); }

  // 7. selos de peso e 320px sem rolagem lateral
  { const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= 320), 'loja em 320px sem rolagem lateral');
    ok((await p.$$('.item__foto--selo')).length >= 12, 'produtos sem foto mostram o peso (' + (await p.$$('.item__foto--selo')).length + ')');
    await p.evaluate(() => document.querySelector('#secao-prontos').scrollIntoView());
    await p.screenshot({ path: OUT + '/r7-320.png' });
    await p.goto(B + '/painel.html', { waitUntil: 'networkidle' });
    await p.fill('#senha', 'senha-teste-123'); await p.click('#entrar'); await p.waitForSelector('#app:not([hidden])');
    await p.click('#aba-resumo'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= 320), 'resumo do painel em 320px sem rolagem lateral');
    await ctx.close(); }

  console.log(falhas ? falhas + ' FALHA(S)' : 'tudo certo');
  await browser.close();
})();
