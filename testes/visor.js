const { chromium } = require('playwright');
const OUT = process.argv[2] || require('path').join(require('os').tmpdir(), 'dujoao-telas');
const B = 'http://localhost:8790';
let f = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) f++; };
const escala = (p) => p.$eval('#visor-foto', (i) => { const m = getComputedStyle(i).transform; if (m === 'none') return 1; return Number(m.match(/matrix\(([^,]+)/)[1]); });
(async () => {
  await fetch(B + '/__reset');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); f++; });
  await p.goto(B + '/', { waitUntil: 'networkidle' });
  await p.click('.item[data-id="torresmo-180"] [data-ver]');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById('visor').open), 'tocar na foto abre o visor');
  ok((await p.getAttribute('#visor-foto', 'src')).includes('torresmo-180-g.webp'), 'usa a foto grande');
  await p.screenshot({ path: OUT + '/v1-aberto.png' });
  // toque duplo (simulado com dois toques)
  const box = await p.locator('#visor-palco').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await p.touchscreen.tap(cx + 40, cy - 30); await p.waitForTimeout(80); await p.touchscreen.tap(cx + 40, cy - 30);
  await p.waitForTimeout(400);
  const s1 = await escala(p);
  ok(s1 > 2.3, 'toque duplo dá zoom (escala ' + s1.toFixed(2) + ')');
  await p.screenshot({ path: OUT + '/v2-zoom.png' });
  await p.touchscreen.tap(cx, cy); await p.waitForTimeout(80); await p.touchscreen.tap(cx, cy);
  await p.waitForTimeout(400);
  ok((await escala(p)) === 1, 'toque duplo de novo volta ao normal');
  // pinça com dois dedos (eventos de ponteiro)
  await p.evaluate(({ cx, cy }) => {
    const el = document.getElementById('visor-palco');
    const ev = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
    ev('pointerdown', 1, cx - 30, cy); ev('pointerdown', 2, cx + 30, cy);
    for (let k = 1; k <= 10; k++) { ev('pointermove', 1, cx - 30 - k * 6, cy); ev('pointermove', 2, cx + 30 + k * 6, cy); }
    ev('pointerup', 1, cx - 90, cy); ev('pointerup', 2, cx + 90, cy);
  }, { cx, cy });
  const s2 = await escala(p);
  ok(s2 > 2.8 && s2 < 3.2, 'pinça com dois dedos dá zoom proporcional (escala ' + s2.toFixed(2) + ')');
  // adicionar pelo visor
  await p.click('#visor-qtd .qtd__mais');
  ok((await p.getAttribute('.item[data-id="torresmo-180"] .qtd', 'data-qtd')) === '1', 'adicionar pelo visor coloca no pedido (e o catálogo acompanha)');
  // fechar tocando fora
  await p.waitForTimeout(500);
  await p.touchscreen.tap(20, box.y + box.height + 120 > 830 ? 30 : 30);
  await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => document.getElementById('visor').open)), 'tocar fora fecha o visor');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.matches('[data-ver="torresmo-180"]')), 'foco volta para a foto que abriu');
  ok(await p.evaluate(() => document.documentElement.style.overflow === ''), 'página volta a rolar');
  // Esc no computador + rodinha
  const d = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await d.goto(B + '/', { waitUntil: 'networkidle' });
  await d.click('.item[data-id="porchetta-400"] [data-ver]'); await d.waitForTimeout(300);
  const bx = await d.locator('#visor-palco').boundingBox();
  await d.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  for (let k = 0; k < 4; k++) { await d.mouse.wheel(0, -120); await d.waitForTimeout(40); }
  const s3 = await escala(d);
  ok(s3 > 1.6, 'rodinha do mouse dá zoom (escala ' + s3.toFixed(2) + ')');
  await d.screenshot({ path: OUT + '/v3-desktop.png' });
  await d.keyboard.press('Escape'); await d.waitForTimeout(300);
  ok(!(await d.evaluate(() => document.getElementById('visor').open)), 'Esc fecha o visor');
  console.log(f ? f + ' FALHA(S)' : 'tudo certo');
  await b.close();
})();
