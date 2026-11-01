const B = 'http://localhost:8790/exec';
const post = async (o) => (await fetch(B, { method: 'POST', body: JSON.stringify(o) })).json();
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const cat = await (await fetch(B + '?acao=catalogo')).json();
  ok(cat.ok && cat.produtos.length === 19, 'catálogo com 19 produtos');
  // preço divergente
  let r = await post({ acao: 'pedido', idEnvio: 'p1', nome: 'Ana Souza', email: 'ana.souza@example.com', itens: [{ id: 'torresmo-180', qtd: 1, preco: 2500 }] });
  ok(!r.ok && r.codigo === 'preco' && Array.isArray(r.produtos), 'preço divergente devolve codigo preco + catálogo');
  // muitos pedidos para passar do limite de linhas (MAX_LINHAS=12)
  for (let i = 1; i <= 8; i++) {
    r = await post({ acao: 'pedido', idEnvio: 'x' + i, nome: i % 2 ? 'Ana' : 'ana', email: (i % 2 ? 'ana.souza' : 'ana.lima') + i % 2 + '@example.com', whatsapp: '(019) 98888-77' + (10 + i),
      itens: [{ id: 'torresmo-180', qtd: 1, preco: 2800 }, { id: 'farofa-450', qtd: 2, preco: 2000 }, { id: 'joelho-porco', qtd: 1, preco: 3990 }] });
    if (!r.ok) { ok(false, 'pedido ' + i + ': ' + JSON.stringify(r)); break; }
  }
  ok(r.ok && r.numero === '0008', 'oito pedidos gravados mesmo passando do limite de linhas (último ' + r.numero + ')');
  ok(r.itens.find((i) => i.id === 'joelho-porco').subtotal === null && r.total === 6800, 'joelho fora do total (total ' + r.total + ')');
  // repetido
  const rep = await post({ acao: 'pedido', idEnvio: 'x8', nome: 'ana', email: 'ana.lima0@example.com', itens: [{ id: 'torresmo-180', qtd: 1, preco: 2800 }] });
  ok(rep.ok && rep.numero === '0008' && rep.repetido === true && rep.emailEnviado === true, 'reenvio devolve o mesmo pedido, repetido=true, status do e-mail guardado');
  // nome com link / e-mail inválido
  r = await post({ acao: 'pedido', idEnvio: 'z1', nome: 'Promo www.spam.com', email: 'a@b.com', itens: [{ id: 'torresmo-180', qtd: 1 }] });
  ok(!r.ok && r.codigo === 'validacao', 'nome com link recusado');
  r = await post({ acao: 'pedido', idEnvio: 'z2', nome: 'Ana', email: 'ana@gmail..com', itens: [{ id: 'torresmo-180', qtd: 1 }] });
  ok(!r.ok && r.codigo === 'validacao', 'e-mail com .. recusado');
  // painel
  r = await post({ acao: 'painel', token: 'qualquer' });
  ok(!r.ok && r.codigo === 'sessao', 'painel sem token válido recusa');
  r = await post({ acao: 'entrar', senha: 'errada' });
  ok(!r.ok && r.codigo === 'senha', 'senha errada');
  r = await post({ acao: 'entrar', senha: 'senha-teste-123' });
  ok(r.ok && /^[0-9a-f]{64}$/.test(r.token) && r.pedidos.length === 8, 'entrar devolve token e dados');
  const token = r.token;
  const pes = r.resumo.pessoas.map((p) => p.nome);
  ok(pes.length === 2 && pes.every((n) => /\(ana\.(souza|lima)/.test(n)), 'mesmo nome com e-mails diferentes = 2 pessoas: ' + pes.join(' | '));
  ok(r.pedidos[0].whatsapp === '19988887711', 'telefone com 0 na frente normalizado: ' + r.pedidos[0].whatsapp);
  r = await post({ acao: 'marcar', token, numero: '0001', campo: 'pago', valor: true });
  ok(r.ok && r.pedido.pago === true, 'marcar pago');
  r = await post({ acao: 'painel', token });
  ok(/pago R\$ 68,00, falta R\$ 204,00/.test(r.resumo.textoValores), 'valores com pagamento parcial: ' + r.resumo.textoValores.split('\n')[2]);
  // bloqueio após 8 erros
  for (let i = 0; i < 8; i++) await post({ acao: 'entrar', senha: 'x' + i });
  r = await post({ acao: 'entrar', senha: 'senha-teste-123' });
  ok(!r.ok && r.codigo === 'bloqueado', 'bloqueio depois de muitas tentativas');
  const est = await (await fetch('http://localhost:8790/__estado')).json();
  const itens = est.abas.Itens.length - 1;
  ok(itens === 24, 'aba Itens com 24 linhas (8 pedidos x 3): ' + itens);
  const cab = est.abas.Pedidos[0];
  ok(cab.includes('Confirmação por e-mail') && est.abas.Pedidos[1][cab.indexOf('Confirmação por e-mail')] === 'Enviada', 'confirmação de e-mail registrada');
  ok(!JSON.stringify(est.abas).includes('#FORMULA'), 'nenhuma fórmula injetada');
})();
