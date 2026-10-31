/* Pedidos DuJOÃO — painel de tickets */
(function () {
  'use strict';

  var CFG = Object.assign({ urlPlanilha: '' }, window.CONFIG_DUJOAO || {});
  var K_TOKEN = 'dujoao.painel.token';
  var INTERVALO = 60000;
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  var estado = {
    token: '',
    dados: null,
    rodadaFixa: null,   // só fica preenchida quando você escolhe uma rodada antiga
    filtro: 'abertos',
    busca: '',
    vistos: null,
    vistosRodada: null,
    rodadaAtualVista: null,
    novos: new Set(),
    ultimaCarga: 0,
    carregando: false,
    pendente: false,
    req: 0,
    mutacao: 0
  };

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function dinheiro(c) { return brl.format((c || 0) / 100); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function normaliza(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function nacional(d) {
    d = String(d || '').replace(/\D/g, '').replace(/^0+/, '');
    if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) d = d.slice(2);
    else if (d.length > 11) d = d.slice(-11);
    return d.length === 10 || d.length === 11 ? d : '';
  }
  function telefone(d) {
    d = nacional(d);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }
  function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function capitaliza(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  /** "Torresmo 180 g" vira "Torresmo - 180g/cada"; sem peso no nome fica só o nome. */
  function linhaItem(i) {
    if (i.unidade === 'kg' || i.subtotal === null) {
      return '• *' + i.qtd + '* ' + i.nome + ' - ' + (i.peso && i.subtotal !== null ? kgTexto(gramasSalvas(i)) + ' (' + dinheiro(i.subtotal) + ')' : 'pelo peso');
    }
    var m = String(i.nome).match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)\s*(g|kg)$/i);
    return '• *' + i.qtd + '* ' + (m ? m[1] + ' - ' + m[2] + m[3].toLowerCase() + '/cada' : i.nome);
  }
  /** Mensagem de cobrança, um item por linha. */
  function textoCobranca(p) {
    var temPeso = p.itens.some(function (i) { return i.subtotal === null; });
    var pix = CFG.pix || {};
    var l = ['Oiii *' + capitaliza(primeiroNome(p.nome)) + '*! Seu pedido ficou assim:', ''];
    p.itens.forEach(function (i) { l.push(linhaItem(i)); });
    l.push('');
    l.push('*Total: ' + dinheiro(p.total) + (temPeso ? ' + itens pelo peso' : '') + '.*');
    if (pix.chave) {
      l.push('');
      l.push('Pode mandar o PIX para meu pai, ' + (pix.nome || '') + ', na chave: *' + pix.chave + '*');
    }
    l.push('');
    l.push('Muito obrigado!!');
    return l.join('\n');
  }
  function nbsp(s) { return String(s).replace(/ (\d)/g, ' $1'); }

  /* ---------- peso dos itens vendidos por quilo ---------- */
  /** "1,250", "1.25" ou "1,25 kg" = 1250 g; "800" ou "800 g" = 800 g. Vazio = null; inválido = NaN. */
  function gramasDe(texto) {
    var s = String(texto || '').toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    var emGramas = /\dg$/.test(s);
    s = s.replace(/kg$|g$/, '').replace(',', '.');
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
    var n = Number(s);
    var g = emGramas || (s.indexOf('.') < 0 && n >= 100) ? Math.round(n) : Math.round(n * 1000);
    return g >= 1 && g < 100000 ? g : NaN;
  }
  function kgCampo(g) { return (g / 1000).toFixed(3).replace('.', ','); }
  function kgTexto(g) { return kgCampo(g) + '\u00a0kg'; }
  /** "Torresmo 180 g": o número fica junto da unidade na quebra de linha. */
  function nomeHTML(n) { return esc(String(n || '').replace(/(\d) (g|kg|un)\b/g, '$1\u00a0$2')); }
  /** Mesma conta da planilha: preço do kg x peso, arredondado no centavo. */
  function valorPeso(precoKg, g) { return Math.round(precoKg * g / 1000); }
  function gramasSalvas(i) { return i.peso ? Math.round(i.peso * 1000) : null; }
  function cssId(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  var pesosEdicao = {}; // "numero|id" -> { texto, gramas, enviando, reenviar, erro } enquanto não está salvo
  function chavePeso(numero, id) { return numero + '|' + id; }
  function acharPedido(numero) {
    return estado.dados ? estado.dados.pedidos.filter(function (x) { return x.numero === numero; })[0] : null;
  }
  function itemDo(p, id) { return p ? p.itens.filter(function (x) { return x.id === id; })[0] : null; }

  /** O pedido como aparece na tela: com o peso que você acabou de digitar, mesmo antes de salvar. */
  function pedidoEfetivo(p) {
    var delta = 0;
    var mudou = false;
    var itens = p.itens.map(function (i) {
      var ed = i.unidade === 'kg' ? pesosEdicao[chavePeso(p.numero, i.id)] : null;
      if (!ed || (ed.gramas !== null && isNaN(ed.gramas))) return i;
      var sub = ed.gramas === null ? null : valorPeso(i.preco, ed.gramas);
      delta += (sub || 0) - (i.subtotal || 0);
      mudou = true;
      return Object.assign({}, i, { peso: ed.gramas === null ? null : ed.gramas / 1000, subtotal: sub });
    });
    return mudou ? Object.assign({}, p, { itens: itens, total: Math.max(0, p.total + delta) }) : p;
  }
  function estadoPeso(i, ed) {
    if (!ed) { var g = gramasSalvas(i); return { gr: g, modo: g === null ? 'falta' : 'ok' }; }
    if (ed.gramas !== null && isNaN(ed.gramas)) return { gr: NaN, modo: 'invalido' };
    if (ed.enviando !== undefined && ed.gramas === ed.enviando) return { gr: ed.gramas, modo: 'salvando' };
    return { gr: ed.gramas, modo: ed.erro ? 'erro' : 'pendente' };
  }
  function classePeso(est) {
    return est.modo === 'invalido' || est.modo === 'erro' ? ' peso--erro' : (est.gr === null ? ' peso--falta' : '');
  }
  function textoPeso(i, est) {
    if (est.modo === 'invalido') return 'Confira o peso. Exemplo: 1,250';
    if (est.gr === null) return i.qtd > 1 ? 'Digite o peso total das ' + i.qtd + ' peças.' : 'Digite o peso para somar no total.';
    return '<span class="nw">' + kgTexto(est.gr) + '</span> × <span class="nw">' + dinheiro(i.preco) + '</span> = <b class="nw">' + dinheiro(valorPeso(i.preco, est.gr)) + '</b>' +
      (est.modo === 'erro' ? ' <span class="peso__falhou">Não salvou.</span>' : '');
  }
  var ROTULO_SALVAR = { pendente: 'Salvar', salvando: 'Salvando…', erro: 'Tentar de novo' };
  function pesoHTML(p, i) {
    var ed = pesosEdicao[chavePeso(p.numero, i.id)];
    var est = estadoPeso(i, ed);
    var valor = ed ? ed.texto : (i.peso ? kgCampo(gramasSalvas(i)) : '');
    var idCalc = 'pc-' + p.numero + '-' + String(i.id).replace(/[^\w-]/g, '');
    var rotulo = ROTULO_SALVAR[est.modo];
    return '<div class="peso' + classePeso(est) + '">' +
      '<label class="peso__campo"><span class="peso__rotulo" aria-hidden="true">Peso</span>' +
        '<input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0,000" data-campo="peso" value="' + esc(valor) + '"' +
        ' aria-label="' + esc('Peso de ' + i.nome + ' em quilos, pedido nº ' + p.numero) + '" aria-describedby="' + idCalc + '"' +
        (est.modo === 'invalido' ? ' aria-invalid="true"' : '') + '>' +
        '<span class="peso__un" aria-hidden="true">kg</span></label>' +
      '<button type="button" class="peso__salvar"' + (rotulo ? '' : ' hidden') + (est.modo === 'salvando' ? ' disabled' : '') + '>' + (rotulo || 'Salvar') + '</button>' +
      '<p class="peso__calc" id="' + idCalc + '">' + textoPeso(i, est) + '</p>' +
    '</div>';
  }
  function valorItemHTML(i) {
    if (i.subtotal !== null) return dinheiro(i.subtotal);
    return i.unidade === 'kg' ? '<span class="ticket__pesar">a pesar</span>' : 'pelo peso';
  }
  function totalHTML(pe) {
    return dinheiro(pe.total) + (pe.itens.some(function (i) { return i.subtotal === null; }) ? ' <small>+ peso</small>' : '');
  }
  function hrefCobranca(pe) {
    var fone = nacional(pe.whatsapp);
    return 'https://wa.me/' + (fone ? '55' + fone : '') + '?text=' + encodeURIComponent(textoCobranca(pe));
  }

  /** Atualiza só o necessário no ticket, sem redesenhar o campo em que você está digitando. */
  function atualizarPeso(numero, id) {
    var t = document.querySelector('.ticket[data-numero="' + numero + '"]');
    var p = acharPedido(numero);
    var item = itemDo(p, id);
    if (!t || !item) return;
    var pe = pedidoEfetivo(p);
    var li = t.querySelector('.ticket__item[data-id="' + cssId(id) + '"]');
    if (li) {
      li.querySelector('.ticket__valor').innerHTML = valorItemHTML(itemDo(pe, id));
      var bloco = li.querySelector('.peso');
      if (bloco) {
        var ed = pesosEdicao[chavePeso(numero, id)];
        var est = estadoPeso(item, ed);
        bloco.className = 'peso' + classePeso(est);
        bloco.querySelector('.peso__calc').innerHTML = textoPeso(item, est);
        var b = bloco.querySelector('.peso__salvar');
        var rotulo = ROTULO_SALVAR[est.modo];
        b.hidden = !rotulo;
        b.disabled = est.modo === 'salvando';
        if (rotulo) b.textContent = rotulo;
        var campo = bloco.querySelector('input');
        if (est.modo === 'invalido') campo.setAttribute('aria-invalid', 'true'); else campo.removeAttribute('aria-invalid');
        if (document.activeElement !== campo) campo.value = ed ? ed.texto : (item.peso ? kgCampo(gramasSalvas(item)) : '');
      }
    }
    t.querySelector('.ticket__total strong').innerHTML = totalHTML(pe);
    var cob = t.querySelector('.ticket__cobrar');
    if (cob) cob.href = hrefCobranca(pe);
  }

  function salvarPeso(numero, id) {
    var chave = chavePeso(numero, id);
    var ed = pesosEdicao[chave];
    var item = itemDo(acharPedido(numero), id);
    if (!ed || !item || (ed.gramas !== null && isNaN(ed.gramas))) return;
    // já tem uma gravação deste item a caminho: manda o valor novo quando ela terminar
    if (ed.enviando !== undefined) { if (ed.gramas !== ed.enviando) ed.reenviar = true; return; }
    if (ed.gramas === gramasSalvas(item)) { delete pesosEdicao[chave]; atualizarPeso(numero, id); return; }
    var enviado = ed.gramas;
    ed.enviando = enviado;
    ed.erro = false;
    atualizarPeso(numero, id);
    estado.mutacao++;
    chamarPainel({ acao: 'peso', numero: numero, id: id, peso: enviado === null ? null : enviado / 1000 }).then(function (r) {
      if (!r || !r.ok) {
        if (r && r.codigo === 'acao') throw new Error('Para salvar o peso pelo painel, atualize o script da planilha (passo a passo no LEIAME).');
        throw new Error((r && r.erro) || 'Não foi possível salvar o peso.');
      }
      var p = acharPedido(numero);
      if (p && r.pedido) { p.itens = r.pedido.itens; p.total = r.pedido.total; }
      var atual = pesosEdicao[chave];
      var repetir = false;
      if (atual) {
        atual.enviando = undefined;
        if (atual.gramas === enviado) delete pesosEdicao[chave];
        else { repetir = !!atual.reenviar; atual.reenviar = false; }
      }
      atualizarPeso(numero, id);
      avisar(enviado === null ? 'Peso apagado no pedido nº ' + numero + '.' : 'Peso salvo no pedido nº ' + numero + ': ' + kgTexto(enviado) + '.');
      if (repetir) salvarPeso(numero, id); else recarregarDepois();
    }).catch(function (err) {
      var atual = pesosEdicao[chave];
      if (atual) { atual.enviando = undefined; atual.reenviar = false; atual.erro = true; }
      atualizarPeso(numero, id);
      if (err && err.silencioso) return;
      avisar(err && !err.codigo && err.message ? err.message : 'Não foi possível salvar o peso. Confira a internet e tente de novo.', 6000);
    });
  }
  function onde(el) {
    var t = el.closest('.ticket');
    var li = el.closest('.ticket__item');
    return t && li ? { numero: t.getAttribute('data-numero'), id: li.getAttribute('data-id') } : null;
  }
  function focoPeso() {
    var a = document.activeElement;
    if (!a || !a.getAttribute || a.getAttribute('data-campo') !== 'peso') return null;
    var o = onde(a);
    if (o) { o.ini = a.selectionStart; o.fim = a.selectionEnd; }
    return o;
  }
  function voltarFocoPeso(f) {
    var el = document.querySelector('.ticket[data-numero="' + f.numero + '"] .ticket__item[data-id="' + cssId(f.id) + '"] input[data-campo="peso"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    try { el.setSelectionRange(f.ini, f.fim); } catch (e) { /* sem seleção */ }
  }

  function lerToken() {
    try { return localStorage.getItem(K_TOKEN) || sessionStorage.getItem(K_TOKEN) || ''; } catch (e) { return ''; }
  }
  function gravarToken(t, lembrar) {
    try { (lembrar ? localStorage : sessionStorage).setItem(K_TOKEN, t); } catch (e) { /* sem armazenamento */ }
  }
  function apagarToken() {
    try {
      localStorage.removeItem(K_TOKEN); sessionStorage.removeItem(K_TOKEN);
      localStorage.removeItem('dujoao.painel.senha'); sessionStorage.removeItem('dujoao.painel.senha'); // versão antiga
    } catch (e) { /* sem armazenamento */ }
  }

  var toastTimer;
  function avisar(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('toast--visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('toast--visivel'); }, ms || 3000);
  }

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    return new Promise(function (ok, falha) {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? ok() : falha(); } catch (e) { falha(e); }
      ta.remove();
    });
  }

  function chamar(corpo, limite) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, limite || 30000) : null;
    var opcoes = { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'text/plain;charset=utf-8' } };
    if (ctrl) opcoes.signal = ctrl.signal;
    return fetch(CFG.urlPlanilha, opcoes)
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        try { return JSON.parse(txt); } catch (e) { var err = new Error('resposta'); err.codigo = 'resposta'; throw err; }
      })
      .catch(function (e) {
        if (e && e.codigo) throw e;
        var err = new Error('rede');
        err.codigo = e && e.name === 'AbortError' ? 'tempo' : 'rede';
        throw err;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }
  function chamarPainel(corpo) {
    corpo.token = estado.token;
    return chamar(corpo, 30000).then(function (r) {
      if (r && !r.ok && (r.codigo === 'sessao' || r.codigo === 'sem-senha')) {
        apagarToken();
        estado.token = '';
        mostrarEntrada(r.erro);
        var e = new Error(r.erro); e.codigo = r.codigo; e.silencioso = true; throw e;
      }
      return r;
    });
  }

  /* ---------- diálogo de confirmação ---------- */
  function confirmar(titulo, texto, rotuloSim) {
    var d = $('dialogo');
    if (!d.showModal) return Promise.resolve(window.confirm(titulo + '\n\n' + texto));
    $('dialogo-titulo').textContent = titulo;
    $('dialogo-texto').textContent = texto;
    $('dialogo-sim').textContent = rotuloSim;
    d.returnValue = '';
    d.showModal();
    return new Promise(function (ok) {
      d.addEventListener('close', function fechou() {
        d.removeEventListener('close', fechou);
        ok(d.returnValue === 'sim');
      });
    });
  }

  /* ---------- entrada ---------- */
  function mostrarEntrada(msg) {
    $('app').hidden = true;
    $('entrada').hidden = false;
    var erro = $('entrada-erro');
    var senha = $('senha');
    if (msg) { erro.textContent = msg; erro.hidden = false; senha.setAttribute('aria-invalid', 'true'); }
    else { erro.hidden = true; senha.removeAttribute('aria-invalid'); }
    if (!CFG.urlPlanilha) {
      $('entrada-texto').textContent = 'O painel funciona depois que a planilha estiver ligada ao site. Siga o passo a passo do arquivo LEIAME.md.';
      senha.disabled = true;
      $('entrar').disabled = true;
      return;
    }
    setTimeout(function () { senha.focus(); if (msg) senha.select(); }, 30);
  }

  function entrar(e) {
    e.preventDefault();
    var senha = $('senha').value.trim(); // ignora espaço sobrando ao colar
    if (!senha) { $('senha').focus(); return; }
    var botao = $('entrar');
    botao.disabled = true;
    botao.innerHTML = '<span class="girando" aria-hidden="true"></span>Entrando…';
    chamar({ acao: 'entrar', senha: senha }, 30000).then(function (r) {
      if (!r || !r.ok) { mostrarEntrada((r && r.erro) || 'Não foi possível entrar.'); return; }
      estado.token = r.token;
      gravarToken(r.token, $('lembrar').checked);
      $('senha').value = '';
      receber(r, false);
    }).catch(function (err) {
      mostrarEntrada(err && err.codigo === 'resposta'
        ? 'A planilha não respondeu como esperado. Confira se a implantação está como "Qualquer pessoa".'
        : 'Não foi possível conectar à planilha. Confira a internet e tente de novo.');
    }).finally(function () {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    });
  }

  /* ---------- carregar dados ---------- */
  function carregar(silencioso) {
    if (estado.carregando) { estado.pendente = true; return Promise.resolve(false); }
    estado.carregando = true;
    estado.pendente = false;
    var meu = ++estado.req;
    var mutacaoAntes = estado.mutacao;
    $('atualizar').classList.add('icone-btn--girando');
    return chamarPainel({ acao: 'painel', rodada: estado.rodadaFixa }).then(function (r) {
      if (meu !== estado.req) return false;
      if (!r || !r.ok) throw new Error((r && r.erro) || 'Erro ao carregar.');
      // uma mudança feita durante a carga deixa esta resposta velha: carrega de novo
      if (mutacaoAntes !== estado.mutacao) { estado.pendente = true; return false; }
      receber(r, silencioso);
      return true;
    }).catch(function (e) {
      if (e && e.silencioso) return false;
      if (!$('app').hidden) { if (!silencioso) avisar('Não foi possível atualizar. Confira a internet.'); }
      else mostrarEntrada('Não foi possível conectar à planilha. Confira a internet e tente de novo.');
      return false;
    }).finally(function () {
      estado.carregando = false;
      $('atualizar').classList.remove('icone-btn--girando');
      if (estado.pendente) { estado.pendente = false; setTimeout(function () { carregar(true); }, 300); }
    });
  }

  function receber(r, silencioso) {
    var numeros = r.pedidos.map(function (p) { return p.numero; });
    if (estado.vistos && estado.vistosRodada === r.rodada) {
      var novos = numeros.filter(function (n) { return !estado.vistos.has(n); });
      novos.forEach(function (n) { estado.novos.add(n); });
      if (novos.length) avisar(novos.length === 1 ? 'Chegou 1 pedido novo.' : 'Chegaram ' + novos.length + ' pedidos novos.');
    }
    if (estado.rodadaAtualVista && r.rodadaAtual > estado.rodadaAtualVista) avisar('Começou a rodada ' + r.rodadaAtual + '.');
    estado.rodadaAtualVista = r.rodadaAtual;
    if (estado.rodadaFixa && estado.rodadaFixa === r.rodadaAtual) estado.rodadaFixa = null;
    estado.vistos = new Set(numeros);
    estado.vistosRodada = r.rodada;
    estado.dados = r;
    estado.ultimaCarga = Date.now();
    mostrarApp();
    renderizar(silencioso);
    var agora = new Date();
    $('atualizado').textContent = 'Atualizado às ' + String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
  }

  function mostrarApp() {
    $('entrada').hidden = true;
    $('app').hidden = false;
  }

  /* ---------- renderização ---------- */
  // Em aberto = falta pagar ou entregar. Pago + entregue vai para Concluídos.
  function emAberto(p) { return !p.cancelado && !(p.pago && p.entregue); }
  var FILTROS = [
    { id: 'abertos', nome: 'Em aberto', teste: emAberto },
    { id: 'a-pagar', nome: 'A pagar', teste: function (p) { return !p.cancelado && !p.pago; } },
    { id: 'a-entregar', nome: 'A entregar', teste: function (p) { return !p.cancelado && !p.entregue; } },
    { id: 'concluidos', nome: 'Concluídos', teste: function (p) { return !p.cancelado && p.pago && p.entregue; } },
    { id: 'todos', nome: 'Todos', teste: function (p) { return !p.cancelado; } },
    { id: 'cancelados', nome: 'Cancelados', teste: function (p) { return p.cancelado; } }
  ];
  function filtroAtual() { return FILTROS.filter(function (f) { return f.id === estado.filtro; })[0] || FILTROS[0]; }

  /** Guarda foco e posição da tela para a lista não "pular" quando os dados atualizam. */
  function lembrarTela() {
    var info = {};
    var a = document.activeElement;
    var t = a && a.closest ? a.closest('.ticket') : null;
    if (t && a.getAttribute('data-campo') !== 'peso') info.foco = { numero: t.getAttribute('data-numero'), campo: a.getAttribute('data-campo') || (a.classList.contains('ticket__cancelar') ? 'cancelado' : null) };
    var f = a && a.closest ? a.closest('[data-filtro]') : null;
    if (f) info.filtro = f.getAttribute('data-filtro');
    if (!$('painel-tickets').hidden) {
      var topo = document.querySelector('.painel-topo').getBoundingClientRect().bottom;
      var ref = [].find.call(document.querySelectorAll('.ticket'), function (el) { return el.getBoundingClientRect().bottom > topo + 10; });
      if (ref) info.ancora = { numero: ref.getAttribute('data-numero'), y: ref.getBoundingClientRect().top };
    }
    return info;
  }
  function restaurarTela(info) {
    if (info.ancora && window.scrollY > 0) {
      var el = document.querySelector('.ticket[data-numero="' + info.ancora.numero + '"]');
      if (el) window.scrollBy(0, el.getBoundingClientRect().top - info.ancora.y);
    }
    if (info.foco) focarTicket(info.foco.numero, info.foco.campo);
    if (info.filtro) { var b = document.querySelector('[data-filtro="' + info.filtro + '"]'); if (b) b.focus({ preventScroll: true }); }
  }

  function renderizar(silencioso) {
    var info = lembrarTela();
    renderTopo();
    renderFiltros();
    if (!(silencioso && focoPeso())) renderTickets();
    renderResumo();
    renderProdutos(false);
    if (silencioso) restaurarTela(info);
  }

  function renderTopo() {
    var d = estado.dados;
    var sel = $('rodada');
    var html = '';
    for (var i = d.rodadaAtual; i >= 1; i--) {
      html += '<option value="' + i + '"' + (i === d.rodada ? ' selected' : '') + '>' + i + (i === d.rodadaAtual ? ' (atual)' : '') + '</option>';
    }
    sel.innerHTML = html;
    var st = $('status-loja');
    st.textContent = d.aberto ? 'Recebendo pedidos' : 'Pedidos fechados';
    st.className = 'status-loja ' + (d.aberto ? 'status-loja--aberto' : 'status-loja--fechado');
    $('n-tickets').textContent = d.pedidos.filter(emAberto).length;
  }

  function renderFiltros() {
    var pedidos = estado.dados.pedidos;
    $('filtros').innerHTML = FILTROS.map(function (f) {
      var n = pedidos.filter(f.teste).length;
      return '<button type="button" class="chip chip--filtro" data-filtro="' + f.id + '" aria-pressed="' + (estado.filtro === f.id) + '">' +
        esc(f.nome) + ' <span class="chip__n">' + n + '</span></button>';
    }).join('');
  }

  function combinaBusca(p, termo) {
    if (!termo) return true;
    var alvo = normaliza(p.nome + ' ' + p.numero + ' ' + parseInt(p.numero, 10) + ' ' + p.email + ' ' + p.itens.map(function (i) { return i.nome; }).join(' '));
    return termo.split(/\s+/).every(function (t) { return alvo.indexOf(t) >= 0; });
  }

  function ticketHTML(p) {
    var concluido = p.pago && p.entregue && !p.cancelado;
    var pe = pedidoEfetivo(p);
    var itens = pe.itens.map(function (i, k) {
      var kg = i.unidade === 'kg';
      return '<li class="ticket__item' + (kg ? ' ticket__item--kg' : '') + '" data-id="' + esc(i.id) + '"><span class="ticket__q">' + i.qtd + '</span>' +
        '<span class="ticket__produto">' + nomeHTML(i.nome) + (kg ? '<small>' + dinheiro(i.preco) + ' o kg</small>' : '') + '</span>' +
        '<span class="ticket__valor">' + valorItemHTML(i) + '</span>' +
        (kg && !p.cancelado ? pesoHTML(p, p.itens[k]) : '') + '</li>';
    }).join('');
    var contato = [];
    var fone = nacional(p.whatsapp);
    if (fone) {
      var msg = encodeURIComponent('Oi, ' + primeiroNome(p.nome) + '! Sobre o seu pedido nº ' + p.numero + ' DuJOÃO:');
      contato.push('<a href="https://wa.me/55' + fone + '?text=' + msg + '" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-conversa"/></svg>' + esc(telefone(fone)) + '</a>');
    }
    if (p.email) contato.push('<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>');
    var rotuloNum = 'nº ' + esc(p.numero);
    var carimbo = p.cancelado
      ? '<span class="carimbo carimbo--cancelado" aria-hidden="true">Cancelado</span>'
      : concluido ? '<span class="carimbo carimbo--concluido" aria-hidden="true">Concluído</span>' : '';
    var situacao = p.cancelado ? 'Cancelado' : (p.pago ? 'Pago' : 'A pagar') + ', ' + (p.entregue ? 'entregue' : 'a entregar');
    var avisoEmail = p.confirmacao === 'Falhou' || p.confirmacao === 'Sem cota'
      ? '<p class="ticket__alerta">O e-mail de confirmação não foi enviado para esta pessoa.</p>' : '';

    return '<article class="ticket papel serrilha' + (p.cancelado ? ' ticket--cancelado' : '') + (concluido ? ' ticket--concluido' : '') + '" data-numero="' + esc(p.numero) + '" aria-labelledby="t-' + esc(p.numero) + '">' +
      carimbo +
      '<div class="ticket__cabeca">' +
        '<p class="ticket__num" id="t-' + esc(p.numero) + '"><span class="sr-only">Pedido </span>Nº ' + esc(p.numero) +
          (estado.novos.has(p.numero) ? ' <span class="selo-novo">Novo</span>' : '') + '</p>' +
        '<p class="ticket__data">' + esc(p.dataTexto) + '</p>' +
      '</div>' +
      '<h3 class="ticket__nome">' + esc(p.nome) + '</h3>' +
      '<p class="sr-only">' + situacao + '</p>' +
      (contato.length ? '<div class="ticket__contato">' + contato.join('') + '</div>' : '') +
      avisoEmail +
      '<ul class="ticket__itens">' + itens + '</ul>' +
      '<div class="ticket__total"><span>Total</span><strong>' + totalHTML(pe) + '</strong></div>' +
      (p.obs ? '<p class="ticket__obs"><strong>Obs.:</strong> ' + esc(p.obs) + '</p>' : '') +
      (p.cancelado ? '' :
        '<div class="ticket__acoes">' +
          botaoAlternar(p, 'pago', 'Pago', rotuloNum) +
          botaoAlternar(p, 'entregue', 'Entregue', rotuloNum) +
        '</div>') +
      (!p.pago && !p.cancelado
        ? '<a class="ticket__cobrar" href="' + esc(hrefCobranca(pe)) + '" target="_blank" rel="noopener">' +
          '<svg aria-hidden="true"><use href="#i-conversa"/></svg>Cobrar no WhatsApp<span class="sr-only"> (pedido ' + rotuloNum + ')</span></a>'
        : '') +
      '<button type="button" class="ticket__cancelar" data-acao="cancelar">' + (p.cancelado ? 'Reativar pedido' : 'Cancelar pedido') + '<span class="sr-only"> ' + rotuloNum + '</span></button>' +
    '</article>';
  }

  function botaoAlternar(p, campo, nome, rotuloNum) {
    var ligado = !!p[campo];
    return '<button type="button" class="alternar" data-campo="' + campo + '" aria-pressed="' + ligado + '">' +
      '<span class="alternar__caixa" aria-hidden="true">' + (ligado ? '<svg><use href="#i-check"/></svg>' : '') + '</span>' +
      nome + '<span class="sr-only"> (pedido ' + rotuloNum + ')</span></button>';
  }

  function renderTickets() {
    var filtro = filtroAtual();
    var termo = normaliza(estado.busca.trim());
    var lista = estado.dados.pedidos
      .filter(filtro.teste)
      .filter(function (p) { return combinaBusca(p, termo); })
      .sort(function (a, b) { return Number(b.numero) - Number(a.numero); });
    var foco = focoPeso();
    $('tickets').innerHTML = lista.map(ticketHTML).join('');
    if (foco) voltarFocoPeso(foco);
    var vazio = $('tickets-vazio');
    if (lista.length) { vazio.hidden = true; return; }
    vazio.hidden = false;
    if (!estado.dados.pedidos.length) {
      vazio.innerHTML = '<strong>Nenhum pedido na rodada ' + estado.dados.rodada + ' ainda.</strong>Quando alguém confirmar um pedido no site, ele aparece aqui.';
    } else if (termo) {
      var outros = estado.dados.pedidos.filter(function (p) { return combinaBusca(p, termo); }).length;
      vazio.innerHTML = '<strong>Nada encontrado em ' + esc(filtro.nome) + ' para "' + esc(estado.busca.trim()) + '".</strong>' +
        (outros ? 'Há ' + plural(outros, 'pedido', 'pedidos') + ' com esse termo em outros filtros.' : 'Confira o nome ou o número do pedido.');
    } else if (filtro.id === 'abertos') {
      vazio.innerHTML = '<strong>Tudo em dia.</strong>Todos os pedidos desta rodada estão pagos e entregues. Eles ficam em Concluídos.';
    } else {
      vazio.innerHTML = '<strong>Nenhum ticket em ' + esc(filtro.nome) + '.</strong>Escolha outro filtro acima.';
    }
  }

  function renderResumo() {
    var d = estado.dados;
    var r = d.resumo;
    var peso = r.temPeso ? ' <small>+ itens pelo peso</small>' : '';
    $('numeros').innerHTML =
      numeroHTML('Pedidos', String(r.pedidos)) +
      numeroHTML('Itens', String(r.itens)) +
      numeroHTML('Total', dinheiro(r.total) + peso) +
      numeroHTML('Recebido', dinheiro(r.pago)) +
      numeroHTML('A receber', dinheiro(r.aReceber));

    if (!r.produtos.length) {
      $('lista-produtos').innerHTML = '<p class="cartao__vazio">Nenhum pedido na rodada ' + d.rodada + ' ainda.</p>';
    } else {
      var html = '';
      var cat = null;
      r.produtos.forEach(function (p) {
        if (p.categoria !== cat) {
          if (cat !== null) html += '</ul>';
          cat = p.categoria;
          html += '<h3 class="cat-titulo">' + esc(cat) + '</h3><ul class="lista-prod">';
        }
        var peso = [];
        if (p.gramas) peso.push(kgTexto(p.gramas));
        if (p.temPeso) peso.push('a pesar');
        html += '<li><span class="lp__nome">' + esc(p.nome) + (peso.length ? ' <small>(' + peso.join(' + ') + ')</small>' : '') + '</span>' +
          '<span class="lp__qtd">' + p.qtd + '</span>' +
          '<span class="lp__quem">' + esc(p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ')) + '</span></li>';
      });
      html += '</ul><div class="lista-prod__total"><span>Total</span><strong>' + plural(r.itens, 'item', 'itens') + ', ' + dinheiro(r.total) + (r.temPeso ? ' + peso' : '') + '</strong></div>';
      $('lista-produtos').innerHTML = html;
    }
    $('copiar-produtos').disabled = !r.produtos.length;

    $('lista-pessoas').innerHTML = r.pessoas.length ? r.pessoas.map(function (p) {
      var st = p.situacao === 'pago' ? '<span class="st st--ok">Pago</span>'
        : p.situacao === 'parcial' ? '<span class="st st--pendente">Falta ' + dinheiro(p.falta) + '</span>'
        : '<span class="st st--pendente">A pagar</span>';
      return '<li><span class="lpes__nome">' + esc(p.nome) + '</span>' + st + '<span class="lpes__valor">' + dinheiro(p.total) + (p.temPeso ? ' <small>+ peso</small>' : '') + '</span></li>';
    }).join('') : '<li class="cartao__vazio">Ninguém pediu ainda.</li>';
    $('copiar-valores').disabled = !r.pessoas.length;

    $('aberto').setAttribute('aria-checked', d.aberto ? 'true' : 'false');
    if (document.activeElement !== $('aviso')) $('aviso').value = d.aviso || '';
    $('nova-rodada').textContent = 'Começar a rodada ' + (d.rodadaAtual + 1);
    $('rodada-desc').textContent = 'Os pedidos da rodada ' + d.rodadaAtual + ' continuam salvos e aparecem no seletor de rodada. Comece uma nova quando fechar este pedido com o DuJOÃO.';
    var link = $('link-planilha');
    if (d.planilha) { link.href = d.planilha; link.parentNode.hidden = false; } else link.parentNode.hidden = true;
  }

  function numeroHTML(rotulo, valor) {
    return '<div class="numero"><span>' + esc(rotulo) + '</span><strong>' + valor + '</strong></div>';
  }

  /* ---------- ações ---------- */
  var recarregarTimer;
  function recarregarDepois() {
    clearTimeout(recarregarTimer);
    recarregarTimer = setTimeout(function () { carregar(true); }, 1200);
  }

  function marcar(numero, campo, valor) {
    var p = estado.dados.pedidos.filter(function (x) { return x.numero === numero; })[0];
    if (!p) return;
    estado.mutacao++;
    var antes = p[campo];
    // próximo ticket da lista, para o foco não se perder se este sair do filtro
    var atual = document.querySelector('.ticket[data-numero="' + numero + '"]');
    var vizinho = atual && (atual.nextElementSibling || atual.previousElementSibling);
    var numVizinho = vizinho ? vizinho.getAttribute('data-numero') : null;
    p[campo] = valor;
    estado.novos.delete(numero);
    renderFiltros();
    renderTickets();
    if (document.querySelector('.ticket[data-numero="' + numero + '"]')) focarTicket(numero, campo);
    else if (numVizinho && document.querySelector('.ticket[data-numero="' + numVizinho + '"]')) focarTicket(numVizinho, 'pago');
    else $('tickets').focus({ preventScroll: true });
    chamarPainel({ acao: 'marcar', numero: numero, campo: campo, valor: valor }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.erro) || 'erro');
      var rotulos = { pago: valor ? 'marcado como pago' : 'voltou para a pagar', entregue: valor ? 'marcado como entregue' : 'voltou para a entregar', cancelado: valor ? 'cancelado' : 'reativado' };
      var fim = !p.cancelado && p.pago && p.entregue && (campo === 'pago' || campo === 'entregue') && valor;
      avisar(fim ? 'Pedido nº ' + numero + ' concluído. Ele foi para Concluídos.' : 'Pedido nº ' + numero + ' ' + rotulos[campo] + '.');
      recarregarDepois();
    }).catch(function (e) {
      if (e && e.silencioso) return;
      p[campo] = antes;
      renderFiltros();
      renderTickets();
      avisar('Não foi possível salvar o pedido nº ' + numero + '. Tente de novo.');
    });
  }

  function focarTicket(numero, campo) {
    var t = document.querySelector('.ticket[data-numero="' + numero + '"]');
    if (!t) return;
    var alvo = campo === 'cancelado' ? t.querySelector('.ticket__cancelar') : t.querySelector('.alternar[data-campo="' + campo + '"]');
    if (!alvo) alvo = t.querySelector('.alternar, .ticket__cancelar');
    if (alvo) alvo.focus({ preventScroll: true });
  }

  /* ---------- produtos e preços ---------- */
  var edicao = {}; // id -> { preco: centavos | NaN, disponivel: bool }
  function centavosDe(texto) {
    var s = String(texto || '').replace(/[R$\s]/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) : NaN;
  }
  function precoTexto(c) { return (c / 100).toFixed(2).replace('.', ','); }
  function original(id) {
    var lista = (estado.dados && estado.dados.catalogo) || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }
  function mudancasProdutos() {
    var lista = [];
    Object.keys(edicao).forEach(function (id) {
      var o = original(id);
      var e = edicao[id];
      if (!o) return;
      var m = { id: id };
      var mudou = false;
      if (e.preco !== undefined && e.preco !== Math.round(o.preco * 100)) { m.preco = e.preco / 100; mudou = true; }
      if (e.disponivel !== undefined && e.disponivel !== o.disponivel) { m.disponivel = e.disponivel; mudou = true; }
      if (mudou) lista.push(m);
    });
    return lista;
  }
  function atualizarBarraProdutos() {
    var invalidos = Object.keys(edicao).some(function (id) { return edicao[id].preco !== undefined && isNaN(edicao[id].preco); });
    var n = mudancasProdutos().length;
    $('produtos-barra').hidden = !n && !invalidos;
    $('produtos-mudancas').textContent = invalidos ? 'Confira o preço marcado em vermelho' : plural(n, 'alteração', 'alterações');
    $('produtos-salvar').disabled = invalidos || !n;
  }
  function renderProdutos(forcar) {
    var caixa = $('produtos-lista');
    var cat = estado.dados && estado.dados.catalogo;
    if (!cat) {
      caixa.innerHTML = '<p class="cartao__vazio">Para mudar os preços por aqui, atualize o script da planilha (passo a passo no LEIAME). Enquanto isso, dá para mudar na aba Produtos da planilha.</p>';
      return;
    }
    // não apaga o que você está digitando quando os dados atualizam sozinhos
    if (!forcar && (mudancasProdutos().length || caixa.contains(document.activeElement))) return;
    var html = '';
    var atual = null;
    cat.forEach(function (p) {
      if (p.categoria !== atual) {
        if (atual !== null) html += '</ul>';
        atual = p.categoria;
        html += '<h3 class="cat-titulo">' + esc(atual) + '</h3><ul class="produtos">';
      }
      var e = edicao[p.id] || {};
      var preco = e.preco !== undefined ? (isNaN(e.preco) ? (e.texto || '') : precoTexto(e.preco)) : precoTexto(Math.round(p.preco * 100));
      var disp = e.disponivel !== undefined ? e.disponivel : p.disponivel;
      var mudou = (e.preco !== undefined && e.preco !== Math.round(p.preco * 100)) || (e.disponivel !== undefined && e.disponivel !== p.disponivel);
      html += '<li class="produto' + (mudou ? ' produto--mudou' : '') + (disp ? '' : ' produto--esgotado') + '" data-id="' + esc(p.id) + '">' +
        '<div class="produto__info"><p class="produto__nome">' + nomeHTML(p.nome) + '</p>' +
          '<p class="produto__estado">' + (disp ? 'À venda' : 'Esgotado') + '</p></div>' +
        '<label class="produto__preco' + (e.preco !== undefined && isNaN(e.preco) ? ' produto__preco--erro' : '') + '">' +
          '<span class="sr-only">Preço de ' + esc(p.nome) + '</span><span aria-hidden="true">R$</span>' +
          '<input type="text" inputmode="decimal" autocomplete="off" value="' + esc(preco) + '" data-campo="preco">' +
          (p.unidade === 'kg' ? '<span class="produto__un" aria-hidden="true">/kg</span>' : '') +
        '</label>' +
        '<button type="button" class="interruptor" role="switch" aria-checked="' + disp + '" data-campo="disponivel" aria-label="' + esc(p.nome) + ' à venda"><span></span></button>' +
        '</li>';
    });
    caixa.innerHTML = html + '</ul>';
    atualizarBarraProdutos();
  }
  function marcarLinha(li) {
    var id = li.getAttribute('data-id');
    var o = original(id);
    var e = edicao[id] || {};
    var mudou = o && ((e.preco !== undefined && e.preco !== Math.round(o.preco * 100)) || (e.disponivel !== undefined && e.disponivel !== o.disponivel));
    li.classList.toggle('produto--mudou', !!mudou);
    var disp = e.disponivel !== undefined ? e.disponivel : (o && o.disponivel);
    li.classList.toggle('produto--esgotado', !disp);
    li.querySelector('.produto__estado').textContent = disp ? 'À venda' : 'Esgotado';
  }
  function ligarProdutos() {
    var caixa = $('produtos-lista');
    caixa.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-campo') !== 'preco') return;
      var li = e.target.closest('.produto');
      var id = li.getAttribute('data-id');
      var c = centavosDe(e.target.value);
      edicao[id] = Object.assign(edicao[id] || {}, { preco: c, texto: e.target.value });
      li.querySelector('.produto__preco').classList.toggle('produto__preco--erro', isNaN(c));
      marcarLinha(li);
      atualizarBarraProdutos();
    });
    caixa.addEventListener('blur', function (e) {
      if (e.target.getAttribute('data-campo') !== 'preco') return;
      var id = e.target.closest('.produto').getAttribute('data-id');
      if (edicao[id] && !isNaN(edicao[id].preco)) e.target.value = precoTexto(edicao[id].preco);
    }, true);
    caixa.addEventListener('click', function (e) {
      var sw = e.target.closest('[data-campo="disponivel"]');
      if (!sw) return;
      var li = sw.closest('.produto');
      var id = li.getAttribute('data-id');
      var novo = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(novo));
      edicao[id] = Object.assign(edicao[id] || {}, { disponivel: novo });
      marcarLinha(li);
      atualizarBarraProdutos();
    });
    $('produtos-desfazer').addEventListener('click', function () {
      edicao = {};
      renderProdutos(true);
      atualizarBarraProdutos();
    });
    $('produtos-salvar').addEventListener('click', function () {
      var lista = mudancasProdutos();
      if (!lista.length) return;
      var botao = $('produtos-salvar');
      botao.disabled = true;
      botao.textContent = 'Salvando…';
      estado.mutacao++;
      chamarPainel({ acao: 'salvarProdutos', produtos: lista }).then(function (r) {
        if (!r || !r.ok) {
          if (r && r.codigo === 'acao') throw new Error('Atualize o script da planilha para salvar preços pelo painel (passo a passo no LEIAME).');
          throw new Error((r && r.erro) || 'Não foi possível salvar.');
        }
        estado.dados.catalogo = r.catalogo;
        edicao = {};
        renderProdutos(true);
        avisar(lista.length === 1 ? 'Alteração salva. O site já usa o valor novo.' : 'Alterações salvas. O site já usa os valores novos.');
      }).catch(function (err) {
        if (err && err.silencioso) return;
        avisar(err && err.message ? err.message : 'Não foi possível salvar. Tente de novo.', 6000);
      }).finally(function () {
        botao.textContent = 'Salvar';
        atualizarBarraProdutos();
      });
    });
  }

  /* ---------- impressão (térmica 80/58 mm ou A4) ---------- */
  var K_IMPRESSAO = 'dujoao.painel.impressao';
  function opcoesImpressao() {
    var papel = document.querySelector('input[name="papel"]:checked');
    return { papel: papel ? papel.value : '80', separar: $('imp-separar').checked, pessoas: $('imp-pessoas').checked };
  }
  function montarImpressao(op) {
    var d = estado.dados;
    var r = d.resumo;
    var ativos = d.pedidos.filter(function (p) { return !p.cancelado; })
      .sort(function (a, b) { return Number(a.numero) - Number(b.numero); });
    var agora = new Date();
    var dois = function (n) { return String(n).padStart(2, '0'); };
    var quando = dois(agora.getDate()) + '/' + dois(agora.getMonth() + 1) + '/' + agora.getFullYear() + ' ' + dois(agora.getHours()) + ':' + dois(agora.getMinutes());
    var h = '<div class="imp__cab"><p class="imp__marca">DuJOÃO</p><p>Pedido da rodada ' + d.rodada + '</p><p>' + quando + '</p></div>';
    if (op.separar) {
      h += '<h2 class="imp__titulo">Separar: ' + plural(r.itens, 'item', 'itens') + '</h2>';
      var cat = null;
      r.produtos.forEach(function (p) {
        if (p.categoria !== cat) { cat = p.categoria; h += '<p class="imp__cat">' + esc(cat) + '</p>'; }
        h += '<div class="imp__prod"><span class="imp__caixa"></span><span class="imp__qtd">' + p.qtd + '</span>' +
          '<span class="imp__nome">' + nomeHTML(p.nome) + (p.gramas ? ' (' + kgTexto(p.gramas) + (p.temPeso ? ' + pesar' : '') + ')' : (p.temPeso ? ' (pesar)' : '')) +
          '<small>' + esc(p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ')) + '</small></span></div>';
      });
    }
    if (op.pessoas) {
      h += '<h2 class="imp__titulo">Por pessoa: ' + plural(ativos.length, 'pedido', 'pedidos') + '</h2>';
      ativos.forEach(function (p) {
        var peso = p.itens.some(function (i) { return i.subtotal === null; });
        h += '<div class="imp__pedido"><p class="imp__pessoa">Nº ' + esc(p.numero) + ' · ' + esc(p.nome) + '</p>' +
          p.itens.map(function (i) {
            var kg = i.unidade === 'kg' || i.subtotal === null;
            return '<div class="imp__item"><span class="imp__caixa"></span><span><b>' + i.qtd + '</b> ' + nomeHTML(i.nome) +
              (kg && i.peso ? ' (' + kgTexto(gramasSalvas(i)) + ', ' + dinheiro(i.subtotal) + ')' : kg ? ' (pesar)' : '') + '</span></div>' +
              (kg && !i.peso ? '<div class="imp__peso"><span>Peso:</span><span class="imp__risco"></span><span>kg</span></div>' : '');
          }).join('') +
          '<div class="imp__total"><span>Total' + (p.pago ? ' (pago)' : '') + '</span><b>' + dinheiro(p.total) + (peso ? ' + peso' : '') + '</b></div>' +
          (p.obs ? '<p class="imp__obs">Obs.: ' + esc(p.obs) + '</p>' : '') + '</div>';
      });
    }
    h += '<div class="imp__fim"><span>' + plural(r.itens, 'item', 'itens') + '</span><b>' + dinheiro(r.total) + (r.temPeso ? ' + peso' : '') + '</b></div>';
    var el = $('impressao');
    el.className = 'impressao impressao--' + op.papel;
    el.innerHTML = h;
  }
  function ligarImpressao() {
    try {
      var salvo = JSON.parse(localStorage.getItem(K_IMPRESSAO) || 'null');
      if (salvo) {
        var r = document.querySelector('input[name="papel"][value="' + salvo.papel + '"]');
        if (r) r.checked = true;
        $('imp-separar').checked = salvo.separar !== false;
        $('imp-pessoas').checked = salvo.pessoas !== false;
      }
    } catch (e) { /* sem armazenamento */ }
    $('imprimir').addEventListener('click', function () {
      var op = opcoesImpressao();
      if (!op.separar && !op.pessoas) { avisar('Marque o que você quer imprimir.'); return; }
      if (!estado.dados || !estado.dados.pedidos.some(function (p) { return !p.cancelado; })) { avisar('Não há pedidos nesta rodada para imprimir.'); return; }
      try { localStorage.setItem(K_IMPRESSAO, JSON.stringify(op)); } catch (e) { /* sem armazenamento */ }
      montarImpressao(op);
      window.print();
    });
  }

  var ABAS = ['tickets', 'resumo', 'produtos'];
  function trocarAba(qual) {
    ABAS.forEach(function (a) {
      var ativa = a === qual;
      $('aba-' + a).setAttribute('aria-selected', String(ativa));
      $('aba-' + a).tabIndex = ativa ? 0 : -1;
      $('painel-' + a).hidden = !ativa;
    });
    if (qual === 'produtos') renderProdutos(true);
  }

  function ligarEventos() {
    $('form-entrada').addEventListener('submit', entrar);
    $('mostrar-senha').addEventListener('change', function (e) { $('senha').type = e.target.checked ? 'text' : 'password'; });
    $('atualizar').addEventListener('click', function () { carregar(false); });
    $('sair').addEventListener('click', function () {
      apagarToken();
      estado.token = '';
      estado.dados = null;
      estado.vistos = null;
      mostrarEntrada();
    });
    $('rodada').addEventListener('change', function (e) {
      var r = parseInt(e.target.value, 10);
      estado.rodadaFixa = estado.dados && r === estado.dados.rodadaAtual ? null : r;
      estado.vistos = null;
      estado.novos.clear();
      carregar(false);
    });
    ABAS.forEach(function (a, i) {
      $('aba-' + a).addEventListener('click', function () { trocarAba(a); });
      $('aba-' + a).addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          var outra = ABAS[(i + (e.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length];
          trocarAba(outra);
          $('aba-' + outra).focus();
          e.preventDefault();
        }
      });
    });
    ligarProdutos();
    ligarImpressao();
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filtro]');
      if (!b) return;
      estado.filtro = b.getAttribute('data-filtro');
      renderFiltros();
      renderTickets();
      var novo = document.querySelector('[data-filtro="' + estado.filtro + '"]');
      if (novo) novo.focus({ preventScroll: true });
    });
    var buscaTimer;
    $('busca').addEventListener('input', function (e) {
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(function () { estado.busca = e.target.value; renderTickets(); }, 120);
    });
    $('tickets').addEventListener('input', function (e) {
      if (e.target.getAttribute('data-campo') !== 'peso') return;
      var o = onde(e.target);
      var item = o && itemDo(acharPedido(o.numero), o.id);
      if (!item) return;
      var chave = chavePeso(o.numero, o.id);
      var ed = pesosEdicao[chave] || {};
      ed.texto = e.target.value;
      ed.gramas = gramasDe(e.target.value);
      ed.erro = false;
      if (ed.enviando === undefined && ed.gramas === gramasSalvas(item)) delete pesosEdicao[chave];
      else pesosEdicao[chave] = ed;
      atualizarPeso(o.numero, o.id);
    });
    $('tickets').addEventListener('change', function (e) {
      if (e.target.getAttribute('data-campo') !== 'peso') return;
      var o = onde(e.target);
      if (o) salvarPeso(o.numero, o.id);
    });
    $('tickets').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.getAttribute('data-campo') !== 'peso') return;
      e.preventDefault();
      var o = onde(e.target);
      if (o) salvarPeso(o.numero, o.id);
      e.target.blur();
    });
    $('tickets').addEventListener('focusout', function (e) {
      if (e.target.getAttribute('data-campo') !== 'peso') return;
      var o = onde(e.target);
      if (!o) return;
      var ed = pesosEdicao[chavePeso(o.numero, o.id)];
      if (ed && typeof ed.gramas === 'number' && !isNaN(ed.gramas)) { ed.texto = kgCampo(ed.gramas); e.target.value = ed.texto; }
      else if (!ed) { var it = itemDo(acharPedido(o.numero), o.id); e.target.value = it && it.peso ? kgCampo(gramasSalvas(it)) : ''; }
    });
    $('tickets').addEventListener('click', function (e) {
      var t = e.target.closest('.ticket');
      if (!t) return;
      var numero = t.getAttribute('data-numero');
      var bp = e.target.closest('.peso__salvar');
      if (bp) { var o = onde(bp); if (o) salvarPeso(o.numero, o.id); return; }
      var alt = e.target.closest('.alternar');
      if (alt) {
        marcar(numero, alt.getAttribute('data-campo'), alt.getAttribute('aria-pressed') !== 'true');
        return;
      }
      if (e.target.closest('.ticket__cancelar')) {
        var p = estado.dados.pedidos.filter(function (x) { return x.numero === numero; })[0];
        if (!p) return;
        if (p.cancelado) { marcar(numero, 'cancelado', false); return; }
        confirmar(nbsp('Cancelar o pedido nº ' + numero + '?'), 'O pedido de ' + p.nome + ' sai do resumo e dos totais. Dá para reativar depois.', 'Cancelar pedido').then(function (sim) {
          if (sim) marcar(numero, 'cancelado', true);
          else focarTicket(numero, 'cancelado');
        });
      }
    });
    $('copiar-produtos').addEventListener('click', function () {
      copiar(estado.dados.resumo.textoProdutos).then(function () { avisar('Resumo copiado. Cole no WhatsApp.'); }, function () { avisar('Não foi possível copiar.'); });
    });
    $('copiar-valores').addEventListener('click', function () {
      copiar(estado.dados.resumo.textoValores).then(function () { avisar('Valores copiados. Cole no WhatsApp.'); }, function () { avisar('Não foi possível copiar.'); });
    });
    $('aberto').addEventListener('click', function () {
      var novo = $('aberto').getAttribute('aria-checked') !== 'true';
      $('aberto').setAttribute('aria-checked', String(novo));
      estado.mutacao++;
      chamarPainel({ acao: 'loja', aberto: novo }).then(function (r) {
        if (!r || !r.ok) throw new Error('erro');
        estado.dados.aberto = r.aberto;
        renderTopo();
        avisar(r.aberto ? 'O site voltou a receber pedidos.' : 'O site parou de receber pedidos.');
      }).catch(function (e) {
        if (e && e.silencioso) return;
        $('aberto').setAttribute('aria-checked', String(!novo));
        avisar('Não foi possível salvar. Tente de novo.');
      });
    });
    $('form-aviso').addEventListener('submit', function (e) {
      e.preventDefault();
      var texto = $('aviso').value.trim();
      estado.mutacao++;
      chamarPainel({ acao: 'loja', aviso: texto }).then(function (r) {
        if (!r || !r.ok) throw new Error('erro');
        estado.dados.aviso = r.aviso;
        avisar(r.aviso ? 'Aviso salvo. Já aparece no site.' : 'Aviso removido do site.');
      }).catch(function (err) { if (!err || !err.silencioso) avisar('Não foi possível salvar o aviso.'); });
    });
    $('nova-rodada').addEventListener('click', function () {
      var atual = estado.dados.rodadaAtual;
      confirmar('Começar a rodada ' + (atual + 1) + '?', 'Os pedidos da rodada ' + atual + ' continuam salvos. A partir de agora, os pedidos do site entram na rodada ' + (atual + 1) + '.', 'Começar rodada ' + (atual + 1)).then(function (sim) {
        if (!sim) return;
        estado.mutacao++;
        chamarPainel({ acao: 'novaRodada' }).then(function (r) {
          if (!r || !r.ok) throw new Error('erro');
          estado.rodadaFixa = null;
          estado.rodadaAtualVista = r.rodada;
          estado.vistos = null;
          estado.novos.clear();
          avisar('Rodada ' + r.rodada + ' começou.');
          trocarAba('tickets');
          carregar(false);
        }).catch(function (e) { if (!e || !e.silencioso) avisar('Não foi possível começar a nova rodada.'); });
      });
    });

    setInterval(function () {
      if (document.visibilityState === 'visible' && !$('app').hidden && !$('dialogo').open) carregar(true);
    }, INTERVALO);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !$('app').hidden && Date.now() - estado.ultimaCarga > 30000) carregar(true);
    });
  }

  function iniciar() {
    ligarEventos();
    if (!CFG.urlPlanilha) { mostrarEntrada(); return; }
    estado.token = lerToken();
    if (estado.token) carregar(false); else mostrarEntrada();
  }

  iniciar();
})();
