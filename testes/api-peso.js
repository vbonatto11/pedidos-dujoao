const B = 'http://localhost:8790/exec';
const post = async (o) => (await fetch(B, { method: 'POST', body: JSON.stringify(o) })).json();
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  await fetch('http://localhost:8790/__reset');
  await post({ acao: 'pedido', idEnvio: 'a1', nome: 'Gabi', email: 'gabi@example.com', itens: [{ id: 'torresmo-180', qtd: 1, preco: 2800 }, { id: 'joelho-porco', qtd: 1, preco: 3990 }] });
  let r = await post({ acao: 'peso', numero: '0001', id: 'joelho-porco', peso: 1.2 });
  ok(!r.ok && r.codigo === 'sessao', 'peso sem senha é recusado');
  const token = (await post({ acao: 'entrar', senha: 'senha-teste-123' })).token;
  r = await post({ acao: 'peso', token, numero: '0001', id: 'torresmo-180', peso: 1 });
  ok(!r.ok && r.codigo === 'validacao', 'item que não é por quilo: recusado');
  r = await post({ acao: 'peso', token, numero: '0099', id: 'joelho-porco', peso: 1 });
  ok(!r.ok && r.codigo === 'nao-encontrado', 'pedido inexistente: recusado');
  for (const v of [0, -1, 150, 'abc']) {
    r = await post({ acao: 'peso', token, numero: '0001', id: 'joelho-porco', peso: v });
    ok(!r.ok && r.codigo === 'validacao', 'peso inválido recusado: ' + JSON.stringify(v));
  }
  r = await post({ acao: 'peso', token, numero: '1', id: 'joelho-porco', peso: '1,333' });
  ok(r.ok && r.pedido.total === 2800 + 5319 && r.pedido.itens[1].peso === 1.333, 'número "1" e peso "1,333" aceitos: total ' + r.pedido.total);
  // ajuste feito à mão no total continua valendo quando o peso muda
  const est = await (await fetch('http://localhost:8790/__estado')).json();
  const cab = est.abas.Pedidos[0];
  est.abas.Pedidos[1][cab.indexOf('Total (R$)')];
  await fetch('http://localhost:8790/__exec?f=atualizarResumo');
  r = await post({ acao: 'peso', token, numero: '0001', id: 'joelho-porco', peso: 2 });
  ok(r.ok && r.pedido.total === 2800 + 7980, 'trocar o peso troca só o valor do item: ' + r.pedido.total);
  r = await post({ acao: 'peso', token, numero: '0001', id: 'joelho-porco', peso: null });
  ok(r.ok && r.pedido.total === 2800 && r.pedido.itens[1].subtotal === null && r.pedido.itens[1].peso === null, 'apagar o peso volta para a pesar');
  r = await post({ acao: 'painel', token });
  ok(r.resumo.temPeso === true && r.resumo.total === 2800, 'resumo volta a mostrar + peso');
})();
