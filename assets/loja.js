/* Pedidos DuJOÃO — página de pedidos */
(function () {
  'use strict';

  var CFG = Object.assign(
    { urlPlanilha: '', whatsapp: '', responsavel: '', pix: null, instagram: '' },
    window.CONFIG_DUJOAO || {}
  );
  var BASE = window.CATALOGO_DUJOAO || { categorias: [], produtos: [] };
  var MODO = CFG.urlPlanilha ? 'planilha' : 'whatsapp';

  var K_CARRINHO = 'dujoao.carrinho.v1';
  var K_DADOS = 'dujoao.dados.v1';
  var K_ENVIO = 'dujoao.envio.v2';
  var K_CATALOGO = 'dujoao.catalogo.v1';
  var K_ULTIMO = 'dujoao.ultimo.v1';
  var MAX_QTD = 99;
  var VALIDADE_ENVIO = 2 * 3600 * 1000;
  var RE_EMAIL = /^[^\s@"<>(),;:]+@[^\s@"<>(),;:.]+(\.[^\s@"<>(),;:.]+)+$/;
  var UNIDADES = { g: 'gramas', kg: 'quilo', un: 'unidades' };

  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var mqLargo = window.matchMedia('(min-width: 1000px)');
  var mqReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');

  var estado = {
    categorias: [],
    produtos: [],
    porId: new Map(),
    carrinho: {},
    pendentes: {},       // itens do carrinho salvo que ainda não estão no catálogo carregado
    aberto: true,
    aviso: '',
    enviando: false,
    idEnvio: null,
    envioIncerto: false, // a última tentativa pode ter chegado à planilha
    confirmado: null,
    remotoCarregado: false
  };

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function dinheiro(c) { return brl.format((c || 0) / 100); }
  function centavos(v) { return Math.round(Number(v) * 100); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  // "450 g" não quebra entre número e unidade; palavras com hífen não quebram no hífen
  function semQuebra(s) { return String(s || '').replace(/(\d)\s+(g|kg|un|unidades?)\b/gi, '$1\u00A0$2'); }
  function html(s) { return esc(semQuebra(s)).replace(/([^\s<>]+-[^\s<>]+)/g, '<span class="nw">$1</span>'); }
  function normaliza(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function slug(s) { return normaliza(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outros'; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  var armazenamento = {
    ler: function (k, padrao) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } },
    gravar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
    apagar: function (k) { try { localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }
  };
  function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

  var anuncio;
  function anunciar(msg) {
    if (!anuncio) return;
    anuncio.textContent = '';
    setTimeout(function () { anuncio.textContent = msg; }, 30);
  }
  var toastTimer;
  function avisar(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('toast--visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('toast--visivel'); }, ms || 2800);
  }

  /* ---------- catálogo ---------- */
  function extrasLocais() {
    var f = {};
    BASE.produtos.forEach(function (p) { f[p.id] = { foto: p.foto || '', selo: p.selo || '' }; });
    return f;
  }
  function normalizaProduto(p, catId, extra) {
    return {
      id: String(p.id),
      cat: catId,
      nome: semQuebra(p.nome),
      curto: p.curto ? semQuebra(p.curto) : '',
      detalhe: p.detalhe ? semQuebra(p.detalhe) : '',
      preco: centavos(p.preco),
      unidade: p.unidade === 'kg' ? 'kg' : 'un',
      disponivel: p.disponivel !== false,
      foto: (extra && extra.foto) || '',
      selo: (extra && extra.selo) || ''
    };
  }
  function catalogoLocal() {
    var extras = extrasLocais();
    return {
      categorias: BASE.categorias.map(function (c) { return Object.assign({}, c); }),
      produtos: BASE.produtos.map(function (p) { return normalizaProduto(p, p.cat, extras[p.id]); })
    };
  }

  /** Monta o catálogo a partir da resposta da planilha. Devolve false se a resposta não serve. */
  function catalogoDeRemoto(dados) {
    if (!dados || !Array.isArray(dados.produtos) || !dados.produtos.length) return null;
    var extras = extrasLocais();
    var cats = BASE.categorias.map(function (c) { return Object.assign({}, c); });
    var porNome = new Map(cats.map(function (c) { return [normaliza(c.nome), c]; }));
    var produtos = [];
    var vistos = new Set();
    dados.produtos.forEach(function (r) {
      if (!r || !r.id || !r.nome || vistos.has(String(r.id))) return;
      var preco = Number(r.preco);
      if (!isFinite(preco) || preco < 0) return;
      var nomeCat = String(r.categoria || 'Outros');
      var cat = porNome.get(normaliza(nomeCat));
      if (!cat) {
        cat = { id: 'cat-' + slug(nomeCat), nome: nomeCat };
        cats.push(cat);
        porNome.set(normaliza(nomeCat), cat);
      }
      vistos.add(String(r.id));
      produtos.push(normalizaProduto(r, cat.id, extras[r.id]));
    });
    return produtos.length ? { categorias: cats, produtos: produtos } : null;
  }

  function aplicarRemoto(dados, definitivo) {
    if (dados && typeof dados.aberto === 'boolean') estado.aberto = dados.aberto;
    if (dados && typeof dados.aviso === 'string') estado.aviso = dados.aviso;
    var cat = catalogoDeRemoto(dados);
    if (cat) definirCatalogo(cat.categorias, cat.produtos, definitivo);
    else atualizarEstadoLoja();
    return !!cat;
  }

  function definirCatalogo(categorias, produtos, definitivo) {
    estado.produtos = produtos;
    estado.porId = new Map(produtos.map(function (p) { return [p.id, p]; }));
    estado.categorias = categorias.filter(function (c) {
      return produtos.some(function (p) { return p.cat === c.id; });
    });

    // devolve ao carrinho itens salvos que só existiam na planilha
    Object.keys(estado.pendentes).forEach(function (id) {
      var p = estado.porId.get(id);
      if (p && p.disponivel) { estado.carrinho[id] = estado.pendentes[id]; delete estado.pendentes[id]; }
      else if (definitivo) delete estado.pendentes[id];
    });

    var removidos = [];
    Object.keys(estado.carrinho).forEach(function (id) {
      var p = estado.porId.get(id);
      if (p && p.disponivel) return;
      if (!p && !definitivo) { estado.pendentes[id] = estado.carrinho[id]; delete estado.carrinho[id]; return; }
      removidos.push(p ? (p.curto || p.nome) : 'Um produto');
      delete estado.carrinho[id];
    });
    salvarCarrinho();
    if (removidos.length) {
      avisar(removidos.length === 1
        ? removidos[0] + ' esgotou e saiu do seu pedido.'
        : removidos.join(', ') + ' esgotaram e saíram do seu pedido.', 6500);
    }
    renderizarCatalogo();
    atualizarResumo();
  }

  function seloDe(p) {
    var m = String(p.selo || '').match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|un)\b/i) ||
      String(p.nome || '').match(/(\d+(?:[.,]\d+)?)\s*(g|kg)\b/i);
    if (!m) return null;
    return { n: m[1], u: UNIDADES[m[2].toLowerCase()] || m[2] };
  }

  function conservacaoHTML(conservacao) {
    var icone = /resfri/i.test(conservacao) ? 'i-termometro' : 'i-neve';
    return '<span class="selo"><svg aria-hidden="true"><use href="#' + icone + '"/></svg>' + esc(conservacao) + '</span>';
  }

  function qtdHTML(p, mini) {
    var nome = esc(p.nome);
    return '<div class="qtd' + (mini ? ' qtd--mini' : '') + '" data-id="' + esc(p.id) + '" data-qtd="0" role="group" aria-label="Quantidade de ' + nome + '">' +
      '<button type="button" class="qtd__btn qtd__menos" data-acao="menos" aria-label="Diminuir ' + nome + '"><svg aria-hidden="true"><use href="#i-menos"/></svg></button>' +
      '<span class="qtd__valor" aria-hidden="true">0</span>' +
      '<button type="button" class="qtd__btn qtd__mais" data-acao="mais" aria-label="Adicionar ' + nome + '"><svg aria-hidden="true"><use href="#i-mais"/></svg></button>' +
      '</div>';
  }

  function itemHTML(p) {
    var foto;
    if (p.foto) {
      foto = '<div class="item__foto"><img src="' + esc(p.foto) + '" alt="" width="96" height="96" loading="lazy" decoding="async"></div>';
    } else {
      var s = seloDe(p);
      foto = s
        ? '<div class="item__foto item__foto--selo" aria-hidden="true"><b>' + esc(s.n) + '</b><span>' + esc(s.u) + '</span></div>'
        : '<div class="item__foto item__foto--emblema"><img src="assets/img/emblema.png" alt="" width="40" height="63" loading="lazy" decoding="async"></div>';
    }
    var preco = p.unidade === 'kg' ? dinheiro(p.preco) + ' <small>o kg</small>' : dinheiro(p.preco);
    var acao = p.disponivel ? qtdHTML(p, false) : '<span class="item__esgotado">Esgotado</span>';
    return '<li class="item' + (p.disponivel ? '' : ' item--indisponivel') + '" data-id="' + esc(p.id) + '">' +
      foto +
      '<div class="item__info">' +
        '<h3 class="item__nome">' + html(p.curto || p.nome) + '</h3>' +
        (p.detalhe ? '<p class="item__detalhe">' + html(p.detalhe) + '</p>' : '') +
        '<div class="item__base"><span class="item__preco">' + preco + '</span>' + acao + '</div>' +
      '</div></li>';
  }

  var ultimoHtml = '';
  function renderizarCatalogo() {
    var cardapio = $('cardapio');
    var htmlCat = '';
    var chipsHtml = '';
    estado.categorias.forEach(function (cat) {
      var itens = estado.produtos.filter(function (p) { return p.cat === cat.id; });
      if (!itens.length) return;
      var id = 'secao-' + cat.id;
      htmlCat += '<section class="secao" id="' + id + '" aria-labelledby="titulo-' + cat.id + '">' +
        '<div class="secao__cabeca"><div>' +
          '<h2 class="secao__titulo" id="titulo-' + cat.id + '">' + esc(cat.nome) + '</h2>' +
          (cat.nota ? '<p class="secao__nota">' + html(cat.nota) + '</p>' : '') +
        '</div>' + (cat.conservacao ? conservacaoHTML(cat.conservacao) : '') + '</div>' +
        '<ul class="itens">' + itens.map(itemHTML).join('') + '</ul></section>';
      chipsHtml += '<a class="chip" href="#' + id + '" data-alvo="' + id + '">' + esc(cat.nome) + '</a>';
    });

    if (htmlCat !== ultimoHtml) {
      // guarda o foco de quem está usando teclado para não perder a posição
      var ativo = document.activeElement;
      var foco = null;
      if (ativo && ativo.closest && ativo.closest('#cardapio')) {
        var g = ativo.closest('.qtd');
        if (g) foco = { id: g.getAttribute('data-id'), acao: ativo.getAttribute('data-acao') };
      }
      cardapio.innerHTML = htmlCat;
      $('chips').innerHTML = chipsHtml;
      ultimoHtml = htmlCat;
      observarSecoes();
      if (foco) focarControle(foco.id, foco.acao);
    }
    estado.produtos.forEach(function (p) { atualizarItem(p.id); });
    atualizarEstadoLoja();
  }

  function focarControle(id, acao) {
    var g = document.querySelector('#cardapio .qtd[data-id="' + cssEsc(id) + '"]');
    if (!g) return;
    var b = g.querySelector('[data-acao="' + acao + '"]');
    if (!b || g.getAttribute('data-qtd') === '0') b = g.querySelector('.qtd__mais');
    if (b) b.focus({ preventScroll: true });
  }

  /* ---------- carrinho ---------- */
  function salvarCarrinho() {
    var tudo = Object.assign({}, estado.pendentes, estado.carrinho);
    armazenamento.gravar(K_CARRINHO, tudo);
  }
  function salvarEnvio() {
    if (estado.idEnvio) armazenamento.gravar(K_ENVIO, { id: estado.idEnvio, t: Date.now(), incerto: estado.envioIncerto });
    else armazenamento.apagar(K_ENVIO);
  }

  function alterar(id, delta, origem) {
    var p = estado.porId.get(id);
    if (!p || !p.disponivel || (!estado.aberto && delta > 0)) return;
    var atual = estado.carrinho[id] || 0;
    var novo = Math.max(0, Math.min(MAX_QTD, atual + delta));
    if (novo === atual) return;
    var naComanda = !!(origem && origem.closest && origem.closest('#comanda'));
    if (novo) estado.carrinho[id] = novo; else delete estado.carrinho[id];
    // depois de uma falha incerta, o mesmo envio continua valendo (evita pedido duplicado)
    if (!estado.envioIncerto) { estado.idEnvio = null; salvarEnvio(); }
    if (estado.confirmado) voltarAoPedido();
    salvarCarrinho();
    atualizarItem(id);
    atualizarResumo();
    anunciar((p.curto || p.nome) + ': ' + (novo ? plural(novo, 'unidade', 'unidades') + ' no pedido' : 'removido do pedido'));
    if (!novo) {
      if (naComanda) { var titulo = $('comanda-titulo'); if (titulo) titulo.focus({ preventScroll: true }); }
      else if (origem) focarControle(id, 'mais');
    }
  }

  function atualizarItem(id) {
    var qtd = estado.carrinho[id] || 0;
    var nome = (estado.porId.get(id) || {}).nome || '';
    document.querySelectorAll('.qtd[data-id="' + cssEsc(id) + '"]').forEach(function (g) {
      g.setAttribute('data-qtd', String(qtd));
      var v = g.querySelector('.qtd__valor');
      if (v) v.textContent = qtd;
      var mais = g.querySelector('.qtd__mais');
      if (mais) mais.disabled = qtd >= MAX_QTD || !estado.aberto;
      g.setAttribute('aria-label', 'Quantidade de ' + nome + ': ' + qtd);
    });
    var li = document.querySelector('.item[data-id="' + cssEsc(id) + '"]');
    if (li) li.classList.toggle('item--no-pedido', qtd > 0);
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  function linhasCarrinho() {
    var ordem = new Map(estado.produtos.map(function (p, i) { return [p.id, i]; }));
    return Object.keys(estado.carrinho).map(function (id) {
      var p = estado.porId.get(id);
      if (!p) return null;
      var qtd = estado.carrinho[id];
      return { p: p, qtd: qtd, sub: p.unidade === 'kg' ? null : p.preco * qtd };
    }).filter(Boolean).sort(function (a, b) { return ordem.get(a.p.id) - ordem.get(b.p.id); });
  }
  function totais(linhas) {
    var t = { itens: 0, total: 0, temPeso: false, qtdPeso: 0 };
    linhas.forEach(function (l) {
      t.itens += l.qtd;
      if (l.sub === null) { t.temPeso = true; t.qtdPeso += l.qtd; } else t.total += l.sub;
    });
    return t;
  }

  function unitTexto(l) {
    return l.p.unidade === 'kg' ? dinheiro(l.p.preco) + ' o kg' : '× ' + dinheiro(l.p.preco);
  }
  function linhaHTML(l) {
    var sub = l.sub === null ? '<p class="linha__sub linha__sub--peso">pelo peso</p>' : '<p class="linha__sub">' + dinheiro(l.sub) + '</p>';
    return '<p class="linha__nome">' + html(l.p.nome) + '</p>' + qtdHTML(l.p, true) + '<p class="linha__unit">' + unitTexto(l) + '</p>' + sub;
  }

  function atualizarBarra() {
    var c = estado.confirmado;
    var linhas = linhasCarrinho();
    var t = totais(linhas);
    var barra = $('barra');
    var mostrar = c ? !comandaAberta : linhas.length > 0;
    if (c) {
      $('barra-qtd').textContent = 'Pedido confirmado';
      $('barra-total').textContent = 'Nº ' + c.numero;
      $('barra-acao').textContent = 'Ver resumo e PIX';
    } else {
      $('barra-qtd').textContent = plural(t.itens, 'item', 'itens') + (t.qtdPeso ? ' (' + t.qtdPeso + ' pelo peso)' : '');
      $('barra-total').textContent = t.total || !t.temPeso ? dinheiro(t.total) : 'Valor pelo peso';
      $('barra-acao').textContent = 'Revisar pedido';
    }
    barra.classList.toggle('barra--visivel', mostrar);
    $('abrir').tabIndex = mostrar ? 0 : -1;
    barra.setAttribute('aria-hidden', mostrar ? 'false' : 'true');
  }

  function atualizarResumo() {
    var linhas = linhasCarrinho();
    var t = totais(linhas);
    var tem = linhas.length > 0;

    // linhas da comanda, atualizadas no lugar para não perder o foco
    var lista = $('linhas');
    var existentes = new Map();
    lista.querySelectorAll(':scope > .linha').forEach(function (li) { existentes.set(li.getAttribute('data-id'), li); });
    var ref = lista.firstElementChild;
    linhas.forEach(function (l) {
      var li = existentes.get(l.p.id);
      if (li) {
        existentes.delete(l.p.id);
        li.querySelector('.linha__unit').textContent = unitTexto(l);
        li.querySelector('.linha__sub').textContent = l.sub === null ? 'pelo peso' : dinheiro(l.sub);
        if (li !== ref) lista.insertBefore(li, ref); else ref = ref.nextElementSibling;
      } else {
        li = document.createElement('li');
        li.className = 'linha';
        li.setAttribute('data-id', l.p.id);
        li.innerHTML = linhaHTML(l);
        lista.insertBefore(li, ref);
      }
    });
    existentes.forEach(function (li) { li.remove(); });
    linhas.forEach(function (l) { atualizarItem(l.p.id); });

    $('vazio').hidden = tem;
    $('vazio-texto').textContent = estado.aberto
      ? 'Use o + ao lado dos produtos para montar o pedido.'
      : 'Os pedidos estão fechados agora. Seu carrinho fica guardado neste aparelho.';
    $('total').hidden = !tem;
    $('form').hidden = !tem || !estado.aberto;
    $('total-valor').textContent = t.total || !t.temPeso ? dinheiro(t.total) : 'Pelo peso';
    $('total-extra').hidden = !t.temPeso || (!t.total && t.temPeso);
    atualizarBarra();
    atualizarRepetir();
  }

  /* ---------- repetir o último pedido ---------- */
  function ultimoPedido() {
    var u = armazenamento.ler(K_ULTIMO, null);
    return u && Array.isArray(u.itens) && u.itens.length ? u : null;
  }
  function atualizarRepetir() {
    var box = $('repetir');
    if (!box) return;
    var u = ultimoPedido();
    if (!u || linhasCarrinho().length || estado.confirmado || !estado.aberto) { box.hidden = true; return; }
    var nomes = u.itens.filter(function (i) {
      var p = estado.porId.get(i.id);
      return p && p.disponivel;
    }).map(function (i) { return i.qtd + ' ' + estado.porId.get(i.id).nome; });
    if (!nomes.length) { box.hidden = true; return; }
    $('repetir-titulo').textContent = 'Seu último pedido' + (u.numero ? ' (nº\u00A0' + u.numero + ')' : '');
    $('repetir-texto').textContent = nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ' e mais ' + (nomes.length - 3) : '');
    box.hidden = false;
  }
  function repetirPedido() {
    var u = ultimoPedido();
    if (!u || !estado.aberto) return;
    var fora = [];
    u.itens.forEach(function (i) {
      var p = estado.porId.get(i.id);
      if (p && p.disponivel) estado.carrinho[i.id] = Math.min(MAX_QTD, (estado.carrinho[i.id] || 0) + (Number(i.qtd) || 1));
      else fora.push(p ? p.nome : 'Um produto');
    });
    if (!estado.envioIncerto) { estado.idEnvio = null; salvarEnvio(); }
    salvarCarrinho();
    estado.produtos.forEach(function (p) { atualizarItem(p.id); });
    atualizarResumo();
    if (fora.length) avisar(fora.join(', ') + (fora.length === 1 ? ' esgotou e ficou de fora.' : ' esgotaram e ficaram de fora.'), 6000);
    abrirComanda();
  }

  /* ---------- loja aberta/fechada e avisos ---------- */
  function atualizarEstadoLoja() {
    var aviso = $('aviso');
    if (!estado.aberto) {
      aviso.innerHTML = '<strong>Os pedidos estão fechados no momento.</strong>' + (estado.aviso ? ' ' + esc(estado.aviso) : ' Volte mais tarde.');
      aviso.className = 'topo__aviso topo__aviso--fechado';
      aviso.hidden = false;
    } else if (estado.aviso) {
      aviso.textContent = estado.aviso;
      aviso.className = 'topo__aviso';
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }
    var textoFita = estado.aberto ? 'Faça seu pedido' : 'Pedidos fechados';
    var fita = $('fita-texto');
    if (fita && fita.textContent !== textoFita) fita.textContent = textoFita;
    var tituloSr = $('titulo-pagina');
    if (tituloSr) tituloSr.textContent = textoFita;

    document.querySelectorAll('.qtd__mais').forEach(function (b) {
      var g = b.closest('.qtd');
      var qtd = Number(g && g.getAttribute('data-qtd')) || 0;
      b.disabled = !estado.aberto || qtd >= MAX_QTD;
    });
    var tem = linhasCarrinho().length > 0;
    $('form').hidden = !tem || !estado.aberto;
    $('vazio-texto').textContent = estado.aberto
      ? 'Use o + ao lado dos produtos para montar o pedido.'
      : 'Os pedidos estão fechados agora. Seu carrinho fica guardado neste aparelho.';
    if (!estado.enviando) botaoEnviando(false);
    atualizarRepetir();
  }

  /* ---------- seções e chips ---------- */
  var observador;
  var visiveis = new Map();
  var travaChip = 0;
  function observarSecoes() {
    if (observador) observador.disconnect();
    visiveis.clear();
    if (!('IntersectionObserver' in window)) return;
    observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { visiveis.set(e.target.id, e.isIntersecting); });
      if (Date.now() < travaChip) return;
      var secoes = document.querySelectorAll('.secao');
      if (!secoes.length) return;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        marcarChip(secoes[secoes.length - 1].id);
        return;
      }
      for (var i = 0; i < secoes.length; i++) {
        if (visiveis.get(secoes[i].id)) { marcarChip(secoes[i].id); return; }
      }
    }, { rootMargin: '-74px 0px -55% 0px' });
    document.querySelectorAll('.secao').forEach(function (s) { observador.observe(s); });
  }
  function marcarChip(id) {
    var trilho = $('chips');
    trilho.querySelectorAll('.chip').forEach(function (c) {
      var ativo = c.getAttribute('data-alvo') === id;
      if (ativo) {
        c.setAttribute('aria-current', 'true');
        var alvo = Math.max(0, c.offsetLeft - 16);
        if (Math.abs(trilho.scrollLeft - alvo) > 4 && trilho.scrollWidth > trilho.clientWidth) {
          trilho.scrollTo({ left: alvo, behavior: mqReduzido.matches ? 'auto' : 'smooth' });
        }
      } else {
        c.removeAttribute('aria-current');
      }
    });
  }

  /* ---------- comanda (folha no celular) ---------- */
  var comandaAberta = false;
  function definirInerte(v) {
    ['.topo', '.categorias', '#cardapio', '.rodape', '#barra', '.pular'].forEach(function (s) {
      var n = document.querySelector(s);
      if (n) n.inert = v;
    });
  }
  function abrirComanda() {
    if (mqLargo.matches) {
      if (!$('form').hidden) irParaDados();
      return;
    }
    if (comandaAberta) return;
    comandaAberta = true;
    var c = $('comanda');
    c.setAttribute('role', 'dialog');
    c.setAttribute('aria-modal', 'true');
    c.classList.add('comanda--aberta');
    var fundo = $('fundo');
    fundo.hidden = false;
    requestAnimationFrame(function () { fundo.classList.add('fundo--visivel'); });
    definirInerte(true);
    document.documentElement.style.overflow = 'hidden';
    $('abrir').setAttribute('aria-expanded', 'true');
    atualizarBarra();
    setTimeout(function () {
      var alvo = estado.confirmado ? $('sucesso-titulo') : $('comanda-titulo');
      if (alvo) alvo.focus({ preventScroll: true });
    }, 60);
  }
  function fecharComanda(devolverFoco) {
    if (!comandaAberta) return;
    comandaAberta = false;
    var c = $('comanda');
    c.classList.remove('comanda--aberta');
    c.removeAttribute('role');
    c.removeAttribute('aria-modal');
    var fundo = $('fundo');
    fundo.classList.remove('fundo--visivel');
    setTimeout(function () { if (!comandaAberta) fundo.hidden = true; }, 320);
    definirInerte(false);
    document.documentElement.style.overflow = '';
    $('abrir').setAttribute('aria-expanded', 'false');
    atualizarBarra();
    if (devolverFoco !== false) {
      if ($('barra').classList.contains('barra--visivel')) $('abrir').focus({ preventScroll: true });
      else $('cardapio').focus({ preventScroll: true });
    }
  }
  function aoMudarLargura() {
    if (mqLargo.matches && comandaAberta) fecharComanda(false);
  }
  function irParaDados() {
    var form = $('form');
    if (form.hidden) return;
    form.scrollIntoView({ block: 'start', behavior: mqReduzido.matches ? 'auto' : 'smooth' });
    $('nome').focus({ preventScroll: true });
  }

  /* ---------- formulário ---------- */
  function lerDados() {
    return {
      nome: $('nome').value.trim().replace(/\s+/g, ' '),
      email: $('email').value.trim(),
      whatsapp: $('whatsapp').value.trim(),
      obs: $('obs').value.trim()
    };
  }
  function marcarErro(campo, msg) {
    var bloco = $('campo-' + campo);
    var erro = $('erro-' + campo);
    var input = $(campo);
    if (erro) erro.textContent = msg || '';
    if (bloco) bloco.classList.toggle('campo--erro', !!msg);
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function validar(d) {
    var erroNome = d.nome.length < 2 ? 'Informe seu nome.' : '';
    var erroEmail = '';
    if (MODO === 'planilha' || d.email) {
      if (!d.email) erroEmail = 'Informe seu e-mail para receber a confirmação.';
      else if (!RE_EMAIL.test(d.email) || /\.\./.test(d.email)) erroEmail = 'Confira o e-mail. Exemplo: nome@gmail.com';
    }
    marcarErro('nome', erroNome);
    marcarErro('email', erroEmail);
    if (erroNome) return $('nome');
    if (erroEmail) return $('email');
    return null;
  }
  function mostrarAlerta(conteudo, tipo) {
    var a = $('alerta');
    a.innerHTML = conteudo;
    a.className = 'alerta' + (tipo === 'ok' ? ' alerta--ok' : '');
    a.hidden = false;
  }
  function esconderAlerta() { $('alerta').hidden = true; $('alerta').innerHTML = ''; }
  function botaoEnviando(sim) {
    var b = $('confirmar');
    var rotulo = !estado.aberto ? 'Pedidos fechados' : (MODO === 'planilha' ? 'Confirmar pedido' : 'Enviar pedido pelo WhatsApp');
    b.disabled = sim || !estado.aberto;
    b.innerHTML = sim ? '<span class="girando" aria-hidden="true"></span>Enviando pedido…' : esc(rotulo);
    b.setAttribute('aria-busy', sim ? 'true' : 'false');
  }

  /* ---------- comunicação com a planilha ---------- */
  function erroCom(codigo, msg, dados) { var e = new Error(msg || codigo); e.codigo = codigo; e.dados = dados || null; return e; }
  function chamar(metodo, corpo, limite) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, limite) : null;
    var url = CFG.urlPlanilha;
    var opcoes;
    if (metodo === 'GET') {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'acao=catalogo&t=' + Date.now();
      opcoes = { method: 'GET', cache: 'no-store' };
    } else {
      opcoes = { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'text/plain;charset=utf-8' } };
    }
    if (ctrl) opcoes.signal = ctrl.signal;
    return fetch(url, opcoes).then(function (r) {
      return r.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { throw erroCom('resposta'); }
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw erroCom('tempo');
      if (e && e.codigo) throw e;
      throw erroCom('rede');
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function carregarCatalogoRemoto() {
    if (MODO !== 'planilha') return Promise.resolve();
    return chamar('GET', null, 15000).then(function (r) {
      if (!r || !r.ok) return;
      estado.remotoCarregado = true;
      if (aplicarRemoto(r, true)) guardarCatalogo(r);
    }).catch(function () { /* fica com o catálogo que já está na tela */ });
  }
  function guardarCatalogo(r) {
    armazenamento.gravar(K_CATALOGO, { t: Date.now(), produtos: r.produtos, aberto: r.aberto, aviso: r.aviso || '' });
  }

  var INCERTOS = { rede: 1, tempo: 1, resposta: 1, interno: 1 };
  function mensagemErro(e) {
    switch (e && e.codigo) {
      case 'tempo': return 'O envio demorou demais. Confira sua internet e toque em <strong>Confirmar pedido</strong> de novo. Se o pedido já tiver entrado, ele não será duplicado.';
      case 'rede': return 'Não foi possível conectar. Confira sua internet e toque em <strong>Confirmar pedido</strong> de novo. Se o pedido já tiver entrado, ele não será duplicado.';
      case 'validacao':
      case 'fechado':
      case 'indisponivel':
      case 'preco':
      case 'limite':
      case 'configuracao':
        return esc(e.message);
      default:
        return 'Não foi possível registrar o pedido agora. Tente de novo em instantes.';
    }
  }

  function enviar(evento) {
    if (evento) evento.preventDefault();
    if (estado.enviando) return;
    var linhas = linhasCarrinho();
    if (!linhas.length) return;
    var d = lerDados();
    var invalido = validar(d);
    if (invalido) { invalido.focus(); return; }
    if (!estado.aberto) { mostrarAlerta('Os pedidos estão fechados no momento.'); return; }
    esconderAlerta();
    armazenamento.gravar(K_DADOS, { nome: d.nome, email: d.email, whatsapp: d.whatsapp });
    var t = totais(linhas);

    if (MODO === 'whatsapp') {
      var link = linkWhatsApp(textoPedido({ nome: d.nome, itens: linhas.map(linhaParaTexto), total: t.total, temPeso: t.temPeso, obs: d.obs }));
      var janela = null;
      try { janela = window.open(link, '_blank'); } catch (e) { janela = null; }
      if (janela) {
        try { janela.opener = null; } catch (e) { /* ignorar */ }
        mostrarAlerta('Abrimos o WhatsApp com o seu pedido. Toque em enviar na conversa para concluir.', 'ok');
      } else {
        window.location.href = link;
      }
      return;
    }

    if (!estado.idEnvio) estado.idEnvio = novoId();
    salvarEnvio();
    estado.enviando = true;
    botaoEnviando(true);
    var enviados = linhas.map(function (l) { return { id: l.p.id, qtd: l.qtd, preco: l.p.preco }; });
    var corpo = {
      acao: 'pedido',
      idEnvio: estado.idEnvio,
      nome: d.nome,
      email: d.email,
      whatsapp: d.whatsapp,
      obs: d.obs,
      itens: enviados
    };
    chamar('POST', corpo, 40000).then(function (r) {
      if (!r || !r.ok) throw erroCom((r && r.codigo) || 'interno', (r && r.erro) || '', r);
      concluir(r, d, enviados);
    }).catch(function (e) {
      if (INCERTOS[e.codigo]) { estado.envioIncerto = true; salvarEnvio(); }
      var conteudo = mensagemErro(e);
      if (e.dados && (e.codigo === 'preco' || e.codigo === 'indisponivel' || e.codigo === 'fechado')) {
        if (aplicarRemoto(e.dados, true)) guardarCatalogo(e.dados);
      }
      if (INCERTOS[e.codigo] || e.codigo === 'configuracao') {
        var tt = totais(linhasCarrinho());
        var texto = textoPedido({ nome: d.nome, itens: linhasCarrinho().map(linhaParaTexto), total: tt.total, temPeso: tt.temPeso, obs: d.obs });
        conteudo += '<br><a href="' + esc(linkWhatsApp(texto)) + '" target="_blank" rel="noopener">Se continuar sem funcionar, envie o pedido pelo WhatsApp</a>';
      }
      if (!$('form').hidden) {
        mostrarAlerta(conteudo);
        $('alerta').scrollIntoView({ block: 'nearest', behavior: mqReduzido.matches ? 'auto' : 'smooth' });
      } else {
        avisar(e.message || 'Não foi possível registrar o pedido.', 6500);
      }
    }).finally(function () {
      estado.enviando = false;
      botaoEnviando(false);
      atualizarEstadoLoja();
    });
  }

  function linhaParaTexto(l) {
    return { nome: l.p.nome, qtd: l.qtd, preco: l.p.preco, subtotal: l.sub, unidade: l.p.unidade };
  }
  function textoPedido(ped) {
    var resp = CFG.responsavel ? ', ' + CFG.responsavel : '';
    var l = [];
    l.push(ped.numero ? 'Oi' + resp + '! Fiz o pedido nº ' + ped.numero + ' no site DuJOÃO:' : 'Oi' + resp + '! Quero fazer este pedido DuJOÃO:');
    l.push('');
    if (!ped.numero) l.push('*Nome:* ' + ped.nome);
    ped.itens.forEach(function (i) {
      l.push('• ' + i.qtd + 'x ' + i.nome + (i.subtotal == null ? ' (pelo peso)' : ': ' + dinheiro(i.subtotal)));
    });
    l.push('');
    l.push('*Total: ' + dinheiro(ped.total) + '*' + (ped.temPeso ? ' + itens pelo peso' : ''));
    if (ped.obs) l.push('Obs.: ' + ped.obs);
    return l.join('\n');
  }
  function linkWhatsApp(texto) {
    var numero = String(CFG.whatsapp || '').replace(/\D/g, '');
    return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);
  }

  /* ---------- confirmação ---------- */
  var fitaN = 0;
  function fitaSVG(texto) {
    var n = ++fitaN;
    var tam = texto.length > 16 ? 34 : 38;
    return '<svg viewBox="0 0 600 160" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="fo' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc552"/><stop offset=".55" stop-color="#f8a828"/><stop offset="1" stop-color="#df8d13"/></linearGradient>' +
      '<path id="fc' + n + '" d="M60,75 Q300,141 540,75"/></defs>' +
      '<path d="M84,52 L8,52 L34,82 L8,112 L84,112 Z" fill="#b66f0b"/>' +
      '<path d="M516,52 L592,52 L566,82 L592,112 L516,112 Z" fill="#b66f0b"/>' +
      '<path d="M60,90 L84,112 L84,96 Z" fill="#7a4704"/><path d="M540,90 L516,112 L516,96 Z" fill="#7a4704"/>' +
      '<path d="M60,34 Q300,100 540,34 L540,90 Q300,156 60,90 Z" fill="url(#fo' + n + ')"/>' +
      '<path d="M66,41 Q300,107 534,41" fill="none" stroke="#fff3cc" stroke-opacity=".6" stroke-width="1.4"/>' +
      '<path d="M66,83 Q300,149 534,83" fill="none" stroke="#8f5305" stroke-opacity=".45" stroke-width="1.4"/>' +
      '<text font-size="' + tam + '" fill="#4a0d0c"><textPath href="#fc' + n + '" startOffset="50%" text-anchor="middle">' + esc(texto) + '</textPath></text></svg>';
  }

  function chavePixCopiavel(pix) {
    var digitos = String(pix.chave || '').replace(/\D/g, '');
    if (/celular|telefone/i.test(pix.tipo || '') && (digitos.length === 10 || digitos.length === 11)) return '+55' + digitos;
    return String(pix.chave || '').trim();
  }

  function mesmosItens(a, b) {
    var m = {};
    a.forEach(function (i) { m[i.id] = (m[i.id] || 0) + i.qtd; });
    b.forEach(function (i) { m[i.id] = (m[i.id] || 0) - i.qtd; });
    return Object.keys(m).every(function (k) { return m[k] === 0; });
  }

  function concluir(r, d, enviados) {
    var itens = Array.isArray(r.itens) ? r.itens : [];
    var diferente = r.repetido && !mesmosItens(itens, enviados);
    estado.confirmado = {
      numero: String(r.numero || ''),
      nome: d.nome,
      email: r.email || d.email,
      emailEnviado: r.emailEnviado === true ? true : (r.emailEnviado === false ? false : null),
      itens: itens.map(function (i) {
        return { nome: i.nome, qtd: i.qtd, preco: i.preco, subtotal: i.subtotal == null ? null : i.subtotal, unidade: i.unidade };
      }),
      total: Number(r.total) || 0,
      temPeso: !!r.temPeso,
      obs: d.obs,
      nota: diferente ? 'Este pedido já tinha sido registrado antes da sua última alteração. Para acrescentar produtos, faça outro pedido.' : ''
    };
    armazenamento.gravar(K_ULTIMO, {
      numero: String(r.numero || ''),
      t: Date.now(),
      itens: itens.filter(function (i) { return i.id; }).map(function (i) { return { id: i.id, qtd: i.qtd }; })
    });
    estado.carrinho = {};
    salvarCarrinho();
    estado.idEnvio = null;
    estado.envioIncerto = false;
    salvarEnvio();
    $('obs').value = '';
    estado.produtos.forEach(function (p) { atualizarItem(p.id); });
    atualizarResumo();
    mostrarSucesso();
  }

  function mostrarSucesso() {
    var c = estado.confirmado;
    if (!c) return;
    var pix = CFG.pix && CFG.pix.chave ? CFG.pix : null;
    var linhas = c.itens.map(function (i) {
      var unit = i.unidade === 'kg'
        ? plural(i.qtd, 'peça', 'peças') + ', ' + dinheiro(i.preco) + ' o kg'
        : i.qtd + ' × ' + dinheiro(i.preco);
      return '<li class="linha linha--fixa"><p class="linha__nome">' + html(i.nome) + '</p>' +
        (i.subtotal == null ? '<p class="linha__sub linha__sub--peso">pelo peso</p>' : '<p class="linha__sub">' + dinheiro(i.subtotal) + '</p>') +
        '<p class="linha__unit">' + unit + '</p></li>';
    }).join('');
    var email = esc(c.email).replace(/@/g, '@<wbr>').replace(/\./g, '<wbr>.');
    var nome = esc(primeiroNome(c.nome));
    var msg;
    var dicaSpam = '<span class="sucesso__dica">Não chegou? Confira a caixa de spam ou lixo eletrônico.</span>';
    if (c.emailEnviado === true) msg = 'Obrigado, ' + nome + '! Enviamos a confirmação para:<strong class="sucesso__email">' + email + '</strong>' + dicaSpam;
    else if (c.emailEnviado === false) msg = 'Obrigado, ' + nome + '! Seu pedido foi registrado, mas o e-mail de confirmação não saiu. Guarde este resumo.';
    else msg = 'Obrigado, ' + nome + '! Seu pedido está registrado. A confirmação vai para:<strong class="sucesso__email">' + email + '</strong>' + dicaSpam;
    var nomeResp = CFG.responsavel || '';
    var rotuloWhats = CFG.whatsapp ? 'Avisar ' + (nomeResp ? 'o ' + nomeResp + ' ' : '') + 'no WhatsApp' : 'Compartilhar no WhatsApp';
    var s = $('etapa-sucesso');
    s.innerHTML =
      '<h3 class="sr-only" id="sucesso-titulo" tabindex="-1">Pedido confirmado, número ' + esc(c.numero) + '</h3>' +
      '<div class="carimbo-entrada"><div class="fita">' + fitaSVG('Pedido confirmado') + '</div>' +
      '<p class="sucesso__numero"><small>Pedido nº</small>' + esc(c.numero) + '</p></div>' +
      '<p class="sucesso__msg">' + msg + '</p>' +
      (c.nota ? '<p class="alerta">' + esc(c.nota) + '</p>' : '') +
      '<ul class="linhas">' + linhas + '</ul>' +
      '<div class="total"><span>Total</span><div><strong>' + (c.total || !c.temPeso ? dinheiro(c.total) : 'Pelo peso') + '</strong>' +
        (c.temPeso && c.total ? '<p class="total__extra">+ itens cobrados pelo peso</p>' : '') + '</div></div>' +
      (pix ? '<div class="pix"><p class="pix__titulo">Pagamento por PIX</p>' +
        '<p class="pix__chave">' + esc(pix.chave) + '</p>' +
        '<p class="pix__nome">' + (pix.tipo ? 'Chave ' + esc(pix.tipo) + ', em nome de ' : 'Em nome de ') + esc(pix.nome || '') + '</p>' +
        (pix.quando ? '<p class="pix__quando">' + esc(pix.quando) + '</p>' : '') +
        '<button type="button" class="btn btn--contorno" id="copiar-pix"><svg aria-hidden="true"><use href="#i-copiar"/></svg>Copiar chave PIX</button></div>' : '') +
      '<div class="sucesso__acoes">' +
        '<a class="btn btn--contorno" id="avisar-whats" target="_blank" rel="noopener" href="' + esc(linkWhatsApp(textoPedido(c))) + '"><svg aria-hidden="true"><use href="#i-conversa"/></svg>' + esc(rotuloWhats) + '</a>' +
        '<button type="button" class="btn btn--texto" id="novo-pedido">Fazer outro pedido</button>' +
      '</div>';
    $('etapa-pedido').hidden = true;
    s.hidden = false;
    $('fechar').setAttribute('aria-label', 'Fechar');
    $('comanda-rolagem').scrollTop = 0;
    if (!mqLargo.matches && !comandaAberta) abrirComanda();
    setTimeout(function () { var t = $('sucesso-titulo'); if (t) t.focus({ preventScroll: true }); }, 80);
    atualizarBarra();
  }

  function voltarAoPedido() {
    estado.confirmado = null;
    $('etapa-sucesso').hidden = true;
    $('etapa-sucesso').innerHTML = '';
    $('etapa-pedido').hidden = false;
    $('fechar').setAttribute('aria-label', 'Fechar e continuar escolhendo');
    esconderAlerta();
    atualizarBarra();
    atualizarRepetir();
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

  /* ---------- eventos ---------- */
  function ligarEventos() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.qtd__btn');
      if (btn) {
        var g = btn.closest('.qtd');
        alterar(g.getAttribute('data-id'), btn.getAttribute('data-acao') === 'mais' ? 1 : -1, btn);
        return;
      }
      if (e.target.closest('#copiar-pix')) {
        copiar(chavePixCopiavel(CFG.pix)).then(function () { avisar('Chave PIX copiada.'); }, function () { avisar('Não foi possível copiar. Anote a chave: ' + CFG.pix.chave, 6000); });
        return;
      }
      if (e.target.closest('#ir-dados')) { irParaDados(); return; }
      if (e.target.closest('#repetir-btn')) { repetirPedido(); return; }
      if (e.target.closest('#novo-pedido')) {
        voltarAoPedido();
        fecharComanda(false);
        window.scrollTo({ top: $('cardapio').offsetTop - 70, behavior: mqReduzido.matches ? 'auto' : 'smooth' });
        $('cardapio').focus({ preventScroll: true });
      }
    });
    $('chips').addEventListener('click', function (e) {
      var c = e.target.closest('.chip');
      if (!c) return;
      marcarChip(c.getAttribute('data-alvo'));
      travaChip = Date.now() + 1200;
    });
    $('abrir').addEventListener('click', abrirComanda);
    $('fechar').addEventListener('click', function () { fecharComanda(); });
    $('fundo').addEventListener('click', function () { fecharComanda(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && comandaAberta) fecharComanda();
    });
    $('form').addEventListener('submit', enviar);
    ['nome', 'email'].forEach(function (campo) {
      $(campo).addEventListener('input', function () {
        if ($('campo-' + campo).classList.contains('campo--erro')) marcarErro(campo, '');
      });
    });
    if (mqLargo.addEventListener) mqLargo.addEventListener('change', aoMudarLargura);
    else if (mqLargo.addListener) mqLargo.addListener(aoMudarLargura);
  }

  function restaurar() {
    var salvo = armazenamento.ler(K_CARRINHO, {});
    if (salvo && typeof salvo === 'object') {
      Object.keys(salvo).forEach(function (id) {
        var q = Math.floor(Number(salvo[id]));
        if (q > 0) estado.carrinho[id] = Math.min(q, MAX_QTD);
      });
    }
    var dados = armazenamento.ler(K_DADOS, null);
    if (dados) {
      if (dados.nome) $('nome').value = dados.nome;
      if (dados.email) $('email').value = dados.email;
      if (dados.whatsapp) $('whatsapp').value = dados.whatsapp;
    }
    var envio = armazenamento.ler(K_ENVIO, null);
    if (envio && envio.id && Date.now() - (envio.t || 0) < VALIDADE_ENVIO && Object.keys(estado.carrinho).length) {
      estado.idEnvio = envio.id;
      estado.envioIncerto = !!envio.incerto;
    } else {
      armazenamento.apagar(K_ENVIO);
    }
  }

  function rodape() {
    if (CFG.responsavel) $('rodape-responsavel').textContent = 'Pedidos organizados por ' + CFG.responsavel + '.';
    var w = $('rodape-whatsapp');
    var numero = String(CFG.whatsapp || '').replace(/\D/g, '');
    if (numero) { w.href = 'https://wa.me/' + numero; w.textContent = 'Falar com ' + (CFG.responsavel || 'a gente') + ' no WhatsApp'; }
    else w.parentNode.hidden = true;
    if (MODO === 'whatsapp') {
      $('ajuda-email').textContent = 'Opcional. O pedido vai pelo WhatsApp.';
      $('email').required = false;
    }
  }

  function iniciar() {
    anuncio = document.createElement('div');
    anuncio.className = 'sr-only';
    anuncio.setAttribute('aria-live', 'polite');
    document.body.appendChild(anuncio);

    restaurar();
    rodape();
    ligarEventos();

    // primeiro mostra a última versão da planilha guardada neste aparelho (sem preços "pulando")
    var guardado = MODO === 'planilha' ? armazenamento.ler(K_CATALOGO, null) : null;
    var usouGuardado = guardado && Date.now() - (guardado.t || 0) < 30 * 24 * 3600 * 1000 && aplicarRemoto(guardado, false);
    if (!usouGuardado) {
      var local = catalogoLocal();
      definirCatalogo(local.categorias, local.produtos, MODO !== 'planilha');
    }
    carregarCatalogoRemoto();
  }

  iniciar();
})();
