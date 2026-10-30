/* Pedidos DuJOÃO — painel de tickets */
(function () {
  'use strict';

  var CFG = Object.assign({ urlPlanilha: '' }, window.CONFIG_DUJOAO || {});
  var K_SENHA = 'dujoao.painel.senha';
  var INTERVALO = 60000;
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  var estado = {
    senha: '',
    dados: null,
    rodada: null,
    filtro: 'todos',
    busca: '',
    vistos: null,
    vistosRodada: null,
    novos: new Set(),
    ultimaCarga: 0,
    carregando: false
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
  function telefone(d) {
    d = String(d || '').replace(/\D/g, '');
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }
  function numeroWhats(d) { d = String(d || '').replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d; }
  function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  function lerSenha() {
    try { return localStorage.getItem(K_SENHA) || sessionStorage.getItem(K_SENHA) || ''; } catch (e) { return ''; }
  }
  function gravarSenha(s, lembrar) {
    try { (lembrar ? localStorage : sessionStorage).setItem(K_SENHA, s); } catch (e) { /* sem armazenamento */ }
  }
  function apagarSenha() {
    try { localStorage.removeItem(K_SENHA); sessionStorage.removeItem(K_SENHA); } catch (e) { /* sem armazenamento */ }
  }

  var toastTimer;
  function avisar(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('toast--visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('toast--visivel'); }, 2800);
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
    if (msg) { erro.textContent = msg; erro.hidden = false; } else { erro.hidden = true; }
    if (!CFG.urlPlanilha) {
      $('entrada-texto').textContent = 'O painel funciona depois que a planilha estiver ligada ao site. Siga o passo a passo do arquivo LEIAME.md.';
      $('senha').disabled = true;
      $('entrar').disabled = true;
      return;
    }
    setTimeout(function () { $('senha').focus(); }, 30);
  }

  function entrar(e) {
    e.preventDefault();
    var senha = $('senha').value;
    if (!senha) { $('senha').focus(); return; }
    var botao = $('entrar');
    botao.disabled = true;
    botao.innerHTML = '<span class="girando" aria-hidden="true"></span>Entrando…';
    estado.senha = senha;
    carregar(false).then(function (ok) {
      if (ok) {
        gravarSenha(senha, $('lembrar').checked);
        $('senha').value = '';
      }
    }).finally(function () {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    });
  }

  /* ---------- carregar dados ---------- */
  function carregar(silencioso) {
    if (estado.carregando) return Promise.resolve(false);
    estado.carregando = true;
    $('atualizar').classList.add('icone-btn--girando');
    return chamar({ acao: 'painel', senha: estado.senha, rodada: estado.rodada }, 30000).then(function (r) {
      if (!r || !r.ok) {
        if (r && (r.codigo === 'senha' || r.codigo === 'senha-padrao')) {
          apagarSenha();
          mostrarEntrada(r.erro);
          return false;
        }
        throw new Error((r && r.erro) || 'Erro ao carregar.');
      }
      var numeros = r.pedidos.map(function (p) { return p.numero; });
      if (estado.vistos && estado.vistosRodada === r.rodada) {
        var novos = numeros.filter(function (n) { return !estado.vistos.has(n); });
        novos.forEach(function (n) { estado.novos.add(n); });
        if (novos.length) avisar(novos.length === 1 ? 'Chegou 1 pedido novo.' : 'Chegaram ' + novos.length + ' pedidos novos.');
      }
      estado.vistos = new Set(numeros);
      estado.vistosRodada = r.rodada;
      estado.dados = r;
      estado.rodada = r.rodada;
      estado.ultimaCarga = Date.now();
      mostrarApp();
      renderizar();
      var agora = new Date();
      $('atualizado').textContent = 'Atualizado às ' + String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
      return true;
    }).catch(function (e) {
      if (!$('app').hidden) avisar('Não foi possível atualizar. Confira a internet.');
      else mostrarEntrada(e && e.codigo === 'resposta'
        ? 'A planilha não respondeu como esperado. Confira se a implantação está como "Qualquer pessoa".'
        : 'Não foi possível conectar à planilha. Confira a internet e tente de novo.');
      return false;
    }).finally(function () {
      estado.carregando = false;
      $('atualizar').classList.remove('icone-btn--girando');
    });
  }

  function mostrarApp() {
    $('entrada').hidden = true;
    $('app').hidden = false;
  }

  /* ---------- renderização ---------- */
  var FILTROS = [
    { id: 'todos', nome: 'Todos', teste: function (p) { return !p.cancelado; } },
    { id: 'a-pagar', nome: 'A pagar', teste: function (p) { return !p.cancelado && !p.pago; } },
    { id: 'a-entregar', nome: 'A entregar', teste: function (p) { return !p.cancelado && !p.entregue; } },
    { id: 'concluidos', nome: 'Concluídos', teste: function (p) { return !p.cancelado && p.pago && p.entregue; } },
    { id: 'cancelados', nome: 'Cancelados', teste: function (p) { return p.cancelado; } }
  ];

  function renderizar() {
    renderTopo();
    renderFiltros();
    renderTickets();
    renderResumo();
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
    var ativos = d.pedidos.filter(function (p) { return !p.cancelado; }).length;
    $('n-tickets').textContent = ativos;
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
    var temPeso = p.itens.some(function (i) { return i.subtotal === null; });
    var itens = p.itens.map(function (i) {
      return '<li class="ticket__item"><span class="ticket__q">' + i.qtd + '</span><span class="ticket__produto">' + esc(i.nome) + '</span>' +
        '<span class="ticket__valor">' + (i.subtotal === null ? 'pelo peso' : dinheiro(i.subtotal)) + '</span></li>';
    }).join('');
    var contato = [];
    if (p.whatsapp) {
      var msg = encodeURIComponent('Oi, ' + primeiroNome(p.nome) + '! Sobre o seu pedido nº ' + p.numero + ' DuJOÃO:');
      contato.push('<a href="https://wa.me/' + numeroWhats(p.whatsapp) + '?text=' + msg + '" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-conversa"/></svg>' + esc(telefone(p.whatsapp)) + '</a>');
    }
    if (p.email) contato.push('<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>');
    var rotuloNum = 'pedido ' + esc(p.numero);
    var carimbo = p.cancelado
      ? '<span class="carimbo carimbo--cancelado" aria-hidden="true">Cancelado</span>'
      : concluido ? '<span class="carimbo carimbo--concluido" aria-hidden="true">Concluído</span>' : '';
    var situacao = p.cancelado ? 'Cancelado' : (p.pago ? 'Pago' : 'A pagar') + ', ' + (p.entregue ? 'entregue' : 'a entregar');

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
      '<ul class="ticket__itens">' + itens + '</ul>' +
      '<div class="ticket__total"><span>Total</span><strong>' + dinheiro(p.total) + (temPeso ? ' <small>+ peso</small>' : '') + '</strong></div>' +
      (p.obs ? '<p class="ticket__obs"><strong>Obs.:</strong> ' + esc(p.obs) + '</p>' : '') +
      (p.cancelado ? '' :
        '<div class="ticket__acoes">' +
          botaoAlternar(p, 'pago', 'Pago', rotuloNum) +
          botaoAlternar(p, 'entregue', 'Entregue', rotuloNum) +
        '</div>') +
      '<button type="button" class="ticket__cancelar" data-acao="cancelar">' + (p.cancelado ? 'Reativar pedido' : 'Cancelar pedido') + '<span class="sr-only"> ' + rotuloNum + '</span></button>' +
    '</article>';
  }

  function botaoAlternar(p, campo, nome, rotuloNum) {
    var ligado = !!p[campo];
    return '<button type="button" class="alternar" data-campo="' + campo + '" aria-pressed="' + ligado + '">' +
      '<span class="alternar__caixa" aria-hidden="true">' + (ligado ? '<svg><use href="#i-check"/></svg>' : '') + '</span>' +
      nome + '<span class="sr-only"> (' + rotuloNum + ')</span></button>';
  }

  function renderTickets() {
    var filtro = FILTROS.filter(function (f) { return f.id === estado.filtro; })[0] || FILTROS[0];
    var termo = normaliza(estado.busca.trim());
    var lista = estado.dados.pedidos
      .filter(filtro.teste)
      .filter(function (p) { return combinaBusca(p, termo); })
      .sort(function (a, b) { return Number(b.numero) - Number(a.numero); });
    $('tickets').innerHTML = lista.map(ticketHTML).join('');
    var vazio = $('tickets-vazio');
    if (lista.length) { vazio.hidden = true; return; }
    vazio.hidden = false;
    if (!estado.dados.pedidos.length) {
      vazio.innerHTML = '<strong>Nenhum pedido na rodada ' + estado.dados.rodada + ' ainda.</strong>Quando alguém confirmar um pedido no site, ele aparece aqui.';
    } else if (termo) {
      vazio.innerHTML = '<strong>Nada encontrado para "' + esc(estado.busca.trim()) + '".</strong>Confira o nome ou o número do pedido.';
    } else {
      vazio.innerHTML = '<strong>Nenhum ticket neste filtro.</strong>Escolha outro filtro acima.';
    }
  }

  function renderResumo() {
    var d = estado.dados;
    var r = d.resumo;
    var peso = r.temPeso ? ' <small>+ peso</small>' : '';
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
        html += '<li><span class="lp__nome">' + esc(p.nome) + (p.temPeso ? ' <small>(pelo peso)</small>' : '') + '</span>' +
          '<span class="lp__qtd">' + p.qtd + '</span>' +
          '<span class="lp__quem">' + esc(p.quem.map(function (q) { return q.qtd + ' ' + q.nome; }).join(', ')) + '</span></li>';
      });
      html += '</ul><div class="lista-prod__total"><span>Total</span><strong>' + plural(r.itens, 'item', 'itens') + ', ' + dinheiro(r.total) + '</strong></div>';
      $('lista-produtos').innerHTML = html;
    }
    $('copiar-produtos').disabled = !r.produtos.length;

    $('lista-pessoas').innerHTML = r.pessoas.length ? r.pessoas.map(function (p) {
      var st = p.situacao === 'pago' ? '<span class="st st--ok">Pago</span>' : p.situacao === 'parcial' ? '<span class="st st--pendente">Pago em parte</span>' : '<span class="st st--pendente">A pagar</span>';
      return '<li><span class="lpes__nome">' + esc(p.nome) + '</span>' + st + '<span class="lpes__valor">' + dinheiro(p.total) + (p.temPeso ? ' <small>+ peso</small>' : '') + '</span></li>';
    }).join('') : '<li class="cartao__vazio">Ninguém pediu ainda.</li>';
    $('copiar-valores').disabled = !r.pessoas.length;

    var interruptor = $('aberto');
    interruptor.setAttribute('aria-checked', d.aberto ? 'true' : 'false');
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
    var antes = p[campo];
    p[campo] = valor;
    estado.novos.delete(numero);
    renderFiltros();
    renderTickets();
    focarTicket(numero, campo);
    chamar({ acao: 'marcar', senha: estado.senha, numero: numero, campo: campo, valor: valor }, 30000).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.erro) || 'erro');
      var rotulos = { pago: valor ? 'marcado como pago' : 'voltou para a pagar', entregue: valor ? 'marcado como entregue' : 'voltou para a entregar', cancelado: valor ? 'cancelado' : 'reativado' };
      avisar('Pedido nº ' + numero + ' ' + rotulos[campo] + '.');
      recarregarDepois();
    }).catch(function () {
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
    if (alvo) alvo.focus({ preventScroll: true });
  }

  function trocarAba(qual) {
    var tickets = qual === 'tickets';
    $('aba-tickets').setAttribute('aria-selected', String(tickets));
    $('aba-resumo').setAttribute('aria-selected', String(!tickets));
    $('aba-tickets').tabIndex = tickets ? 0 : -1;
    $('aba-resumo').tabIndex = tickets ? -1 : 0;
    $('painel-tickets').hidden = !tickets;
    $('painel-resumo').hidden = tickets;
  }

  function ligarEventos() {
    $('form-entrada').addEventListener('submit', entrar);
    $('atualizar').addEventListener('click', function () { carregar(false); });
    $('sair').addEventListener('click', function () {
      apagarSenha();
      estado.senha = '';
      estado.dados = null;
      estado.vistos = null;
      mostrarEntrada();
    });
    $('rodada').addEventListener('change', function (e) {
      estado.rodada = parseInt(e.target.value, 10);
      estado.vistos = null;
      estado.novos.clear();
      carregar(false);
    });
    ['aba-tickets', 'aba-resumo'].forEach(function (id) {
      $(id).addEventListener('click', function () { trocarAba(id === 'aba-tickets' ? 'tickets' : 'resumo'); });
      $(id).addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          var outra = id === 'aba-tickets' ? 'resumo' : 'tickets';
          trocarAba(outra);
          $('aba-' + outra).focus();
          e.preventDefault();
        }
      });
    });
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filtro]');
      if (!b) return;
      estado.filtro = b.getAttribute('data-filtro');
      renderFiltros();
      renderTickets();
    });
    var buscaTimer;
    $('busca').addEventListener('input', function (e) {
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(function () { estado.busca = e.target.value; renderTickets(); }, 120);
    });
    $('tickets').addEventListener('click', function (e) {
      var t = e.target.closest('.ticket');
      if (!t) return;
      var numero = t.getAttribute('data-numero');
      var alt = e.target.closest('.alternar');
      if (alt) {
        marcar(numero, alt.getAttribute('data-campo'), alt.getAttribute('aria-pressed') !== 'true');
        return;
      }
      if (e.target.closest('.ticket__cancelar')) {
        var p = estado.dados.pedidos.filter(function (x) { return x.numero === numero; })[0];
        if (!p) return;
        if (p.cancelado) { marcar(numero, 'cancelado', false); return; }
        confirmar('Cancelar o pedido nº ' + numero + '?', 'O pedido de ' + p.nome + ' sai do resumo e dos totais. Dá para reativar depois.', 'Cancelar pedido').then(function (sim) {
          if (sim) marcar(numero, 'cancelado', true);
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
      chamar({ acao: 'loja', senha: estado.senha, aberto: novo }, 30000).then(function (r) {
        if (!r || !r.ok) throw new Error('erro');
        estado.dados.aberto = r.aberto;
        renderTopo();
        avisar(r.aberto ? 'O site voltou a receber pedidos.' : 'O site parou de receber pedidos.');
      }).catch(function () {
        $('aberto').setAttribute('aria-checked', String(!novo));
        avisar('Não foi possível salvar. Tente de novo.');
      });
    });
    $('form-aviso').addEventListener('submit', function (e) {
      e.preventDefault();
      var texto = $('aviso').value.trim();
      chamar({ acao: 'loja', senha: estado.senha, aviso: texto }, 30000).then(function (r) {
        if (!r || !r.ok) throw new Error('erro');
        estado.dados.aviso = r.aviso;
        avisar(r.aviso ? 'Aviso salvo. Já aparece no site.' : 'Aviso removido do site.');
      }).catch(function () { avisar('Não foi possível salvar o aviso.'); });
    });
    $('nova-rodada').addEventListener('click', function () {
      var atual = estado.dados.rodadaAtual;
      confirmar('Começar a rodada ' + (atual + 1) + '?', 'Os pedidos da rodada ' + atual + ' continuam salvos. A partir de agora, os pedidos do site entram na rodada ' + (atual + 1) + '.', 'Começar rodada ' + (atual + 1)).then(function (sim) {
        if (!sim) return;
        chamar({ acao: 'novaRodada', senha: estado.senha }, 30000).then(function (r) {
          if (!r || !r.ok) throw new Error('erro');
          estado.rodada = r.rodada;
          estado.vistos = null;
          estado.novos.clear();
          avisar('Rodada ' + r.rodada + ' começou.');
          trocarAba('tickets');
          carregar(false);
        }).catch(function () { avisar('Não foi possível começar a nova rodada.'); });
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
    estado.senha = lerSenha();
    if (estado.senha) carregar(false); else mostrarEntrada();
  }

  iniciar();
})();
