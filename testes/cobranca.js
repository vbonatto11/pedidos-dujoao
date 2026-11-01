const { chromium } = require('playwright');
const B = 'http://localhost:8790';
const post = async (o) => (await fetch(B + '/exec', { method: 'POST', body: JSON.stringify(o) })).json();
(async () => {
  await fetch(B + '/__reset');
  await post({ acao: 'pedido', idEnvio: 'c1', nome: 'bia lima', email: 'bia@example.com', whatsapp: '19988887777', itens: [{ id: 'torresmo-180', qtd: 2, preco: 2800 }, { id: 'farofa-450', qtd: 1, preco: 2000 }] });
  await post({ acao: 'pedido', idEnvio: 'c2', nome: 'Caio', email: 'caio@example.com', itens: [{ id: 'vulcao-nozes', qtd: 1, preco: 4990 }, { id: 'joelho-porco', qtd: 1, preco: 3990 }, { id: 'hamburguer-provolone', qtd: 2, preco: 2200 }] });
  const b = await chromium.launch();
  const q = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  q.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await q.goto(B + '/painel.html', { waitUntil: 'networkidle' });
  await q.fill('#senha', 'senha-teste-123'); await q.click('#entrar'); await q.waitForSelector('#app:not([hidden])');
  for (const n of ['0001', '0002']) {
    const href = await q.getAttribute(`.ticket[data-numero="${n}"] .ticket__cobrar`, 'href');
    console.log('--- pedido ' + n + ' → ' + href.split('?')[0] + '\n' + decodeURIComponent(href.split('text=')[1]) + '\n');
  }
  await b.close();
})();
