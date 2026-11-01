// Simulador local do Google Apps Script para testar Codigo.gs + site.
// Uso: node servidor.js [porta] [pastaDoSite]
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const url = require('url');

const PORTA = Number(process.argv[2] || 8790);
const SITE = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const GS = path.join(SITE, 'apps-script', 'Codigo.gs');
const OUTBOX = process.env.OUTBOX || path.join(require('os').tmpdir(), 'dujoao-emails-' + PORTA);
const SENHA = process.env.SENHA || 'senha-teste-123';
const ATRASO = Number(process.env.ATRASO || 250);

function criarAmbiente() {
  fs.mkdirSync(OUTBOX, { recursive: true });
  const emails = [];
  const props = {};
  const logs = [];
  const cache = new Map();

  const encadear = (alvo) => new Proxy(alvo, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return function () { return this; }; // formatação: sem efeito
    }
  });

  function converter(v) {
    if (typeof v === 'string') {
      if (v.startsWith("'")) return v.slice(1);
      if (v.startsWith('=')) return '#FORMULA!' + v; // detecta injeção de fórmula
      if (/^[+-]?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') return Number(v); // planilha converte "0007" em 7
      return v;
    }
    return v;
  }

  class Range {
    constructor(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; return encadear(this); }
    getSheet() { return this.sheet; }
    getRow() { return this.r; }
    getColumn() { return this.c; }
    _checar() {
      if (this.r < 1 || this.c < 1 || this.r + this.nr - 1 > this.sheet.maxRows) {
        throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      }
    }
    getLastColumn() { return this.c + this.nc - 1; }
    clearContent() { this._checar(); const v = []; for (let i = 0; i < this.nr; i++) v.push(new Array(this.nc).fill('')); return this.setValues(v); }
    clear() { return this.clearContent(); }
    getValues() {
      this._checar();
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) {
          const linha = this.sheet.dados[this.r - 1 + i] || [];
          const v = linha[this.c - 1 + j];
          row.push(v === undefined || v === null ? '' : v);
        }
        out.push(row);
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(vals) {
      this._checar();
      if (vals.length !== this.nr || vals.some((r) => r.length !== this.nc)) {
        throw new Error(`setValues: dimensões ${vals.length}x${vals[0] && vals[0].length} != ${this.nr}x${this.nc}`);
      }
      for (let i = 0; i < this.nr; i++) {
        const idx = this.r - 1 + i;
        while (this.sheet.dados.length <= idx) this.sheet.dados.push([]);
        for (let j = 0; j < this.nc; j++) this.sheet.dados[idx][this.c - 1 + j] = converter(vals[i][j]);
      }
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    insertCheckboxes() {
      const vals = [];
      for (let i = 0; i < this.nr; i++) vals.push(new Array(this.nc).fill(false));
      return this.setValues(vals);
    }
  }

  class Sheet {
    constructor(nome) { this.nome = nome; this.dados = []; this.maxRows = Number(process.env.MAX_LINHAS || 1000); return encadear(this); }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return Math.max(26, this.getLastColumn()); }
    insertRowsAfter(apos, n) { this.maxRows += n; return this; }
    getName() { return this.nome; }
    getLastRow() {
      for (let i = this.dados.length - 1; i >= 0; i--) {
        const l = this.dados[i] || [];
        if (l.some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
      }
      return 0;
    }
    getLastColumn() { return Math.max(0, ...this.dados.map((l) => (l || []).length)); }
    getRange(a, b, c, d) {
      if (typeof a === 'string') return new Range(this, 1, 1, 1, 1); // A1 só para formatação
      return new Range(this, a, b, c || 1, d || 1);
    }
    appendRow(vals) { const r = this.getLastRow() + 1; if (r > this.maxRows) this.maxRows = r; new Range(this, r, 1, 1, vals.length).setValues([vals]); return this; }
    clear() { this.dados = []; return this; }
  }

  const planilha = encadear({
    abas: [new Sheet('Página1')],
    getId() { return 'planilha-teste'; },
    getUrl() { return 'https://docs.google.com/spreadsheets/d/planilha-teste/edit'; },
    getSheetByName(n) { return this.abas.find((s) => s.getName() === n) || null; },
    insertSheet(n) { const s = new Sheet(n); this.abas.push(s); return s; },
    getSheets() { return this.abas.slice(); },
    deleteSheet(s) { this.abas = this.abas.filter((x) => x !== s); },
  });

  function formatDate(d, tz, fmt) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).map((x) => [x.type, x.value]));
    return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute);
  }

  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => { logs.push('ERRO ' + a.map(String).join(' ')); console.error('[gs]', ...a); } },
    SpreadsheetApp: encadear({
      getActiveSpreadsheet: () => planilha,
      openById: () => planilha,
      flush: () => {},
      getUi: () => { throw new Error('sem UI no teste'); },
    }),
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) },
    MailApp: {
      getRemainingDailyQuota: () => Math.max(0, Number(process.env.COTA || 100) - emails.length),
      sendEmail(o) {
        if (/falha/.test(o.to)) throw new Error('Endereço inválido: ' + o.to);
        const n = emails.length + 1;
        emails.push(o);
        fs.writeFileSync(path.join(OUTBOX, `email-${n}.html`), `<!-- para: ${o.to} | assunto: ${o.subject} | replyTo: ${o.replyTo} -->\n` + o.htmlBody);
        fs.writeFileSync(path.join(OUTBOX, `email-${n}.txt`), `Para: ${o.to}\nAssunto: ${o.subject}\nNome: ${o.name}\nResponder para: ${o.replyTo}\n\n${o.body}`);
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'vinicius.dono@example.com' }) },
    Utilities: {
      formatDate, sleep: () => {},
      getUuid: () => require('crypto').randomUUID(),
      computeDigest: (alg, txt) => Array.from(require('crypto').createHash('sha256').update(String(txt), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)), remove: (k) => cache.delete(k) }) },
    ContentService: { createTextOutput: (s) => ({ conteudo: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(ctx);
  let codigo = fs.readFileSync(GS, 'utf8');
  vm.runInContext(codigo, ctx, { filename: 'Codigo.gs' });
  ctx.configurar();
  props.SENHA_PAINEL = SENHA; // no Google: menu DuJOÃO > Definir senha do painel
  return { ctx, planilha, emails, props, logs };
}

let amb = criarAmbiente();

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

function responderJSON(res, saida) {
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(saida);
  }, ATRASO);
}

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname === '/exec') {
    amb.ctx.ABAS_ = {}; // no Google, cada chamada começa do zero
    if (req.method === 'GET') return responderJSON(res, amb.ctx.doGet({ parameter: u.query }).conteudo);
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => { amb.ctx.ABAS_ = {}; responderJSON(res, amb.ctx.doPost({ postData: { contents: corpo, type: req.headers['content-type'] } }).conteudo); });
    return;
  }
  if (u.pathname === '/__estado') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const abas = {};
    amb.planilha.getSheets().forEach((s) => (abas[s.getName()] = s.dados));
    return res.end(JSON.stringify({ abas, props: amb.props, emails: amb.emails.map((e) => ({ to: e.to, subject: e.subject, replyTo: e.replyTo, name: e.name })), logs: amb.logs }, null, 1));
  }
  if (u.pathname === '/__reset') { amb = criarAmbiente(); res.writeHead(200); return res.end('ok'); }
  if (u.pathname === '/__produto') { // edita a aba Produtos: /__produto?id=torresmo-180&disponivel=0&preco=30
    const aba = amb.planilha.getSheetByName('Produtos');
    const cab = aba.dados[0];
    const ci = (n) => cab.indexOf(n);
    const linha = aba.dados.find((l) => l && l[ci('ID')] === u.query.id);
    if (!linha) { res.writeHead(404); return res.end('produto não encontrado'); }
    if (u.query.disponivel !== undefined) linha[ci('Disponível')] = u.query.disponivel === '1';
    if (u.query.preco !== undefined) linha[ci('Preço (R$)')] = Number(u.query.preco);
    res.writeHead(200); return res.end(JSON.stringify(linha));
  }
  if (u.pathname === '/__editar') { // edita uma célula como se fosse à mão: /__editar?aba=Itens&numero=0002&id=joelho-porco&coluna=Peso (kg)&valor=1.25
    amb.ctx.ABAS_ = {};
    const aba = amb.planilha.getSheetByName(u.query.aba);
    const cab = aba.dados[0];
    const ci = cab.indexOf(u.query.coluna);
    const nc = cab.indexOf(u.query.aba === 'Itens' ? 'Nº pedido' : 'Nº');
    const li = aba.dados.findIndex((l, k) => k > 0 && l && String(l[nc]).padStart(4, '0') === u.query.numero && (!u.query.id || l[cab.indexOf('ID produto')] === u.query.id));
    if (ci < 0 || li < 0) { res.writeHead(404); return res.end('célula não encontrada'); }
    const v = u.query.valor === '' ? '' : (isNaN(Number(u.query.valor)) ? u.query.valor : Number(u.query.valor));
    aba.dados[li][ci] = v;
    if (u.query.semOnEdit !== '1') amb.ctx.onEdit({ range: aba.getRange(li + 1, ci + 1) });
    res.writeHead(200); return res.end('ok');
  }
  if (u.pathname === '/__email') { // mostra o e-mail n: /__email?n=1
    const arq = path.join(OUTBOX, `email-${Number(u.query.n) || 1}.html`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').replace(/https:\/\/vbonatto11\.github\.io\/pedidos-dujoao\//g, '/') : 'sem e-mail');
  }
  if (u.pathname === '/__exec') { // roda uma função do script: /__exec?f=atualizarResumo
    amb.ctx.ABAS_ = {};
    const r = amb.ctx[u.query.f]();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(r || null));
  }
  if (u.pathname === '/config.js') {
    let cfg = fs.readFileSync(path.join(SITE, 'config.js'), 'utf8');
    cfg = cfg.replace(/urlPlanilha:\s*'[^']*'/, `urlPlanilha: 'http://localhost:${PORTA}/exec'`);
    res.writeHead(200, { 'Content-Type': tipos['.js'], 'Cache-Control': 'no-store' });
    return res.end(cfg);
  }
  let arq = path.join(SITE, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!arq.startsWith(SITE) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
}).listen(PORTA, () => console.log(`simulador em http://localhost:${PORTA}/  (senha do painel: ${SENHA})`));
