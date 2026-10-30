/**
 * Pedidos DuJOÃO — backend em Google Apps Script
 *
 * O que este script faz:
 *  - recebe os pedidos do site e grava nas abas "Pedidos" e "Itens";
 *  - confere os preços pela aba "Produtos" (o site não decide preço);
 *  - envia o e-mail de confirmação para o cliente e um aviso para você;
 *  - mantém a aba "Resumo" com o total por produto e por pessoa;
 *  - alimenta o painel (painel.html), protegido pela senha abaixo.
 *
 * Passo a passo de instalação: veja o arquivo LEIAME.md no GitHub.
 * Depois de qualquer mudança aqui: Implantar > Gerenciar implantações >
 * editar (lápis) > Versão: Nova versão > Implantar. A URL continua a mesma.
 */

var CONFIG = {
  // Senha do painel. Troque antes de publicar (mínimo 6 caracteres).
  SENHA_PAINEL: 'TROQUE-ESTA-SENHA',

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
  EMAIL_AVISO: ''
};

var FUSO = 'America/Sao_Paulo';
var ABA = { PEDIDOS: 'Pedidos', ITENS: 'Itens', PRODUTOS: 'Produtos', RESUMO: 'Resumo' };
var CAB_PEDIDOS = ['Nº', 'Data', 'Rodada', 'Nome', 'E-mail', 'WhatsApp', 'Itens', 'Total (R$)', 'Observações', 'Pago', 'Entregue', 'Cancelado', 'Envio'];
var CAB_ITENS = ['Nº pedido', 'Data', 'Rodada', 'Cliente', 'ID produto', 'Produto', 'Qtd', 'Preço (R$)', 'Subtotal (R$)', 'Unidade'];
var CAB_PRODUTOS = ['ID', 'Categoria', 'Produto', 'Nome curto', 'Detalhe', 'Preço (R$)', 'Unidade', 'Disponível'];
var COL = { NUM: 0, DATA: 1, RODADA: 2, NOME: 3, EMAIL: 4, WHATS: 5, ITENS: 6, TOTAL: 7, OBS: 8, PAGO: 9, ENTREGUE: 10, CANCELADO: 11, ENVIO: 12 };
var CAMPOS_MARCAVEIS = { pago: COL.PAGO, entregue: COL.ENTREGUE, cancelado: COL.CANCELADO };

// Tabela de revenda inicial. Depois de configurar, edite na aba "Produtos".
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
   Instalação e menu
   ====================================================================== */

/** Rode esta função uma vez (Executar > configurar) depois de colar o código. */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PLANILHA_ID', ss.getId());
  if (!props.getProperty('RODADA')) props.setProperty('RODADA', '1');
  if (!props.getProperty('ABERTO')) props.setProperty('ABERTO', 'sim');
  try { ss.setSpreadsheetTimeZone(FUSO); } catch (e) { /* sem permissão para mudar o fuso */ }

  var pedidos = garantirAba_(ss, ABA.PEDIDOS, CAB_PEDIDOS);
  var itens = garantirAba_(ss, ABA.ITENS, CAB_ITENS);
  var produtos = garantirAba_(ss, ABA.PRODUTOS, CAB_PRODUTOS);
  garantirAba_(ss, ABA.RESUMO, null);

  if (produtos.getLastRow() < 2) {
    var faixa = produtos.getRange(2, 1, CATALOGO_INICIAL.length, CAB_PRODUTOS.length);
    produtos.getRange(2, 8, CATALOGO_INICIAL.length, 1).insertCheckboxes();
    faixa.setValues(CATALOGO_INICIAL);
  }

  formatarPedidos_(pedidos);
  formatarItens_(itens);
  formatarProdutos_(produtos);

  // apaga a aba vazia que vem com a planilha nova
  ss.getSheets().forEach(function (sh) {
    var nome = sh.getName();
    if (/^(P[aá]gina|Sheet|Planilha)\s?1$/i.test(nome) && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  if (!props.getProperty('SEQ')) props.setProperty('SEQ', String(maiorNumero_()));
  atualizarResumo();

  var msg = senhaValida_()
    ? 'Planilha pronta. Agora publique: Implantar > Nova implantação > App da Web.'
    : 'Planilha pronta. Antes de publicar, troque a SENHA_PAINEL no início do código.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DuJOÃO')
    .addItem('Atualizar resumo', 'atualizarResumo')
    .addItem('Começar nova rodada', 'menuNovaRodada')
    .addSeparator()
    .addItem('Configurar planilha', 'configurar')
    .addToUi();
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

/** Atualiza o resumo quando você marca Pago / Entregue / Cancelado direto na planilha. */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var col = e.range.getColumn();
    if (sh.getName() === ABA.PEDIDOS && col >= COL.PAGO + 1 && col <= COL.CANCELADO + 1) atualizarResumo();
    if (sh.getName() === ABA.ITENS) atualizarResumo();
  } catch (err) { console.error(err); }
}

/* ======================================================================
   Web app: entrada do site e do painel
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
  var dados;
  try {
    dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, codigo: 'validacao', erro: 'Pedido em formato inválido.' });
  }
  try {
    var acao = dados && dados.acao;
    if (acao === 'pedido') return json_(registrarPedido_(dados));
    if (acao === 'catalogo') return json_(catalogoPublico_());
    if (acao === 'painel' || acao === 'marcar' || acao === 'loja' || acao === 'novaRodada') {
      var auth = autenticar_(dados.senha);
      if (!auth.ok) return json_(auth);
      if (acao === 'painel') return json_(dadosPainel_(dados.rodada));
      if (acao === 'marcar') return json_(marcar_(dados));
      if (acao === 'loja') return json_(configurarLoja_(dados));
      return json_(novaRodada_());
    }
    return json_({ ok: false, codigo: 'acao', erro: 'Ação desconhecida.' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, codigo: 'interno', erro: 'Erro interno. Tente de novo em instantes.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function catalogoPublico_() {
  return {
    ok: true,
    produtos: lerCatalogo_(),
    aberto: lojaAberta_(),
    aviso: PropertiesService.getScriptProperties().getProperty('AVISO') || '',
    rodada: rodadaAtual_()
  };
}

/* ======================================================================
   Pedidos
   ====================================================================== */

function registrarPedido_(d) {
  if (d.site) return { ok: false, codigo: 'validacao', erro: 'Não foi possível registrar o pedido.' };
  if (!lojaAberta_()) return { ok: false, codigo: 'fechado', erro: 'Os pedidos estão fechados no momento.' };

  var v = validarPedido_(d, lerCatalogo_());
  if (v.erro) return v.erro;
  var p = v.pedido;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var existente = null;
  try {
    if (p.idEnvio) existente = buscarPorEnvio_(p.idEnvio);
    if (!existente) {
      p.numero = formatarNumero_(proximoNumero_());
      p.data = new Date();
      p.rodada = rodadaAtual_();
      gravarPedido_(p);
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }

  if (existente) return respostaPedido_(existente, true);

  var emailOk = enviarEmailCliente_(p);
  if (CONFIG.AVISAR_A_CADA_PEDIDO) enviarEmailDono_(p);
  try { atualizarResumo(); } catch (err) { console.error(err); }
  return respostaPedido_(p, emailOk);
}

function respostaPedido_(p, emailOk) {
  return {
    ok: true,
    numero: p.numero,
    email: p.email,
    emailEnviado: !!emailOk,
    itens: p.itens.map(function (i) {
      return { id: i.id, nome: i.nome, qtd: i.qtd, preco: i.preco, subtotal: i.subtotal, unidade: i.unidade };
    }),
    total: p.total,
    temPeso: p.itens.some(function (i) { return i.subtotal === null; })
  };
}

/** Valida os dados do site e recalcula tudo com os preços da planilha. */
function validarPedido_(d, catalogo) {
  function erro(msg) { return { erro: { ok: false, codigo: 'validacao', erro: msg } }; }
  var nome = limparTexto_(d.nome, 80, false);
  if (nome.length < 2) return erro('Informe seu nome.');
  var email = limparTexto_(d.email, 120, false).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro('Confira o e-mail. Exemplo: nome@gmail.com');
  var whatsapp = String(d.whatsapp || '').replace(/\D/g, '').slice(0, 13);
  if (whatsapp.length < 10) whatsapp = '';
  var obs = limparTexto_(d.obs, 500, true);
  var idEnvio = String(d.idEnvio || '').replace(/[^\w\-]/g, '').slice(0, 64);

  if (!Array.isArray(d.itens) || !d.itens.length) return erro('Escolha pelo menos um produto.');
  if (d.itens.length > 60) return erro('Pedido grande demais. Divida em dois pedidos.');

  var porId = {};
  catalogo.forEach(function (p) { porId[p.id] = p; });
  var qtdPorId = {};
  var ordem = [];
  for (var i = 0; i < d.itens.length; i++) {
    var it = d.itens[i] || {};
    var id = String(it.id || '');
    var qtd = Math.floor(Number(it.qtd));
    if (!id || !isFinite(qtd) || qtd < 1) return erro('Quantidade inválida no pedido.');
    if (!qtdPorId[id]) ordem.push(id);
    qtdPorId[id] = (qtdPorId[id] || 0) + qtd;
  }

  var itens = [];
  var total = 0;
  for (var j = 0; j < ordem.length; j++) {
    var pid = ordem[j];
    var prod = porId[pid];
    if (!prod || !prod.disponivel) {
      return { erro: { ok: false, codigo: 'indisponivel', erro: (prod ? prod.nome : 'Um dos produtos') + ' não está disponível no momento. Atualizamos a lista, confira o pedido.' } };
    }
    var q = Math.min(qtdPorId[pid], 99);
    var preco = centavos_(prod.preco);
    var sub = prod.unidade === 'kg' ? null : preco * q;
    if (sub !== null) total += sub;
    itens.push({ id: pid, nome: prod.nome, qtd: q, preco: preco, subtotal: sub, unidade: prod.unidade });
  }

  return { pedido: { nome: nome, email: email, whatsapp: whatsapp, obs: obs, idEnvio: idEnvio, itens: itens, total: total } };
}

function gravarPedido_(p) {
  var ss = planilha_();
  var sh = ss.getSheetByName(ABA.PEDIDOS);
  var textoItens = p.itens.map(function (i) { return i.qtd + 'x ' + i.nome; }).join('\n');
  sh.appendRow([
    "'" + p.numero,
    p.data,
    p.rodada,
    seguro_(p.nome),
    seguro_(p.email),
    p.whatsapp ? "'" + p.whatsapp : '',
    seguro_(textoItens),
    p.total / 100,
    seguro_(p.obs),
    false, false, false,
    p.idEnvio
  ]);
  var linha = sh.getLastRow();
  sh.getRange(linha, COL.PAGO + 1, 1, 3).insertCheckboxes();

  var itensSh = ss.getSheetByName(ABA.ITENS);
  var linhas = p.itens.map(function (i) {
    return ["'" + p.numero, p.data, p.rodada, seguro_(p.nome), i.id, seguro_(i.nome), i.qtd, i.preco / 100, i.subtotal === null ? '' : i.subtotal / 100, i.unidade];
  });
  if (linhas.length) itensSh.getRange(itensSh.getLastRow() + 1, 1, linhas.length, CAB_ITENS.length).setValues(linhas);
}

function buscarPorEnvio_(idEnvio) {
  var lista = lerPedidos_(null);
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].envio && lista[i].envio === idEnvio) return lista[i];
  }
  return null;
}

/* ======================================================================
   Leitura da planilha
   ====================================================================== */

function lerCatalogo_() {
  var sh = planilha_().getSheetByName(ABA.PRODUTOS);
  if (!sh) return [];
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, CAB_PRODUTOS.length).getValues();
  var vistos = {};
  var lista = [];
  vals.forEach(function (r) {
    var id = String(r[0] || '').trim();
    var nome = String(r[2] || '').trim();
    var preco = numero_(r[5]);
    if (!id || !nome || vistos[id] || !isFinite(preco) || preco < 0) return;
    vistos[id] = true;
    lista.push({
      id: id,
      categoria: String(r[1] || '').trim() || 'Outros',
      nome: nome,
      curto: String(r[3] || '').trim(),
      detalhe: String(r[4] || '').trim(),
      preco: Math.round(preco * 100) / 100,
      unidade: /kg|quilo/i.test(String(r[6] || '')) ? 'kg' : 'un',
      disponivel: verdadeiro_(r[7], true)
    });
  });
  return lista;
}

function lerItens_() {
  var sh = planilha_().getSheetByName(ABA.ITENS);
  var mapa = {};
  if (!sh) return mapa;
  var n = sh.getLastRow() - 1;
  if (n < 1) return mapa;
  sh.getRange(2, 1, n, CAB_ITENS.length).getValues().forEach(function (r) {
    var numero = formatarNumero_(r[0]);
    var qtd = Math.floor(numero_(r[6]));
    if (!numero || !isFinite(qtd) || qtd < 1) return;
    var unidade = /kg/i.test(String(r[9] || '')) ? 'kg' : 'un';
    var subTxt = r[8];
    var sub = unidade === 'kg' || subTxt === '' || subTxt === null ? null : centavos_(numero_(subTxt));
    if (sub !== null && !isFinite(sub)) sub = null;
    (mapa[numero] = mapa[numero] || []).push({
      id: String(r[4] || '').trim(),
      nome: String(r[5] || '').trim(),
      qtd: qtd,
      preco: centavos_(numero_(r[7])) || 0,
      subtotal: sub,
      unidade: unidade
    });
  });
  return mapa;
}

function lerPedidos_(rodada) {
  var sh = planilha_().getSheetByName(ABA.PEDIDOS);
  if (!sh) return [];
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, CAB_PEDIDOS.length).getValues();
  var itensPorNumero = lerItens_();
  var lista = [];
  vals.forEach(function (r, i) {
    var numero = formatarNumero_(r[COL.NUM]);
    if (!numero) return;
    var rod = parseInt(r[COL.RODADA], 10) || 1;
    if (rodada && rod !== rodada) return;
    var itens = itensPorNumero[numero] || [];
    var totalPlanilha = numero_(r[COL.TOTAL]);
    var totalItens = itens.reduce(function (s, it) { return s + (it.subtotal || 0); }, 0);
    var data = r[COL.DATA] instanceof Date ? r[COL.DATA] : new Date(r[COL.DATA]);
    var dataValida = data instanceof Date && !isNaN(data.getTime());
    lista.push({
      linha: i + 2,
      numero: numero,
      data: dataValida ? data.toISOString() : '',
      dataTexto: dataValida ? Utilities.formatDate(data, FUSO, 'dd/MM HH:mm') : String(r[COL.DATA] || ''),
      rodada: rod,
      nome: String(r[COL.NOME] || '').trim(),
      email: String(r[COL.EMAIL] || '').trim(),
      whatsapp: String(r[COL.WHATS] || '').replace(/\D/g, ''),
      obs: String(r[COL.OBS] || '').trim(),
      itens: itens,
      total: isFinite(totalPlanilha) ? centavos_(totalPlanilha) : totalItens,
      pago: verdadeiro_(r[COL.PAGO], false),
      entregue: verdadeiro_(r[COL.ENTREGUE], false),
      cancelado: verdadeiro_(r[COL.CANCELADO], false),
      envio: String(r[COL.ENVIO] || '')
    });
  });
  return lista;
}

/* ======================================================================
   Painel
   ====================================================================== */

function autenticar_(senha) {
  if (!senhaValida_()) {
    return { ok: false, codigo: 'senha-padrao', erro: 'Defina uma senha em CONFIG.SENHA_PAINEL no Apps Script e publique uma nova versão.' };
  }
  if (String(senha || '') !== String(CONFIG.SENHA_PAINEL)) {
    Utilities.sleep(1200);
    return { ok: false, codigo: 'senha', erro: 'Senha incorreta.' };
  }
  return { ok: true };
}

function senhaValida_() {
  var s = String(CONFIG.SENHA_PAINEL || '');
  return s.length >= 6 && s !== 'TROQUE-ESTA-SENHA';
}

function dadosPainel_(rodadaPedida) {
  var atual = rodadaAtual_();
  var rodada = parseInt(rodadaPedida, 10);
  if (!rodada || rodada < 1 || rodada > atual) rodada = atual;
  var pedidos = lerPedidos_(rodada);
  var resumo = calcularResumo_(pedidos, lerCatalogo_(), rodada);
  return {
    ok: true,
    rodada: rodada,
    rodadaAtual: atual,
    aberto: lojaAberta_(),
    aviso: PropertiesService.getScriptProperties().getProperty('AVISO') || '',
    planilha: planilha_().getUrl(),
    pedidos: pedidos.map(pedidoPublico_),
    resumo: resumo
  };
}

function pedidoPublico_(p) {
  return {
    numero: p.numero, data: p.data, dataTexto: p.dataTexto, rodada: p.rodada,
    nome: p.nome, email: p.email, whatsapp: p.whatsapp, obs: p.obs,
    itens: p.itens, total: p.total,
    pago: p.pago, entregue: p.entregue, cancelado: p.cancelado
  };
}

function marcar_(d) {
  var coluna = CAMPOS_MARCAVEIS[d.campo];
  if (coluna === undefined) return { ok: false, codigo: 'validacao', erro: 'Campo inválido.' };
  var numero = formatarNumero_(d.numero);
  if (!numero) return { ok: false, codigo: 'validacao', erro: 'Pedido inválido.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var achado = null;
  try {
    var sh = planilha_().getSheetByName(ABA.PEDIDOS);
    var n = sh.getLastRow() - 1;
    if (n >= 1) {
      var nums = sh.getRange(2, 1, n, 1).getValues();
      for (var i = 0; i < nums.length; i++) {
        if (formatarNumero_(nums[i][0]) === numero) {
          sh.getRange(i + 2, coluna + 1).setValue(!!d.valor);
          achado = i + 2;
          break;
        }
      }
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (!achado) return { ok: false, codigo: 'nao-encontrado', erro: 'Pedido nº ' + numero + ' não encontrado.' };
  try { atualizarResumo(); } catch (err) { console.error(err); }
  var lista = lerPedidos_(null).filter(function (p) { return p.numero === numero; });
  return { ok: true, pedido: lista.length ? pedidoPublico_(lista[0]) : null };
}

function configurarLoja_(d) {
  var props = PropertiesService.getScriptProperties();
  if (typeof d.aberto === 'boolean') props.setProperty('ABERTO', d.aberto ? 'sim' : 'nao');
  if (typeof d.aviso === 'string') props.setProperty('AVISO', limparTexto_(d.aviso, 200, false));
  return { ok: true, aberto: lojaAberta_(), aviso: props.getProperty('AVISO') || '' };
}

function novaRodada_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var nova;
  try {
    nova = rodadaAtual_() + 1;
    PropertiesService.getScriptProperties().setProperty('RODADA', String(nova));
  } finally {
    lock.releaseLock();
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
  var ordemCategoria = {};
  catalogo.forEach(function (p, i) {
    ordem[p.id] = i;
    categoriaDe[p.id] = p.categoria;
    if (ordemCategoria[p.categoria] === undefined) ordemCategoria[p.categoria] = i;
  });

  var ativos = pedidos.filter(function (p) { return !p.cancelado; });
  var produtos = {};
  var pessoas = {};
  var ordemPessoas = [];
  var t = { itens: 0, total: 0, pago: 0, temPeso: false };

  ativos.forEach(function (ped) {
    var chave = chavePessoa_(ped.nome);
    if (!pessoas[chave]) { pessoas[chave] = { nome: ped.nome, total: 0, pago: 0, pedidos: [], temPeso: false, todosPagos: true }; ordemPessoas.push(chave); }
    var pes = pessoas[chave];
    pes.pedidos.push(ped.numero);
    pes.total += ped.total;
    if (ped.pago) pes.pago += ped.total; else pes.todosPagos = false;
    t.total += ped.total;
    if (ped.pago) t.pago += ped.total;

    ped.itens.forEach(function (it) {
      var chaveProd = it.id || it.nome;
      if (!produtos[chaveProd]) {
        produtos[chaveProd] = {
          id: it.id, nome: it.nome, categoria: categoriaDe[it.id] || 'Outros',
          qtd: 0, valor: 0, temPeso: false, quem: {}, ordemQuem: [],
          ordem: ordem[it.id] !== undefined ? ordem[it.id] : 9999
        };
      }
      var pr = produtos[chaveProd];
      pr.qtd += it.qtd;
      t.itens += it.qtd;
      if (it.subtotal === null) { pr.temPeso = true; pes.temPeso = true; t.temPeso = true; } else { pr.valor += it.subtotal; }
      if (!pr.quem[chave]) { pr.quem[chave] = { nome: ped.nome, qtd: 0 }; pr.ordemQuem.push(chave); }
      pr.quem[chave].qtd += it.qtd;
    });
  });

  var listaProdutos = Object.keys(produtos).map(function (k) {
    var p = produtos[k];
    return {
      id: p.id, nome: p.nome, categoria: p.categoria, qtd: p.qtd, valor: p.valor, temPeso: p.temPeso, ordem: p.ordem,
      quem: p.ordemQuem.map(function (c) { return p.quem[c]; })
    };
  }).sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); });

  var listaPessoas = ordemPessoas.map(function (c) {
    var p = pessoas[c];
    return { nome: p.nome, total: p.total, pago: p.pago, pedidos: p.pedidos, temPeso: p.temPeso, situacao: p.todosPagos ? 'pago' : (p.pago > 0 ? 'parcial' : 'a pagar') };
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
  var catAtual = null;
  produtos.forEach(function (p) {
    if (p.categoria !== catAtual) {
      catAtual = p.categoria;
      l.push('');
      l.push(String(catAtual).toUpperCase());
    }
    var quem = p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ');
    l.push('• *' + p.nome + '*: ' + p.qtd + ' (' + quem + ')' + (p.temPeso ? ', pelo peso' : ''));
  });
  l.push('');
  l.push('*Total:* ' + t.itens + (t.itens === 1 ? ' item' : ' itens') + ' (' + reais_(t.total) + (t.temPeso ? ' + itens pelo peso' : '') + ')');
  return l.join('\n');
}

function textoValores_(pessoas, t, rodada) {
  if (!pessoas.length) return 'Nenhum pedido na rodada ' + rodada + ' ainda.';
  var l = ['*Valores por pessoa, rodada ' + rodada + '*', ''];
  pessoas.forEach(function (p) {
    l.push('• *' + p.nome + '*: ' + reais_(p.total) + (p.temPeso ? ' + peso' : '') + (p.situacao === 'pago' ? ' (pago)' : ''));
  });
  l.push('');
  l.push('*Total:* ' + reais_(t.total) + (t.temPeso ? ' + itens pelo peso' : ''));
  return l.join('\n');
}

/** Reescreve a aba "Resumo" com a rodada atual. Também fica no menu DuJOÃO. */
function atualizarResumo() {
  var ss = planilha_();
  var rodada = rodadaAtual_();
  var r = calcularResumo_(lerPedidos_(rodada), lerCatalogo_(), rodada);
  var sh = ss.getSheetByName(ABA.RESUMO) || ss.insertSheet(ABA.RESUMO);
  sh.clear();

  var linhas = [];
  linhas.push(['Resumo da rodada ' + rodada, '', '', '']);
  linhas.push(['Atualizado em ' + Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm'), '', '', '']);
  linhas.push(['', '', '', '']);
  var cabProd = linhas.length + 1;
  linhas.push(['Produto', 'Qtd', 'Quem pediu', 'Valor (R$)']);
  r.produtos.forEach(function (p) {
    linhas.push([seguro_(p.nome), p.qtd, seguro_(p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ')), p.temPeso && !p.valor ? 'pelo peso' : p.valor / 100]);
  });
  linhas.push(['Total', r.itens, r.pedidos + (r.pedidos === 1 ? ' pedido' : ' pedidos'), r.total / 100]);
  var fimProd = linhas.length;
  linhas.push(['', '', '', '']);
  var cabPes = linhas.length + 1;
  linhas.push(['Pessoa', 'Pedidos', 'Situação', 'Valor (R$)']);
  r.pessoas.forEach(function (p) {
    linhas.push([seguro_(p.nome), "'" + p.pedidos.join(', '), p.situacao === 'pago' ? 'Pago' : p.situacao === 'parcial' ? 'Pago em parte' : 'A pagar', p.total / 100]);
  });
  linhas.push(['Recebido', '', '', r.pago / 100]);
  linhas.push(['A receber', '', '', r.aReceber / 100]);
  var fimPes = linhas.length;
  linhas.push(['', '', '', '']);
  var cabTexto = linhas.length + 1;
  linhas.push(['Mensagem para o WhatsApp (selecione as linhas abaixo e copie)', '', '', '']);
  r.textoProdutos.split('\n').forEach(function (t) { linhas.push([seguro_(t), '', '', '']); });

  sh.getRange(1, 1, linhas.length, 4).setValues(linhas);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold').setFontColor('#641312');
  sh.getRange(2, 1).setFontColor('#6e5551');
  [cabProd, cabPes].forEach(function (lin) {
    sh.getRange(lin, 1, 1, 4).setFontWeight('bold').setBackground('#641312').setFontColor('#ffffff');
  });
  sh.getRange(fimProd, 1, 1, 4).setFontWeight('bold').setBackground('#fff0d2');
  sh.getRange(fimPes - 1, 1, 2, 4).setFontWeight('bold').setBackground('#fff0d2');
  sh.getRange(cabTexto, 1).setFontWeight('bold').setFontColor('#641312');
  sh.getRange(cabProd + 1, 4, fimPes - cabProd, 1).setNumberFormat('"R$" #,##0.00');
  sh.setColumnWidth(1, 330);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 420);
  sh.setColumnWidth(4, 110);
  sh.getRange(cabProd, 3, fimProd - cabProd + 1, 1).setWrap(true);
  return r;
}

/* ======================================================================
   E-mails
   ====================================================================== */

function emailDono_() {
  return CONFIG.EMAIL_AVISO || Session.getEffectiveUser().getEmail();
}

function enviarEmailCliente_(p) {
  try {
    MailApp.sendEmail({
      to: p.email,
      subject: 'Pedido nº ' + p.numero + ' confirmado | DuJOÃO',
      htmlBody: emailHtml_(p, false),
      body: emailTexto_(p, false),
      name: CONFIG.REMETENTE,
      replyTo: emailDono_()
    });
    return true;
  } catch (err) {
    console.error('Falha no e-mail do cliente', err);
    return false;
  }
}

function enviarEmailDono_(p) {
  try {
    MailApp.sendEmail({
      to: emailDono_(),
      subject: 'Novo pedido nº ' + p.numero + ': ' + p.nome + ', ' + reais_(p.total),
      htmlBody: emailHtml_(p, true),
      body: emailTexto_(p, true),
      name: CONFIG.REMETENTE,
      replyTo: p.email
    });
  } catch (err) {
    console.error('Falha no aviso de pedido', err);
  }
}

function emailHtml_(p, paraDono) {
  var temPeso = p.itens.some(function (i) { return i.subtotal === null; });
  var linhas = p.itens.map(function (i) {
    var valor = i.subtotal === null ? 'pelo peso' : reais_(i.subtotal);
    var unit = i.unidade === 'kg' ? reais_(i.preco) + ' o kg' : i.qtd + ' × ' + reais_(i.preco);
    return '<tr>' +
      '<td style="padding:10px 0;border-bottom:1px dashed #e2d3cd;font-size:15px;line-height:1.35">' +
        '<strong>' + esc_(i.nome) + '</strong><br><span style="color:#6e5551;font-size:13px">' + esc_(unit) + '</span></td>' +
      '<td style="padding:10px 0 10px 12px;border-bottom:1px dashed #e2d3cd;font-size:15px;text-align:right;white-space:nowrap;vertical-align:top"><strong>' + esc_(valor) + '</strong></td>' +
      '</tr>';
  }).join('');

  var contato = paraDono
    ? '<p style="margin:12px 0 0;font-size:15px;line-height:1.6"><strong>' + esc_(p.nome) + '</strong><br>' +
      '<a href="mailto:' + esc_(p.email) + '" style="color:#641312">' + esc_(p.email) + '</a>' +
      (p.whatsapp ? '<br><a href="https://wa.me/' + esc_(numeroWhats_(p.whatsapp)) + '" style="color:#641312">WhatsApp ' + esc_(telefone_(p.whatsapp)) + '</a>' : '') + '</p>'
    : '<p style="margin:12px 0 0;font-size:15px;line-height:1.5">Olá, ' + esc_(primeiroNome_(p.nome)) + '! Recebemos seu pedido. Confira os itens:</p>';

  var obs = p.obs
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
      '<tr><td style="background:#641312;padding:22px;text-align:center">' +
        '<img src="' + esc_(CONFIG.URL_SITE) + 'assets/img/logo-email.png" width="150" alt="DuJOÃO, A Casa do Torresmo" style="display:block;margin:0 auto;border:0;max-width:150px;height:auto">' +
      '</td></tr>' +
      '<tr><td style="padding:24px 24px 4px">' +
        '<p style="margin:0;font-size:14px;color:#6e5551">Pedido nº ' + esc_(p.numero) + (paraDono && p.rodada ? ', rodada ' + esc_(String(p.rodada)) : '') + '</p>' +
        '<h1 style="margin:4px 0 0;font-family:Georgia,\'Times New Roman\',serif;font-size:26px;line-height:1.2;color:#641312">' + titulo + '</h1>' +
        contato +
      '</td></tr>' +
      '<tr><td style="padding:8px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + linhas + '</table></td></tr>' +
      '<tr><td style="padding:14px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:16px;font-weight:bold">Total</td>' +
        '<td style="text-align:right;font-family:Georgia,serif;font-size:24px;font-weight:bold;color:#641312">' + reais_(p.total) + '</td></tr>' +
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
  if (paraDono) {
    l.push(p.nome + ' <' + p.email + '>' + (p.whatsapp ? ', WhatsApp ' + telefone_(p.whatsapp) : ''));
  } else {
    l.push('Olá, ' + primeiroNome_(p.nome) + '! Recebemos seu pedido:');
  }
  l.push('');
  p.itens.forEach(function (i) {
    l.push('- ' + i.qtd + 'x ' + i.nome + ': ' + (i.subtotal === null ? 'pelo peso' : reais_(i.subtotal)));
  });
  l.push('');
  l.push('Total: ' + reais_(p.total) + (p.itens.some(function (i) { return i.subtotal === null; }) ? ' + itens pelo peso' : ''));
  if (p.obs) l.push('Observações: ' + p.obs);
  if (!paraDono && CONFIG.PIX) { l.push(''); l.push(CONFIG.PIX); }
  if (paraDono) { l.push(''); l.push('Painel: ' + CONFIG.URL_SITE + 'painel.html'); }
  return l.join('\n');
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
  throw new Error('Planilha não encontrada. Rode a função configurar.');
}

function rodadaAtual_() {
  return parseInt(PropertiesService.getScriptProperties().getProperty('RODADA') || '1', 10) || 1;
}

function lojaAberta_() {
  return (PropertiesService.getScriptProperties().getProperty('ABERTO') || 'sim') !== 'nao';
}

function proximoNumero_() {
  var props = PropertiesService.getScriptProperties();
  var seq = parseInt(props.getProperty('SEQ') || '', 10);
  if (!seq && seq !== 0) seq = maiorNumero_();
  seq = Math.max(seq, maiorNumero_()) + 1;
  props.setProperty('SEQ', String(seq));
  return seq;
}

function maiorNumero_() {
  var sh = planilha_().getSheetByName(ABA.PEDIDOS);
  if (!sh) return 0;
  var n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var maior = 0;
  sh.getRange(2, 1, n, 1).getValues().forEach(function (r) {
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

function garantirAba_(ss, nome, cabecalho) {
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  if (cabecalho && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  }
  if (cabecalho) {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold').setBackground('#641312').setFontColor('#ffffff');
  }
  return sh;
}

function formatarPedidos_(sh) {
  sh.getRange('B:B').setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange('H:H').setNumberFormat('"R$" #,##0.00');
  sh.getRange('G:G').setWrap(true);
  sh.getRange('I:I').setWrap(true);
  var larguras = [70, 130, 70, 180, 220, 130, 300, 100, 220, 70, 80, 90, 120];
  larguras.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.hideColumns(COL.ENVIO + 1);
}

function formatarItens_(sh) {
  sh.getRange('B:B').setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange('H:I').setNumberFormat('"R$" #,##0.00');
  var larguras = [90, 130, 70, 180, 170, 320, 60, 100, 110, 80];
  larguras.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function formatarProdutos_(sh) {
  sh.getRange('F:F').setNumberFormat('"R$" #,##0.00');
  var larguras = [170, 170, 330, 220, 320, 100, 80, 95];
  larguras.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function limparTexto_(v, max, multilinha) {
  var s = String(v === null || v === undefined ? '' : v);
  s = multilinha ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
  return s.trim().slice(0, max);
}

/** Evita que um texto seja interpretado como fórmula na planilha. */
function seguro_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function numero_(v) {
  if (typeof v === 'number') return v;
  var s = String(v === null || v === undefined ? '' : v).trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

function centavos_(reais) { return Math.round(Number(reais) * 100); }

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

function chavePessoa_(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function primeiroNome_(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

function numeroWhats_(d) {
  d = String(d || '').replace(/\D/g, '');
  return d.length <= 11 ? '55' + d : d;
}

function telefone_(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return d;
}
