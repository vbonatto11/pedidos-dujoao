/**
 * Pedidos DuJOÃO — backend em Google Apps Script
 *
 * O que este script faz:
 *  - recebe os pedidos do site e grava nas abas "Pedidos" e "Itens";
 *  - confere os preços pela aba "Produtos" (o site não decide preço);
 *  - envia o e-mail de confirmação para o cliente e um aviso para você;
 *  - mantém a aba "Resumo" com o total por produto e por pessoa;
 *  - alimenta o painel (painel.html), protegido por senha.
 *
 * Instalação: veja o arquivo LEIAME.md no GitHub.
 * A senha do painel NÃO fica no código: defina pelo menu DuJOÃO da planilha.
 * Depois de mudar este código: Implantar > Gerenciar implantações > lápis >
 * Versão: Nova versão > Implantar. A URL continua a mesma.
 */

var CONFIG = {
  // Nome que aparece como remetente dos e-mails.
  REMETENTE: 'Pedidos DuJOÃO',

  // Quem organiza os pedidos.
  RESPONSAVEL: 'Vinicius',
  WHATSAPP: '5535998983305',

  // Texto do pagamento, mostrado no e-mail do cliente.
  PIX: 'PIX para João Bonatto, chave celular (19) 99752-1066. Faça o PIX depois de receber os produtos.',

  // Endereço do site (usado no logo do e-mail e no link do painel).
  URL_SITE: 'https://vbonatto11.github.io/pedidos-dujoao/',

  // Receber um e-mail a cada pedido novo.
  AVISAR_A_CADA_PEDIDO: true,

  // Para onde vão os avisos. Vazio = o e-mail da conta dona desta planilha.
  EMAIL_AVISO: '',

  // Proteção contra abuso do formulário.
  MAX_PEDIDOS_POR_EMAIL_HORA: 6,
  MAX_PEDIDOS_10_MIN: 60
};

var FUSO = 'America/Sao_Paulo';
var ABA = { PEDIDOS: 'Pedidos', ITENS: 'Itens', PRODUTOS: 'Produtos', RESUMO: 'Resumo' };

// As colunas são encontradas pelo nome do cabeçalho. Dá para mudar a ordem
// ou inserir colunas novas; só não renomeie estes cabeçalhos.
var CAMPOS = {
  PEDIDOS: [
    ['numero', 'Nº'], ['data', 'Data'], ['rodada', 'Rodada'], ['nome', 'Nome'], ['email', 'E-mail'],
    ['whatsapp', 'WhatsApp'], ['itens', 'Itens'], ['total', 'Total (R$)'], ['obs', 'Observações'],
    ['pago', 'Pago'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado'],
    ['confirmacao', 'Confirmação por e-mail'], ['envio', 'Envio']
  ],
  ITENS: [
    ['numero', 'Nº pedido'], ['data', 'Data'], ['rodada', 'Rodada'], ['cliente', 'Cliente'],
    ['id', 'ID produto'], ['produto', 'Produto'], ['qtd', 'Qtd'], ['preco', 'Preço (R$)'],
    ['subtotal', 'Subtotal (R$)'], ['unidade', 'Unidade'], ['peso', 'Peso (kg)']
  ],
  PRODUTOS: [
    ['id', 'ID'], ['categoria', 'Categoria'], ['produto', 'Produto'], ['curto', 'Nome curto'],
    ['detalhe', 'Detalhe'], ['preco', 'Preço (R$)'], ['unidade', 'Unidade'], ['disponivel', 'Disponível']
  ]
};

// Tabela de revenda inicial (mesma ordem de CAMPOS.PRODUTOS). Depois, edite na aba "Produtos".
var CATALOGO_INICIAL = [
  ['torresmo-180', 'Prontos para consumo', 'Torresmo 180 g', '', 'Torresmos Premium, pote', 28, 'un', true],
  ['torresmo-60', 'Prontos para consumo', 'Torresmo 60 g', '', 'Torresmos Premium', 13, 'un', true],
  ['pururuca-135', 'Prontos para consumo', 'Pururuca 135 g', '', 'Pururuca tradicional', 15, 'un', true],
  ['farofa-160', 'Prontos para consumo', 'Farofa de mandioca com torresmo 160 g', '', '', 8, 'un', true],
  ['farofa-450', 'Prontos para consumo', 'Farofa de mandioca com torresmo 450 g', '', '', 20, 'un', true],
  ['linguica-toscana', 'Linguiças suínas', 'Linguiça Toscana 500 g', 'Toscana', '', 17, 'un', true],
  ['linguica-caipira', 'Linguiças suínas', 'Linguiça Tipo caipira 500 g', 'Tipo caipira', '', 17, 'un', true],
  ['linguica-apimentada', 'Linguiças suínas', 'Linguiça Apimentada 500 g', 'Apimentada', '', 18, 'un', true],
  ['linguica-queijo-coalho', 'Linguiças suínas', 'Linguiça Queijo coalho e pimenta biquinho 500 g', 'Queijo coalho e pimenta biquinho', '', 20, 'un', true],
  ['vulcao-3-queijos', 'Linguiça Vulcão', 'Linguiça Vulcão 3 Queijos', '3 Queijos', 'Mussarela, catupiry original e parmesão', 49.9, 'un', true],
  ['vulcao-cheddar', 'Linguiça Vulcão', 'Linguiça Vulcão Cheddar', 'Cheddar', 'Cheddar, azeitona, pimenta biquinho e queijo coalho', 49.9, 'un', true],
  ['vulcao-nozes', 'Linguiça Vulcão', 'Linguiça Vulcão Nozes', 'Nozes', 'Cream cheese, nozes e provolone', 49.9, 'un', true],
  ['vulcao-romeu-julieta', 'Linguiça Vulcão', 'Linguiça Vulcão Romeu e Julieta', 'Romeu e Julieta', 'Mussarela, parmesão e goiabada', 49.9, 'un', true],
  ['porchetta-400', 'Congelados', 'Porchetta 400 g', 'Porchetta', 'Peça com 400 g (R$ 75,00 o kg)', 30, 'un', true],
  ['hamburguer-provolone', 'Congelados', 'Hambúrguer suíno recheado com provolone 600 g', 'Hambúrguer suíno recheado com provolone', '600 g, 3 unidades', 22, 'un', true],
  ['codeguim-500', 'Congelados', 'Codeguim 500 g', '', '', 17, 'un', true],
  ['joelho-porco', 'Congelados', 'Joelho de porco semi-pronto', '', 'Cobrado pelo peso da peça', 39.9, 'kg', true],
  ['banha-950', 'Resfriados', 'Banha 950 g', '', '', 25, 'un', true],
  ['banha-400', 'Resfriados', 'Banha 400 g', '', '', 15, 'un', true]
];

/* ======================================================================
   Menu da planilha
   ====================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DuJOÃO')
    .addItem('Definir senha do painel', 'definirSenha')
    .addItem('Atualizar resumo', 'atualizarResumo')
    .addItem('Começar nova rodada', 'menuNovaRodada')
    .addSeparator()
    .addItem('Arrumar abas e formatação', 'configurar')
    .addToUi();
}

/** Pede a senha do painel e guarda nas propriedades do script (fora do código). */
function definirSenha() {
  var ui = SpreadsheetApp.getUi();
  garantirEstrutura_();
  var r = ui.prompt(
    'Senha do painel',
    'Crie uma senha com pelo menos 8 caracteres. Ela serve para entrar no painel de pedidos.',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var senha = String(r.getResponseText() || '').trim();
  if (senha.length < 8) {
    ui.alert('A senha precisa ter pelo menos 8 caracteres. Use o menu DuJOÃO para tentar de novo.');
    return;
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SENHA_PAINEL', senha);
  props.setProperty('SAL_PAINEL', Utilities.getUuid()); // desconecta sessões antigas do painel
  ui.alert('Senha salva. O painel fica em ' + CONFIG.URL_SITE + 'painel.html');
}

/** Cria as abas que faltam, coloca os produtos iniciais e arruma a formatação. */
function configurar() {
  garantirEstrutura_(true);
  atualizarResumo();
  var msg = PropertiesService.getScriptProperties().getProperty('SENHA_PAINEL')
    ? 'Planilha arrumada.'
    : 'Planilha pronta. Agora defina a senha do painel no menu DuJOÃO.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

function menuNovaRodada() {
  var ui = SpreadsheetApp.getUi();
  var atual = rodadaAtual_();
  var r = ui.alert(
    'Começar a rodada ' + (atual + 1) + '?',
    'Os pedidos da rodada ' + atual + ' continuam salvos. Os próximos pedidos entram na rodada ' + (atual + 1) + '.',
    ui.ButtonSet.OK_CANCEL
  );
  if (r === ui.Button.OK) novaRodada_();
}

/** Atualiza o Resumo quando você mexe em Pago / Entregue / Cancelado / Total ou na aba Itens. */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var nome = e.range.getSheet().getName();
    if (nome === ABA.ITENS) { conciliarPesos_(); atualizarResumo(); return; }
    if (nome !== ABA.PEDIDOS) return;
    var col = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS).col;
    var c1 = e.range.getColumn() - 1;
    var c2 = e.range.getLastColumn() - 1;
    var alvo = [col.pago, col.entregue, col.cancelado, col.total, col.nome, col.email];
    if (alvo.some(function (c) { return c >= c1 && c <= c2; })) atualizarResumo();
  } catch (err) {
    console.error(err);
  }
}

/* ======================================================================
   Web app
   ====================================================================== */

function doGet(e) {
  try {
    var acao = (e && e.parameter && e.parameter.acao) || 'catalogo';
    if (acao === 'catalogo') return json_(catalogoPublico_());
    return json_({ ok: false, codigo: 'acao', erro: 'Ação desconhecida.' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, codigo: 'interno', erro: 'Erro interno.' });
  }
}

function doPost(e) {
  var d;
  try {
    d = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
  } catch (err) {
    return json_({ ok: false, codigo: 'validacao', erro: 'Pedido em formato inválido.' });
  }
  try {
    switch (d.acao) {
      case 'pedido': return json_(registrarPedido_(d));
      case 'catalogo': return json_(catalogoPublico_());
      case 'entrar': return json_(entrar_(d));
      case 'painel':
      case 'marcar':
      case 'loja':
      case 'novaRodada':
      case 'salvarProdutos':
      case 'peso':
        var auth = autenticar_(d.token);
        if (!auth.ok) return json_(auth);
        if (d.acao === 'painel') return json_(dadosPainel_(d.rodada));
        if (d.acao === 'marcar') return json_(marcar_(d));
        if (d.acao === 'loja') return json_(configurarLoja_(d));
        if (d.acao === 'salvarProdutos') return json_(salvarProdutos_(d));
        if (d.acao === 'peso') return json_(salvarPeso_(d));
        return json_(novaRodada_());
      default:
        return json_({ ok: false, codigo: 'acao', erro: 'Ação desconhecida.' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, codigo: 'interno', erro: 'Erro interno. Tente de novo em instantes.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function catalogoPublico_() {
  garantirEstrutura_();
  return { ok: true, produtos: lerCatalogo_(), aberto: lojaAberta_(), aviso: avisoAtual_(), rodada: rodadaAtual_() };
}

function catalogoExtra_(catalogo) {
  return { produtos: catalogo || lerCatalogo_(), aberto: lojaAberta_(), aviso: avisoAtual_() };
}

/* ======================================================================
   Pedidos
   ====================================================================== */

function registrarPedido_(d) {
  garantirEstrutura_();
  if (!lojaAberta_()) return { ok: false, codigo: 'fechado', erro: 'Os pedidos estão fechados no momento.', aberto: false, aviso: avisoAtual_() };

  var v = validarPedido_(d, lerCatalogo_());
  if (v.erro) return v.erro;
  var p = v.pedido;

  var lock = travar_(30000);
  var existente = null;
  try {
    if (p.idEnvio) existente = buscarPorEnvio_(p.idEnvio);
    if (!existente) {
      var bloqueio = verificarLimite_(p.email);
      if (bloqueio) return { ok: false, codigo: 'limite', erro: bloqueio };
      p.numero = formatarNumero_(proximoNumero_());
      p.data = new Date();
      p.rodada = rodadaAtual_();
      gravarPedido_(p);
      contarPedido_(p.email);
      SpreadsheetApp.flush();
    }
  } finally {
    soltar_(lock);
  }

  if (existente) return respostaPedido_(existente, existente.confirmacao, true);

  var confirmacao = enviarEmailCliente_(p);
  try { gravarConfirmacao_(p.numero, confirmacao); } catch (err) { console.error(err); }
  if (CONFIG.AVISAR_A_CADA_PEDIDO) enviarEmailDono_(p);
  try { atualizarResumo(); } catch (err) { console.error(err); }
  return respostaPedido_(p, confirmacao, false);
}

function respostaPedido_(p, confirmacao, repetido) {
  return {
    ok: true,
    numero: p.numero,
    email: p.email,
    emailEnviado: confirmacao === 'Enviada' ? true : (confirmacao ? false : null),
    repetido: !!repetido,
    itens: p.itens.map(function (i) {
      return { id: i.id, nome: i.nome, qtd: i.qtd, preco: i.preco, subtotal: i.subtotal, unidade: i.unidade };
    }),
    total: p.total,
    temPeso: p.itens.some(function (i) { return i.subtotal === null; })
  };
}

/** Valida os dados do site e recalcula tudo com os preços da planilha. */
function validarPedido_(d, catalogo) {
  function erro(msg, codigo, extra) {
    var e = { ok: false, codigo: codigo || 'validacao', erro: msg };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return { erro: e };
  }
  var nome = limparTexto_(d.nome, 80, false);
  if (nome.length < 2) return erro('Informe seu nome.');
  if (/https?:|www\.|\.(com|net|org|br)\b|[@<>]/i.test(nome)) return erro('Escreva só o seu nome no campo Nome.');
  var email = limparTexto_(d.email, 120, false).toLowerCase();
  if (!emailValido_(email)) return erro('Confira o e-mail. Exemplo: nome@gmail.com');
  var whatsapp = telefoneNacional_(d.whatsapp);
  var obs = limparTexto_(d.obs, 500, true);
  var idEnvio = String(d.idEnvio || '').replace(/[^\w\-]/g, '').slice(0, 64);

  if (!catalogo.length) return erro('A loja ainda está sendo preparada. Tente de novo em alguns minutos.', 'configuracao');
  if (!Array.isArray(d.itens) || !d.itens.length) return erro('Escolha pelo menos um produto.');
  if (d.itens.length > 60) return erro('Pedido grande demais. Divida em dois pedidos.');

  var porId = {};
  catalogo.forEach(function (p) { porId[p.id] = p; });
  var qtdPorId = {};
  var precoVisto = {};
  var ordem = [];
  for (var i = 0; i < d.itens.length; i++) {
    var it = d.itens[i] || {};
    var id = String(it.id || '');
    var qtd = Math.floor(Number(it.qtd));
    if (!id || !isFinite(qtd) || qtd < 1) return erro('Quantidade inválida no pedido.');
    if (!qtdPorId[id]) ordem.push(id);
    qtdPorId[id] = (qtdPorId[id] || 0) + qtd;
    if (precoVisto[id] === undefined && it.preco !== undefined && it.preco !== null && isFinite(Number(it.preco))) {
      precoVisto[id] = Math.round(Number(it.preco));
    }
  }

  var itens = [];
  var total = 0;
  var mudaram = [];
  for (var j = 0; j < ordem.length; j++) {
    var pid = ordem[j];
    var prod = porId[pid];
    if (!prod || !prod.disponivel) {
      return erro((prod ? prod.nome : 'Um dos produtos') + ' esgotou. Atualizamos a lista: confira o seu pedido.', 'indisponivel', catalogoExtra_(catalogo));
    }
    var preco = centavos_(prod.preco);
    if (precoVisto[pid] !== undefined && precoVisto[pid] !== preco) mudaram.push(prod.nome);
    var q = Math.min(qtdPorId[pid], 99);
    var sub = prod.unidade === 'kg' ? null : preco * q;
    if (sub !== null) total += sub;
    itens.push({ id: pid, nome: prod.nome, qtd: q, preco: preco, subtotal: sub, unidade: prod.unidade });
  }
  if (mudaram.length) {
    var msg = mudaram.length === 1 ? 'O preço de ' + mudaram[0] + ' mudou.' : 'Alguns preços mudaram.';
    return erro(msg + ' Confira o pedido com os valores atualizados e confirme de novo.', 'preco', catalogoExtra_(catalogo));
  }

  return { pedido: { nome: nome, email: email, whatsapp: whatsapp, obs: obs, idEnvio: idEnvio, itens: itens, total: total } };
}

/** Grava os itens primeiro e a linha do pedido por último: a linha em "Pedidos" confirma o pedido. */
function gravarPedido_(p) {
  var ti = aba_(ABA.ITENS, CAMPOS.ITENS);
  var linhas = p.itens.map(function (i) {
    return linhaPorCampos_(ti, {
      numero: "'" + p.numero, data: p.data, rodada: p.rodada, cliente: texto_(p.nome),
      id: texto_(i.id), produto: texto_(i.nome), qtd: i.qtd, preco: i.preco / 100,
      subtotal: i.subtotal === null ? '' : i.subtotal / 100, unidade: i.unidade
    });
  });
  if (linhas.length) {
    var inicio = ti.sh.getLastRow() + 1;
    garantirLinhas_(ti.sh, inicio + linhas.length - 1);
    ti.sh.getRange(inicio, 1, linhas.length, linhas[0].length).setValues(linhas);
  }

  var tp = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
  var linha = linhaPorCampos_(tp, {
    numero: "'" + p.numero, data: p.data, rodada: p.rodada, nome: texto_(p.nome), email: texto_(p.email),
    whatsapp: texto_(p.whatsapp), itens: texto_(textoItens_(p.itens)),
    total: p.total / 100, obs: texto_(p.obs), pago: false, entregue: false, cancelado: false,
    confirmacao: '', envio: texto_(p.idEnvio)
  });
  var n = tp.sh.getLastRow() + 1;
  garantirLinhas_(tp.sh, n);
  tp.sh.getRange(n, 1, 1, linha.length).setValues([linha]);
  [tp.col.pago, tp.col.entregue, tp.col.cancelado].forEach(function (c) {
    tp.sh.getRange(n, c + 1).insertCheckboxes();
  });
}

function gravarConfirmacao_(numero, status) {
  var tp = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
  var linha = linhaDoPedido_(tp, numero);
  if (linha) tp.sh.getRange(linha, tp.col.confirmacao + 1).setValue(status);
}

/** Procura um envio repetido (mesma tentativa do site) na rodada atual, nas últimas 24 horas. */
function buscarPorEnvio_(idEnvio) {
  var rodada = rodadaAtual_();
  var limite = Date.now() - 24 * 3600 * 1000;
  var lista = lerPedidos_(rodada);
  for (var i = 0; i < lista.length; i++) {
    var p = lista[i];
    if (p.envio === idEnvio && (!p.dataMs || p.dataMs >= limite)) return p;
  }
  return null;
}

/* ======================================================================
   Leitura da planilha
   ====================================================================== */

function lerCatalogo_() {
  var t = aba_(ABA.PRODUTOS, CAMPOS.PRODUTOS);
  var vals = linhasDados_(t);
  var vistos = {};
  var lista = [];
  vals.forEach(function (r) {
    var id = String(r[t.col.id] || '').trim();
    var nome = String(r[t.col.produto] || '').trim();
    var preco = numero_(r[t.col.preco]);
    if (!id || !nome || vistos[id] || !isFinite(preco) || preco < 0) return;
    vistos[id] = true;
    lista.push({
      id: id,
      categoria: String(r[t.col.categoria] || '').trim() || 'Outros',
      nome: nome,
      curto: String(r[t.col.curto] || '').trim(),
      detalhe: String(r[t.col.detalhe] || '').trim(),
      preco: Math.round(preco * 100) / 100,
      unidade: /kg|quilo/i.test(String(r[t.col.unidade] || '')) ? 'kg' : 'un',
      disponivel: verdadeiro_(r[t.col.disponivel], true)
    });
  });
  return lista;
}

function lerItens_() {
  var t = aba_(ABA.ITENS, CAMPOS.ITENS);
  var mapa = {};
  linhasDados_(t).forEach(function (r) {
    var numero = formatarNumero_(r[t.col.numero]);
    var item = numero ? itemDaLinha_(r, t.col) : null;
    if (item) (mapa[numero] = mapa[numero] || []).push(item);
  });
  return mapa;
}

/**
 * Uma linha da aba Itens.
 * A coluna Subtotal guarda o valor que já está somado no Total do pedido (aba Pedidos).
 * Item por quilo: com peso, o valor é preço do kg x peso; sem peso e sem subtotal, fica "a pesar".
 * Se alguém digitar o peso direto na planilha, a diferença para o Subtotal entra no total (veja lerPedidos_).
 */
function itemDaLinha_(r, c) {
  var qtd = Math.floor(numero_(r[c.qtd]));
  if (!isFinite(qtd) || qtd < 1) return null;
  var unidade = /kg/i.test(String(r[c.unidade] || '')) ? 'kg' : 'un';
  var preco = centavos_(numero_(r[c.preco])) || 0;
  var bruto = r[c.subtotal];
  var celula = bruto === '' || bruto === null ? null : centavos_(numero_(bruto));
  if (celula !== null && !isFinite(celula)) celula = null;
  var peso = unidade === 'kg' ? pesoValido_(r[c.peso]) : null;
  return {
    id: String(r[c.id] || '').trim(),
    nome: String(r[c.produto] || '').trim(),
    qtd: qtd,
    preco: preco,
    subtotal: peso !== null ? valorPeso_(preco, peso) : celula,
    unidade: unidade,
    peso: peso,
    incluido: celula || 0
  };
}

function lerPedidos_(rodada) {
  var t = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
  var c = t.col;
  var vals = linhasDados_(t);
  if (!vals.length) return [];
  var itensPorNumero = lerItens_();
  var lista = [];
  vals.forEach(function (r) {
    var numero = formatarNumero_(r[c.numero]);
    if (!numero) return;
    var rod = parseInt(r[c.rodada], 10) || 1;
    if (rodada && rod !== rodada) return;
    var itens = itensPorNumero[numero] || [];
    var totalPlanilha = numero_(r[c.total]);
    var totalItens = itens.reduce(function (s, it) { return s + (it.subtotal || 0); }, 0);
    var acerto = itens.reduce(function (s, it) { return s + (it.subtotal || 0) - it.incluido; }, 0);
    var data = r[c.data] instanceof Date ? r[c.data] : new Date(r[c.data]);
    var dataOk = data instanceof Date && !isNaN(data.getTime());
    lista.push({
      numero: numero,
      data: dataOk ? data.toISOString() : '',
      dataMs: dataOk ? data.getTime() : 0,
      dataTexto: dataOk ? Utilities.formatDate(data, FUSO, 'dd/MM HH:mm') : String(r[c.data] || ''),
      rodada: rod,
      nome: String(r[c.nome] || '').trim(),
      email: String(r[c.email] || '').trim().toLowerCase(),
      whatsapp: telefoneNacional_(r[c.whatsapp]),
      obs: String(r[c.obs] || '').trim(),
      itens: itens,
      total: isFinite(totalPlanilha) ? Math.max(0, centavos_(totalPlanilha) + acerto) : totalItens,
      pago: verdadeiro_(r[c.pago], false),
      entregue: verdadeiro_(r[c.entregue], false),
      cancelado: verdadeiro_(r[c.cancelado], false),
      confirmacao: String(r[c.confirmacao] || ''),
      envio: String(r[c.envio] || '')
    });
  });
  return lista;
}

/* ======================================================================
   Painel
   ====================================================================== */

function entrar_(d) {
  garantirEstrutura_();
  var senha = PropertiesService.getScriptProperties().getProperty('SENHA_PAINEL');
  if (!senha) return { ok: false, codigo: 'sem-senha', erro: 'A senha do painel ainda não foi criada. Na planilha, use o menu DuJOÃO > Definir senha do painel.' };
  var cache = CacheService.getScriptCache();
  var falhas = parseInt(cache.get('falhas-senha') || '0', 10) || 0;
  if (falhas >= 8) return { ok: false, codigo: 'bloqueado', erro: 'Muitas tentativas erradas. Espere 10 minutos e tente de novo.' };
  if (String(d.senha || '') !== senha) {
    cache.put('falhas-senha', String(falhas + 1), 600);
    return { ok: false, codigo: 'senha', erro: 'Senha incorreta.' };
  }
  cache.remove('falhas-senha');
  var dados = dadosPainel_(d.rodada);
  dados.token = tokenPainel_();
  return dados;
}

function autenticar_(token) {
  var t = tokenPainel_();
  if (!t) return { ok: false, codigo: 'sem-senha', erro: 'A senha do painel ainda não foi criada. Na planilha, use o menu DuJOÃO > Definir senha do painel.' };
  if (String(token || '') !== t) return { ok: false, codigo: 'sessao', erro: 'Entre de novo com a senha do painel.' };
  return { ok: true };
}

/** Chave de sessão derivada da senha. Trocar a senha desconecta todos os aparelhos. */
function tokenPainel_() {
  var props = PropertiesService.getScriptProperties();
  var senha = props.getProperty('SENHA_PAINEL');
  if (!senha) return null;
  var sal = props.getProperty('SAL_PAINEL');
  if (!sal) { sal = Utilities.getUuid(); props.setProperty('SAL_PAINEL', sal); }
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + ':' + senha, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

function dadosPainel_(rodadaPedida) {
  garantirEstrutura_();
  var atual = rodadaAtual_();
  var rodada = parseInt(rodadaPedida, 10);
  if (!rodada || rodada < 1 || rodada > atual) rodada = atual;
  var pedidos = lerPedidos_(rodada);
  return {
    ok: true,
    rodada: rodada,
    rodadaAtual: atual,
    aberto: lojaAberta_(),
    aviso: avisoAtual_(),
    planilha: planilha_().getUrl(),
    catalogo: lerCatalogo_(),
    pedidos: pedidos.map(pedidoPublico_),
    resumo: calcularResumo_(pedidos, lerCatalogo_(), rodada)
  };
}

function pedidoPublico_(p) {
  return {
    numero: p.numero, data: p.data, dataTexto: p.dataTexto, rodada: p.rodada,
    nome: p.nome, email: p.email, whatsapp: p.whatsapp, obs: p.obs,
    itens: p.itens.map(function (i) {
      return { id: i.id, nome: i.nome, qtd: i.qtd, preco: i.preco, subtotal: i.subtotal, unidade: i.unidade, peso: i.peso };
    }),
    total: p.total,
    pago: p.pago, entregue: p.entregue, cancelado: p.cancelado,
    confirmacao: p.confirmacao
  };
}

function marcar_(d) {
  var campos = { pago: 1, entregue: 1, cancelado: 1 };
  if (!campos[d.campo]) return { ok: false, codigo: 'validacao', erro: 'Campo inválido.' };
  var numero = formatarNumero_(d.numero);
  if (!numero) return { ok: false, codigo: 'validacao', erro: 'Pedido inválido.' };
  var lock = travar_(20000);
  var achou = false;
  try {
    var tp = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
    var linha = linhaDoPedido_(tp, numero);
    if (linha) {
      var cel = tp.sh.getRange(linha, tp.col[d.campo] + 1);
      cel.insertCheckboxes();
      cel.setValue(!!d.valor);
      achou = true;
    }
    SpreadsheetApp.flush();
  } finally {
    soltar_(lock);
  }
  if (!achou) return { ok: false, codigo: 'nao-encontrado', erro: 'Pedido nº ' + numero + ' não encontrado.' };
  try { atualizarResumo(); } catch (err) { console.error(err); }
  var lista = lerPedidos_(null).filter(function (p) { return p.numero === numero; });
  return { ok: true, pedido: lista.length ? pedidoPublico_(lista[0]) : null };
}

/** Atualiza preço e disponibilidade dos produtos (aba Produtos) pelo painel. */
function salvarProdutos_(d) {
  if (!Array.isArray(d.produtos) || !d.produtos.length) return { ok: false, codigo: 'validacao', erro: 'Nenhuma alteração para salvar.' };
  if (d.produtos.length > 300) return { ok: false, codigo: 'validacao', erro: 'Alterações demais de uma vez.' };
  var mudancas = [];
  for (var i = 0; i < d.produtos.length; i++) {
    var m = d.produtos[i] || {};
    var id = String(m.id || '').trim();
    if (!id) return { ok: false, codigo: 'validacao', erro: 'Produto inválido.' };
    var item = { id: id };
    if (m.preco !== undefined && m.preco !== null) {
      var preco = numero_(m.preco);
      if (!isFinite(preco) || preco < 0 || preco > 100000) return { ok: false, codigo: 'validacao', erro: 'Preço inválido para ' + id + '.' };
      item.preco = Math.round(preco * 100) / 100;
    }
    if (typeof m.disponivel === 'boolean') item.disponivel = m.disponivel;
    mudancas.push(item);
  }
  var lock = travar_(20000);
  var naoAchados = [];
  try {
    var t = aba_(ABA.PRODUTOS, CAMPOS.PRODUTOS);
    var n = t.sh.getLastRow() - 1;
    var ids = n >= 1 ? t.sh.getRange(2, t.col.id + 1, n, 1).getValues().map(function (r) { return String(r[0] || '').trim(); }) : [];
    mudancas.forEach(function (m) {
      var idx = ids.indexOf(m.id);
      if (idx < 0) { naoAchados.push(m.id); return; }
      var linha = idx + 2;
      if (m.preco !== undefined) t.sh.getRange(linha, t.col.preco + 1).setValue(m.preco);
      if (m.disponivel !== undefined) {
        var cel = t.sh.getRange(linha, t.col.disponivel + 1);
        cel.insertCheckboxes();
        cel.setValue(m.disponivel);
      }
    });
    SpreadsheetApp.flush();
  } finally {
    soltar_(lock);
  }
  return { ok: true, naoAchados: naoAchados, catalogo: lerCatalogo_() };
}

/**
 * Grava o peso de um item vendido por quilo e soma o valor no total do pedido.
 * Peso vazio volta o item para "a pesar".
 */
function salvarPeso_(d) {
  var numero = formatarNumero_(d.numero);
  var id = String(d.id || '').trim();
  if (!numero || !id) return { ok: false, codigo: 'validacao', erro: 'Item inválido.' };
  var peso = null;
  if (d.peso !== null && d.peso !== undefined && String(d.peso).trim() !== '') {
    peso = pesoValido_(d.peso);
    if (peso === null) return { ok: false, codigo: 'validacao', erro: 'Peso inválido. Digite em quilos, por exemplo 1,250.' };
  }
  var erro = null;
  var lock = travar_(20000);
  try {
    var tp = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
    var lp = linhaDoPedido_(tp, numero);
    var ti = aba_(ABA.ITENS, CAMPOS.ITENS);
    var c = ti.col;
    var vals = linhasDados_(ti);
    var alvo = -1;
    for (var i = 0; i < vals.length && lp; i++) {
      if (formatarNumero_(vals[i][c.numero]) === numero && String(vals[i][c.id] || '').trim() === id) { alvo = i; break; }
    }
    if (alvo < 0) {
      erro = { ok: false, codigo: 'nao-encontrado', erro: 'Item não encontrado no pedido nº ' + numero + '.' };
    } else if (!/kg/i.test(String(vals[alvo][c.unidade] || ''))) {
      erro = { ok: false, codigo: 'validacao', erro: 'Este item não é vendido por quilo.' };
    } else if (!itemDaLinha_(vals[alvo], c)) {
      erro = { ok: false, codigo: 'validacao', erro: 'Este item está sem quantidade na planilha (aba Itens).' };
    } else {
      var antes = itemDaLinha_(vals[alvo], c);
      var novoSub = peso === null ? null : valorPeso_(antes.preco, peso);
      var linha = alvo + 2;
      ti.sh.getRange(linha, c.peso + 1).setNumberFormat('0.000').setValue(peso === null ? '' : peso);
      ti.sh.getRange(linha, c.subtotal + 1).setValue(novoSub === null ? '' : novoSub / 100);
      vals[alvo][c.peso] = peso === null ? '' : peso;
      vals[alvo][c.subtotal] = novoSub === null ? '' : novoSub / 100;

      // Troca só o valor deste item no total: um ajuste feito à mão no total continua valendo.
      var itensPedido = vals.filter(function (r) { return formatarNumero_(r[c.numero]) === numero; })
        .map(function (r) { return itemDaLinha_(r, c); })
        .filter(function (x) { return x; });
      var celTotal = tp.sh.getRange(lp, tp.col.total + 1);
      var totalAtual = numero_(celTotal.getValue());
      var novo = isFinite(totalAtual)
        ? centavos_(totalAtual) - antes.incluido + (novoSub || 0)
        : itensPedido.reduce(function (s, x) { return s + (x.subtotal || 0); }, 0);
      celTotal.setValue(Math.max(0, novo) / 100);
      tp.sh.getRange(lp, tp.col.itens + 1).setValue(texto_(textoItens_(itensPedido)));
      SpreadsheetApp.flush();
    }
  } finally {
    soltar_(lock);
  }
  if (erro) return erro;
  try { atualizarResumo(); } catch (err) { console.error(err); }
  var lista = lerPedidos_(null).filter(function (p) { return p.numero === numero; });
  return { ok: true, pedido: lista.length ? pedidoPublico_(lista[0]) : null };
}

/**
 * Quando alguém digita o peso direto na aba Itens, soma a diferença no Total do pedido
 * e preenche o Subtotal, para a planilha ficar igual ao painel. Roda pelo onEdit.
 */
function conciliarPesos_() {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return 0;
  } catch (e) {
    return 0;
  }
  try {
    var ti = aba_(ABA.ITENS, CAMPOS.ITENS);
    var c = ti.col;
    var vals = linhasDados_(ti);
    var ajustes = {};
    vals.forEach(function (r, k) {
      var it = /kg/i.test(String(r[c.unidade] || '')) ? itemDaLinha_(r, c) : null;
      if (!it || it.peso === null || it.subtotal === it.incluido) return;
      var numero = formatarNumero_(r[c.numero]);
      if (!numero) return;
      ti.sh.getRange(k + 2, c.subtotal + 1).setValue(it.subtotal / 100);
      r[c.subtotal] = it.subtotal / 100;
      ajustes[numero] = (ajustes[numero] || 0) + it.subtotal - it.incluido;
    });
    var numeros = Object.keys(ajustes);
    if (!numeros.length) return 0;
    var tp = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
    numeros.forEach(function (numero) {
      var lp = linhaDoPedido_(tp, numero);
      if (!lp) return;
      var cel = tp.sh.getRange(lp, tp.col.total + 1);
      var atual = numero_(cel.getValue());
      if (isFinite(atual)) cel.setValue(Math.max(0, centavos_(atual) + ajustes[numero]) / 100);
      var itens = vals.filter(function (r) { return formatarNumero_(r[c.numero]) === numero; })
        .map(function (r) { return itemDaLinha_(r, c); })
        .filter(function (x) { return x; });
      tp.sh.getRange(lp, tp.col.itens + 1).setValue(texto_(textoItens_(itens)));
    });
    SpreadsheetApp.flush();
    return numeros.length;
  } finally {
    soltar_(lock);
  }
}

function configurarLoja_(d) {
  var props = PropertiesService.getScriptProperties();
  if (typeof d.aberto === 'boolean') props.setProperty('ABERTO', d.aberto ? 'sim' : 'nao');
  if (typeof d.aviso === 'string') props.setProperty('AVISO', limparTexto_(d.aviso, 200, false));
  return { ok: true, aberto: lojaAberta_(), aviso: avisoAtual_() };
}

function novaRodada_() {
  var lock = travar_(20000);
  var nova;
  try {
    nova = rodadaAtual_() + 1;
    PropertiesService.getScriptProperties().setProperty('RODADA', String(nova));
  } finally {
    soltar_(lock);
  }
  try { atualizarResumo(); } catch (err) { console.error(err); }
  return { ok: true, rodada: nova };
}

/* ======================================================================
   Resumo (por produto e por pessoa)
   ====================================================================== */

function calcularResumo_(pedidos, catalogo, rodada) {
  var ordem = {};
  var categoriaDe = {};
  catalogo.forEach(function (p, i) { ordem[p.id] = i; categoriaDe[p.id] = p.categoria; });

  var ativos = pedidos.filter(function (p) { return !p.cancelado; });

  // Pessoas: agrupadas pelo e-mail (duas "Ana" com e-mails diferentes são pessoas diferentes).
  var pessoas = {};
  var ordemPessoas = [];
  ativos.forEach(function (ped) {
    var chave = ped.email || ('nome:' + chavePessoa_(ped.nome));
    if (!pessoas[chave]) {
      pessoas[chave] = { chave: chave, nome: ped.nome, email: ped.email, total: 0, pago: 0, pedidos: [], temPeso: false, todosPagos: true };
      ordemPessoas.push(chave);
    }
    var pes = pessoas[chave];
    pes.pedidos.push(ped.numero);
    pes.total += ped.total;
    if (ped.pago) pes.pago += ped.total; else pes.todosPagos = false;
    if (ped.itens.some(function (i) { return i.subtotal === null; })) pes.temPeso = true;
  });
  // Nomes iguais de pessoas diferentes ganham o início do e-mail para não confundir.
  var contagem = {};
  ordemPessoas.forEach(function (k) { var n = chavePessoa_(pessoas[k].nome); contagem[n] = (contagem[n] || 0) + 1; });
  ordemPessoas.forEach(function (k) {
    var p = pessoas[k];
    p.rotulo = contagem[chavePessoa_(p.nome)] > 1 && p.email ? p.nome + ' (' + p.email.split('@')[0] + ')' : p.nome;
  });

  var produtos = {};
  var t = { itens: 0, total: 0, pago: 0, temPeso: false };
  ativos.forEach(function (ped) {
    var chave = ped.email || ('nome:' + chavePessoa_(ped.nome));
    t.total += ped.total;
    if (ped.pago) t.pago += ped.total;
    ped.itens.forEach(function (it) {
      var k = it.id || it.nome;
      if (!produtos[k]) {
        produtos[k] = {
          id: it.id, nome: it.nome, categoria: categoriaDe[it.id] || 'Outros',
          qtd: 0, valor: 0, gramas: 0, temPeso: false, quem: {}, ordemQuem: [],
          ordem: ordem[it.id] !== undefined ? ordem[it.id] : 9999
        };
      }
      var pr = produtos[k];
      pr.qtd += it.qtd;
      t.itens += it.qtd;
      if (it.subtotal === null) { pr.temPeso = true; t.temPeso = true; } else { pr.valor += it.subtotal; }
      if (it.peso) pr.gramas += Math.round(it.peso * 1000);
      if (!pr.quem[chave]) { pr.quem[chave] = { nome: pessoas[chave].rotulo, qtd: 0 }; pr.ordemQuem.push(chave); }
      pr.quem[chave].qtd += it.qtd;
    });
  });

  var listaProdutos = Object.keys(produtos).map(function (k) {
    var p = produtos[k];
    return {
      id: p.id, nome: p.nome, categoria: p.categoria, qtd: p.qtd, valor: p.valor, temPeso: p.temPeso, gramas: p.gramas, ordem: p.ordem,
      quem: p.ordemQuem.map(function (c) { return p.quem[c]; })
    };
  }).sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); });

  var listaPessoas = ordemPessoas.map(function (k) {
    var p = pessoas[k];
    return {
      nome: p.rotulo, total: p.total, pago: p.pago, falta: p.total - p.pago, pedidos: p.pedidos, temPeso: p.temPeso,
      situacao: p.todosPagos ? 'pago' : (p.pago > 0 ? 'parcial' : 'a pagar')
    };
  });

  return {
    rodada: rodada,
    pedidos: ativos.length,
    cancelados: pedidos.length - ativos.length,
    itens: t.itens,
    total: t.total,
    pago: t.pago,
    aReceber: t.total - t.pago,
    temPeso: t.temPeso,
    produtos: listaProdutos,
    pessoas: listaPessoas,
    textoProdutos: textoProdutos_(listaProdutos, t, rodada),
    textoValores: textoValores_(listaPessoas, t, rodada)
  };
}

function textoProdutos_(produtos, t, rodada) {
  if (!produtos.length) return 'Nenhum pedido na rodada ' + rodada + ' ainda.';
  var l = ['*Pedido DuJOÃO, rodada ' + rodada + '*'];
  var cat = null;
  produtos.forEach(function (p) {
    if (p.categoria !== cat) {
      cat = p.categoria;
      l.push('');
      l.push(String(cat).toUpperCase());
    }
    var quem = p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ');
    var peso = [];
    if (p.gramas) peso.push(kg_(p.gramas / 1000));
    if (p.temPeso) peso.push('pelo peso');
    l.push('• *' + p.nome + '*: ' + p.qtd + ' (' + quem + ')' + (peso.length ? ', ' + peso.join(' + ') : ''));
  });
  l.push('');
  l.push('*Total:* ' + t.itens + (t.itens === 1 ? ' item' : ' itens') + ' (' + reais_(t.total) + (t.temPeso ? ' + itens pelo peso' : '') + ')');
  return l.join('\n');
}

function textoValores_(pessoas, t, rodada) {
  if (!pessoas.length) return 'Nenhum pedido na rodada ' + rodada + ' ainda.';
  var l = ['*Valores por pessoa, rodada ' + rodada + '*', ''];
  pessoas.forEach(function (p) {
    var extra = '';
    if (p.situacao === 'pago') extra = ' (pago)';
    else if (p.situacao === 'parcial') extra = ' (pago ' + reais_(p.pago) + ', falta ' + reais_(p.falta) + ')';
    l.push('• *' + p.nome + '*: ' + reais_(p.total) + (p.temPeso ? ' + peso' : '') + extra);
  });
  l.push('');
  l.push('*Total:* ' + reais_(t.total) + (t.temPeso ? ' + itens pelo peso' : ''));
  return l.join('\n');
}

/** Reescreve a aba "Resumo" com a rodada atual. Também está no menu DuJOÃO. */
function atualizarResumo() {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) lock = null;
  } catch (e) {
    lock = null;
  }
  try {
    return escreverResumo_();
  } finally {
    if (lock) soltar_(lock);
  }
}

function escreverResumo_() {
  var ss = planilha_();
  var rodada = rodadaAtual_();
  var r = calcularResumo_(lerPedidos_(rodada), lerCatalogo_(), rodada);
  var sh = ss.getSheetByName(ABA.RESUMO) || ss.insertSheet(ABA.RESUMO);

  var linhas = [];
  linhas.push(['Resumo da rodada ' + rodada, '', '', '']);
  linhas.push(['Atualizado em ' + Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm'), '', '', '']);
  linhas.push(['', '', '', '']);
  var cabProd = linhas.length + 1;
  linhas.push(['Produto', 'Qtd', 'Quem pediu', 'Valor (R$)']);
  r.produtos.forEach(function (p) {
    linhas.push([texto_(p.nome), p.qtd, texto_(p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ')), p.temPeso && !p.valor ? 'pelo peso' : p.valor / 100]);
  });
  linhas.push(['Total', r.itens, r.pedidos + (r.pedidos === 1 ? ' pedido' : ' pedidos'), r.total / 100]);
  var fimProd = linhas.length;
  linhas.push(['', '', '', '']);
  var cabPes = linhas.length + 1;
  linhas.push(['Pessoa', 'Pedidos', 'Situação', 'Valor (R$)']);
  r.pessoas.forEach(function (p) {
    var sit = p.situacao === 'pago' ? 'Pago' : p.situacao === 'parcial' ? 'Falta ' + reais_(p.falta) : 'A pagar';
    linhas.push([texto_(p.nome), "'" + p.pedidos.join(', '), sit, p.total / 100]);
  });
  linhas.push(['Recebido', '', '', r.pago / 100]);
  linhas.push(['A receber', '', '', r.aReceber / 100]);
  var fimPes = linhas.length;
  linhas.push(['', '', '', '']);
  var cabTexto = linhas.length + 1;
  linhas.push(['Mensagem para o WhatsApp (selecione as linhas abaixo e copie)', '', '', '']);
  r.textoProdutos.split('\n').forEach(function (t) { linhas.push([texto_(t), '', '', '']); });

  sh.clearFormats();
  garantirLinhas_(sh, linhas.length);
  sh.getRange(1, 1, linhas.length, 4).setValues(linhas);
  var sobra = sh.getMaxRows() - linhas.length;
  if (sobra > 0) sh.getRange(linhas.length + 1, 1, sobra, Math.max(4, sh.getMaxColumns())).clearContent();

  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold').setFontColor('#641312');
  sh.getRange(2, 1).setFontColor('#6e5551');
  [cabProd, cabPes].forEach(function (lin) {
    sh.getRange(lin, 1, 1, 4).setFontWeight('bold').setBackground('#641312').setFontColor('#ffffff');
  });
  sh.getRange(fimProd, 1, 1, 4).setFontWeight('bold').setBackground('#fff0d2');
  sh.getRange(fimPes - 1, 1, 2, 4).setFontWeight('bold').setBackground('#fff0d2');
  sh.getRange(cabTexto, 1).setFontWeight('bold').setFontColor('#641312');
  sh.getRange(cabProd + 1, 4, fimPes - cabProd, 1).setNumberFormat('"R$" #,##0.00');
  sh.getRange(cabProd, 3, fimProd - cabProd + 1, 1).setWrap(true);
  sh.setColumnWidth(1, 330);
  sh.setColumnWidth(2, 90);
  sh.setColumnWidth(3, 420);
  sh.setColumnWidth(4, 120);
  return r;
}

/* ======================================================================
   E-mails
   ====================================================================== */

function emailDono_() {
  return CONFIG.EMAIL_AVISO || Session.getEffectiveUser().getEmail();
}

function cotaEmail_() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return 99; }
}

function enviarEmailCliente_(p) {
  if (cotaEmail_() < 1) return 'Sem cota';
  try {
    MailApp.sendEmail({
      to: p.email,
      subject: 'Pedido nº ' + p.numero + ' confirmado | DuJOÃO',
      htmlBody: emailHtml_(p, false),
      body: emailTexto_(p, false),
      name: CONFIG.REMETENTE,
      replyTo: emailDono_()
    });
    return 'Enviada';
  } catch (err) {
    console.error('Falha no e-mail do cliente', err);
    return 'Falhou';
  }
}

function enviarEmailDono_(p) {
  if (cotaEmail_() < 1) return;
  var msg = {
    to: emailDono_(),
    subject: 'Novo pedido nº ' + p.numero + ': ' + p.nome + ', ' + reais_(p.total),
    htmlBody: emailHtml_(p, true),
    body: emailTexto_(p, true),
    name: CONFIG.REMETENTE,
    replyTo: p.email
  };
  try {
    MailApp.sendEmail(msg);
  } catch (err) {
    try { delete msg.replyTo; MailApp.sendEmail(msg); } catch (err2) { console.error('Falha no aviso de pedido', err2); }
  }
}

function unidadeTexto_(i) {
  if (i.unidade === 'kg') return i.qtd + (i.qtd === 1 ? ' peça' : ' peças') + ', ' + reais_(i.preco) + ' o kg';
  return i.qtd + ' × ' + reais_(i.preco);
}

function emailHtml_(p, paraDono) {
  var temPeso = p.itens.some(function (i) { return i.subtotal === null; });
  var linhas = p.itens.map(function (i) {
    var valor = i.subtotal === null ? 'pelo peso' : reais_(i.subtotal);
    return '<tr>' +
      '<td style="padding:10px 0;border-bottom:1px dashed #e2d3cd;font-size:15px;line-height:1.35">' +
        '<strong>' + esc_(i.nome) + '</strong><br><span style="color:#6e5551;font-size:13px">' + esc_(unidadeTexto_(i)) + '</span></td>' +
      '<td style="padding:10px 0 10px 12px;border-bottom:1px dashed #e2d3cd;font-size:15px;text-align:right;white-space:nowrap;vertical-align:top"><strong>' + esc_(valor) + '</strong></td>' +
      '</tr>';
  }).join('');

  var contato = paraDono
    ? '<p style="margin:12px 0 0;font-size:15px;line-height:1.6"><strong>' + esc_(p.nome) + '</strong><br>' +
      '<a href="mailto:' + esc_(p.email) + '" style="color:#641312">' + esc_(p.email) + '</a>' +
      (p.whatsapp ? '<br><a href="https://wa.me/55' + esc_(p.whatsapp) + '" style="color:#641312">WhatsApp ' + esc_(telefone_(p.whatsapp)) + '</a>' : '') + '</p>'
    : '<p style="margin:12px 0 0;font-size:15px;line-height:1.5">Olá, ' + esc_(primeiroNome_(p.nome)) + '! Recebemos seu pedido. Confira os itens:</p>';

  // As observações só vão no aviso para você (evita que o formulário seja usado para mandar texto a terceiros).
  var obs = paraDono && p.obs
    ? '<p style="margin:16px 0 0;padding:12px;background:#f7f0eb;border-radius:10px;font-size:14px;line-height:1.5"><strong>Observações:</strong> ' + esc_(p.obs).replace(/\n/g, '<br>') + '</p>'
    : '';

  var pagamento = !paraDono && CONFIG.PIX
    ? '<div style="margin:18px 0 0;padding:14px;border:1.5px dashed #c47a10;border-radius:12px;background:#fff8ea;font-size:14px;line-height:1.5">' +
      '<strong style="color:#641312">Pagamento</strong><br>' + esc_(CONFIG.PIX) + '</div>'
    : '';

  var rodape = paraDono
    ? '<p style="margin:20px 0 0;font-size:14px"><a href="' + esc_(CONFIG.URL_SITE) + 'painel.html" style="display:inline-block;background:#641312;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Abrir o painel</a>' +
      '&nbsp;&nbsp;<a href="' + esc_(planilha_().getUrl()) + '" style="color:#641312">Abrir a planilha</a></p>'
    : '<p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#6e5551">Dúvidas? Responda este e-mail' +
      (CONFIG.WHATSAPP ? ' ou <a href="https://wa.me/' + esc_(CONFIG.WHATSAPP) + '" style="color:#641312">fale com ' + esc_(CONFIG.RESPONSAVEL || 'a gente') + ' no WhatsApp</a>' : '') + '.</p>';

  var titulo = paraDono ? 'Novo pedido' : 'Pedido confirmado';
  return '' +
    '<div style="background:#efe5e0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#2a0b0a">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffefb;border-radius:14px;overflow:hidden">' +
      '<tr><td style="background:#641312;padding:20px 22px;text-align:center">' +
        '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:28px;letter-spacing:4px;color:#ffffff">DuJOÃO</div>' +
        '<div style="margin-top:4px;font-family:Georgia,\'Times New Roman\',serif;font-size:12px;letter-spacing:2px;color:#f8a828">A CASA DO TORRESMO</div>' +
      '</td></tr>' +
      '<tr><td style="padding:24px 24px 4px">' +
        '<p style="margin:0;font-size:14px;color:#6e5551">Pedido nº ' + esc_(p.numero) + (paraDono && p.rodada ? ', rodada ' + esc_(String(p.rodada)) : '') + '</p>' +
        '<h1 style="margin:4px 0 0;font-family:Georgia,\'Times New Roman\',serif;font-size:26px;line-height:1.2;color:#641312">' + titulo + '</h1>' +
        contato +
      '</td></tr>' +
      '<tr><td style="padding:8px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + linhas + '</table></td></tr>' +
      '<tr><td style="padding:14px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:16px;font-weight:bold">Total</td>' +
        '<td style="text-align:right;font-size:24px;font-weight:bold;color:#641312">' + reais_(p.total) + '</td></tr>' +
        (temPeso ? '<tr><td></td><td style="text-align:right;font-size:13px;color:#6e5551">+ itens cobrados pelo peso</td></tr>' : '') +
      '</table></td></tr>' +
      '<tr><td style="padding:0 24px 24px">' + obs + pagamento + rodape + '</td></tr>' +
    '</table>' +
    '<p style="margin:14px 0 0;text-align:center;font-size:12px;color:#8a7570">DuJOÃO, A Casa do Torresmo. Instagram @torresminhosdujoao</p>' +
    '</div>';
}

function emailTexto_(p, paraDono) {
  var l = [];
  l.push((paraDono ? 'Novo pedido nº ' : 'Pedido nº ') + p.numero + (paraDono ? '' : ' confirmado'));
  l.push('');
  if (paraDono) l.push(p.nome + ' <' + p.email + '>' + (p.whatsapp ? ', WhatsApp ' + telefone_(p.whatsapp) : ''));
  else l.push('Olá, ' + primeiroNome_(p.nome) + '! Recebemos seu pedido:');
  l.push('');
  p.itens.forEach(function (i) {
    l.push('- ' + i.nome + ' (' + unidadeTexto_(i) + '): ' + (i.subtotal === null ? 'pelo peso' : reais_(i.subtotal)));
  });
  l.push('');
  l.push('Total: ' + reais_(p.total) + (p.itens.some(function (i) { return i.subtotal === null; }) ? ' + itens cobrados pelo peso' : ''));
  if (paraDono && p.obs) l.push('Observações: ' + p.obs);
  if (!paraDono && CONFIG.PIX) { l.push(''); l.push(CONFIG.PIX); }
  if (paraDono) { l.push(''); l.push('Painel: ' + CONFIG.URL_SITE + 'painel.html'); }
  return l.join('\n');
}

/* ======================================================================
   Estrutura da planilha
   ====================================================================== */

/** Cria as abas que faltam (e os produtos iniciais). Roda sozinho no primeiro uso. */
function garantirEstrutura_(forcar) {
  var ss = planilha_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PLANILHA_ID')) props.setProperty('PLANILHA_ID', ss.getId());
  if (!props.getProperty('RODADA')) props.setProperty('RODADA', '1');
  if (!props.getProperty('ABERTO')) props.setProperty('ABERTO', 'sim');
  var prod = ss.getSheetByName(ABA.PRODUTOS);
  if (!forcar && prod && prod.getLastRow() >= 2 && ss.getSheetByName(ABA.PEDIDOS) && ss.getSheetByName(ABA.ITENS)) return;

  var lock = travar_(30000);
  try {
    try { ss.setSpreadsheetTimeZone(FUSO); } catch (e) { /* sem permissão para mudar o fuso */ }
    var tp = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
    var ti = aba_(ABA.ITENS, CAMPOS.ITENS);
    var tr = aba_(ABA.PRODUTOS, CAMPOS.PRODUTOS);
    if (!ss.getSheetByName(ABA.RESUMO)) ss.insertSheet(ABA.RESUMO);
    if (tr.sh.getLastRow() < 2) {
      var linhas = CATALOGO_INICIAL.map(function (c) {
        return linhaPorCampos_(tr, { id: c[0], categoria: c[1], produto: c[2], curto: c[3], detalhe: c[4], preco: c[5], unidade: c[6], disponivel: c[7] });
      });
      garantirLinhas_(tr.sh, linhas.length + 1);
      tr.sh.getRange(2, tr.col.disponivel + 1, linhas.length, 1).insertCheckboxes();
      tr.sh.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
    }
    formatar_(tp, { data: 'dd/mm/yyyy hh:mm', total: '"R$" #,##0.00' }, { numero: 70, data: 130, rodada: 70, nome: 180, email: 220, whatsapp: 130, itens: 300, total: 100, obs: 220, pago: 70, entregue: 80, cancelado: 90, confirmacao: 170, envio: 120 }, ['itens', 'obs']);
    formatar_(ti, { data: 'dd/mm/yyyy hh:mm', preco: '"R$" #,##0.00', subtotal: '"R$" #,##0.00', peso: '0.000' }, { numero: 90, data: 130, rodada: 70, cliente: 180, id: 170, produto: 320, qtd: 60, preco: 100, subtotal: 110, unidade: 80, peso: 90 }, []);
    formatar_(tr, { preco: '"R$" #,##0.00' }, { id: 170, categoria: 170, produto: 330, curto: 220, detalhe: 320, preco: 100, unidade: 80, disponivel: 95 }, []);
    try { tp.sh.hideColumns(tp.col.envio + 1); } catch (e) { /* já escondida */ }
    ss.getSheets().forEach(function (sh) {
      if (/^(P[aá]gina|Sheet|Planilha)\s?1$/i.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });
    if (!props.getProperty('SEQ')) props.setProperty('SEQ', String(maiorNumero_()));
  } finally {
    soltar_(lock);
  }
}

function formatar_(t, formatos, larguras, quebra) {
  var max = t.sh.getMaxRows();
  Object.keys(formatos).forEach(function (campo) {
    if (t.col[campo] !== undefined) t.sh.getRange(1, t.col[campo] + 1, max, 1).setNumberFormat(formatos[campo]);
  });
  Object.keys(larguras).forEach(function (campo) {
    if (t.col[campo] !== undefined) t.sh.setColumnWidth(t.col[campo] + 1, larguras[campo]);
  });
  quebra.forEach(function (campo) {
    if (t.col[campo] !== undefined) t.sh.getRange(1, t.col[campo] + 1, max, 1).setWrap(true);
  });
  t.sh.setFrozenRows(1);
}

var ABAS_ = {};

/** Abre uma aba (criando se faltar) e descobre a posição de cada coluna pelo cabeçalho. */
function aba_(nome, campos) {
  if (ABAS_[nome]) return ABAS_[nome];
  var ss = planilha_();
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  var ultima = sh.getLastColumn();
  var cab = ultima ? sh.getRange(1, 1, 1, ultima).getValues()[0].map(chave_) : [];
  var col = {};
  var faltando = [];
  campos.forEach(function (c) {
    var i = cab.indexOf(chave_(c[1]));
    if (i >= 0) col[c[0]] = i; else faltando.push(c);
  });
  if (faltando.length) {
    var prox = 0;
    for (var i = cab.length - 1; i >= 0; i--) { if (cab[i]) { prox = i + 1; break; } }
    faltando.forEach(function (c) {
      sh.getRange(1, prox + 1).setValue(c[1]);
      col[c[0]] = prox;
      prox++;
    });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, prox).setFontWeight('bold').setBackground('#641312').setFontColor('#ffffff');
  }
  var largura = 0;
  Object.keys(col).forEach(function (k) { largura = Math.max(largura, col[k] + 1); });
  ABAS_[nome] = { sh: sh, col: col, largura: Math.max(largura, sh.getLastColumn()) };
  return ABAS_[nome];
}

function linhasDados_(t) {
  var n = t.sh.getLastRow() - 1;
  if (n < 1) return [];
  return t.sh.getRange(2, 1, n, t.largura).getValues();
}

function linhaPorCampos_(t, valores) {
  var linha = [];
  for (var i = 0; i < t.largura; i++) linha.push('');
  Object.keys(valores).forEach(function (campo) {
    if (t.col[campo] !== undefined) linha[t.col[campo]] = valores[campo];
  });
  return linha;
}

function linhaDoPedido_(t, numero) {
  var n = t.sh.getLastRow() - 1;
  if (n < 1) return 0;
  var nums = t.sh.getRange(2, t.col.numero + 1, n, 1).getValues();
  for (var i = nums.length - 1; i >= 0; i--) {
    if (formatarNumero_(nums[i][0]) === numero) return i + 2;
  }
  return 0;
}

/** A aba precisa ter linhas suficientes antes de gravar com getRange/setValues. */
function garantirLinhas_(sh, ultimaLinha) {
  var max = sh.getMaxRows();
  if (ultimaLinha > max) sh.insertRowsAfter(max, ultimaLinha - max + 100);
}

/* ======================================================================
   Utilidades
   ====================================================================== */

function planilha_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('Planilha não encontrada.');
}

function travar_(ms) {
  var l = LockService.getScriptLock();
  l.waitLock(ms);
  return l;
}

function soltar_(l) {
  try { if (l) l.releaseLock(); } catch (e) { /* já liberado */ }
}

function rodadaAtual_() {
  return parseInt(PropertiesService.getScriptProperties().getProperty('RODADA') || '1', 10) || 1;
}

function lojaAberta_() {
  return (PropertiesService.getScriptProperties().getProperty('ABERTO') || 'sim') !== 'nao';
}

function avisoAtual_() {
  return PropertiesService.getScriptProperties().getProperty('AVISO') || '';
}

function verificarLimite_(email) {
  var cache = CacheService.getScriptCache();
  var porEmail = parseInt(cache.get('pedidos:' + email) || '0', 10) || 0;
  if (porEmail >= CONFIG.MAX_PEDIDOS_POR_EMAIL_HORA) {
    return 'Você já fez vários pedidos seguidos com este e-mail. Espere um pouco ou fale com ' + (CONFIG.RESPONSAVEL || 'a gente') + ' no WhatsApp.';
  }
  var geral = parseInt(cache.get('pedidos:geral') || '0', 10) || 0;
  if (geral >= CONFIG.MAX_PEDIDOS_10_MIN) return 'Muitos pedidos ao mesmo tempo. Tente de novo em alguns minutos.';
  return null;
}

function contarPedido_(email) {
  var cache = CacheService.getScriptCache();
  var porEmail = parseInt(cache.get('pedidos:' + email) || '0', 10) || 0;
  var geral = parseInt(cache.get('pedidos:geral') || '0', 10) || 0;
  cache.put('pedidos:' + email, String(porEmail + 1), 3600);
  cache.put('pedidos:geral', String(geral + 1), 600);
}

function proximoNumero_() {
  var props = PropertiesService.getScriptProperties();
  var seq = parseInt(props.getProperty('SEQ') || '0', 10) || 0;
  seq = Math.max(seq, maiorNumero_()) + 1;
  props.setProperty('SEQ', String(seq));
  return seq;
}

function maiorNumero_() {
  var t = aba_(ABA.PEDIDOS, CAMPOS.PEDIDOS);
  var n = t.sh.getLastRow() - 1;
  if (n < 1) return 0;
  var maior = 0;
  t.sh.getRange(2, t.col.numero + 1, n, 1).getValues().forEach(function (r) {
    var v = parseInt(String(r[0]).replace(/\D/g, ''), 10);
    if (v > maior) maior = v;
  });
  return maior;
}

function formatarNumero_(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
  if (!s) return '';
  s = String(parseInt(s, 10));
  while (s.length < 4) s = '0' + s;
  return s;
}

function limparTexto_(v, max, multilinha) {
  var s = String(v === null || v === undefined ? '' : v);
  s = multilinha ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
  return s.trim().slice(0, max);
}

/** Texto livre vai sempre com apóstrofo: a planilha não transforma em data, número ou fórmula. */
function texto_(s) {
  s = s === null || s === undefined ? '' : String(s);
  return s ? "'" + s : '';
}

function emailValido_(e) {
  return e.length <= 120 && !/\.\./.test(e) &&
    /^[a-z0-9._%+'\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(e);
}

/** Deixa o telefone com DDD + número (10 ou 11 dígitos), ou vazio. */
function telefoneNacional_(s) {
  var d = String(s === null || s === undefined ? '' : s).replace(/\D/g, '').replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) d = d.slice(2);
  else if (d.length > 11) d = d.slice(-11);
  return d.length === 10 || d.length === 11 ? d : '';
}

function numero_(v) {
  if (typeof v === 'number') return v;
  var s = String(v === null || v === undefined ? '' : v).trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

function centavos_(reais) { return Math.round(Number(reais) * 100); }

/** Peso em quilos (até 3 casas), ou null se vazio ou fora do razoável. */
function pesoValido_(v) {
  var n = numero_(v);
  if (!isFinite(n)) return null;
  n = Math.round(n * 1000) / 1000;
  return n > 0 && n < 100 ? n : null;
}

/** Valor em centavos de um item por quilo: preço do kg x peso, arredondado no centavo. */
function valorPeso_(precoKg, peso) {
  return Math.round(precoKg * Math.round(peso * 1000) / 1000);
}

function kg_(peso) {
  return (Math.round(peso * 1000) / 1000).toFixed(3).replace('.', ',') + ' kg';
}

function textoItens_(itens) {
  return itens.map(function (i) { return i.qtd + 'x ' + i.nome + (i.peso ? ' (' + kg_(i.peso) + ')' : ''); }).join('\n');
}

function verdadeiro_(v, padrao) {
  if (v === true || v === false) return v;
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  if (!s) return padrao;
  if (/^(sim|s|true|verdadeiro|x|1|ok)$/.test(s)) return true;
  if (/^(nao|não|n|false|falso|0)$/.test(s)) return false;
  return padrao;
}

function reais_(c) {
  var s = (Math.round(Number(c) || 0) / 100).toFixed(2).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + s.join(',');
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function chave_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function chavePessoa_(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function primeiroNome_(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

function telefone_(d) {
  d = telefoneNacional_(d);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return d;
}
