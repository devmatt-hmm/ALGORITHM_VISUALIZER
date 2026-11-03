(function () {
  'use strict';
  const AV = window.AV;
  const vscode = AV.vscode;
  const T = window.Trees;
  const root = document.getElementById('trView');
  const q = (id) => document.getElementById('tr_' + id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DELAYS = [900, 700, 520, 380, 270, 180, 120, 70, 40, 18];
  const KINDS = ['bst', 'avl', 'minheap', 'maxheap'];
  const INFO = {
    bst: 'Every node\'s left subtree holds smaller values and its right subtree larger ones, so searching halves the candidates at each step, as long as the tree stays balanced. Insert sorted numbers and it degrades into a chain (height = n).',
    avl: 'A BST that repairs itself: after each insert it checks every node on the way back up. If the balance (height(left) − height(right)) becomes 2 or −2 it rotates, so the height stays about log₂ n. The numbers beside the nodes are the balance factors.',
    minheap: 'A complete binary tree stored in an array (children of i are 2i+1 and 2i+2) where every parent is ≤ its children, so the smallest value is always at the root. Insert sifts up, extract sifts down: both O(log n).',
    maxheap: 'A complete binary tree stored in an array (children of i are 2i+1 and 2i+2) where every parent is ≥ its children, so the largest value is always at the root. Insert sifts up, extract sifts down: both O(log n).',
  };
  const D = { kind: 'bst', op: 'insert', per: {}, frames: [], idx: 0, timer: null, speed: 5, lang: 'cpp', user: null, showArrays: true, built: false };
  KINDS.forEach((k) => { D.per[k] = { state: T.emptyState(k), undo: [], hist: [] }; });

  // ------------------------------------------------------------------ shell
  function shell() {
    root.innerHTML = `
      <div class="toolbar">
        <span id="tr_demoTools" class="toolbar" style="margin:0">
          <label>Structure <select id="tr_kind">${KINDS.map((k) => `<option value="${k}">${esc(T.STRUCTS[k].name)}</option>`).join('')}</select></label>
          <label>Operation <select id="tr_op"></select></label>
          <label id="tr_valW">Value <input id="tr_val" type="text" size="5" aria-label="Value" placeholder="random"></label>
          <button id="tr_run" class="primary">Run</button>
          <button id="tr_rand" title="Fill with a few random values">Random fill</button>
          <button id="tr_undo">Undo</button><button id="tr_reset">Reset</button>
        </span>
        <span id="tr_userTools" hidden class="toolbar" style="margin:0">
          <button id="tr_goto">Go to code</button><button id="tr_rerun">Re-run</button><button id="tr_leave">Back to demos</button>
          <label><input type="checkbox" id="tr_showArr" checked> Show lists</label>
        </span>
        <span class="err" id="tr_err" role="alert"></span>
      </div>
      <div id="tr_banners"></div>
      <div class="grid">
        <div><section class="card">
          <div id="tr_out" class="outbar"></div>
          <div id="tr_fig" class="fig"></div>
          <div class="nulls" id="tr_nulls"></div>
          <div class="controls">
            <button id="tr_first" aria-label="First step" title="First step">⏮</button>
            <button id="tr_prev" aria-label="Previous step" title="Previous (←)">◀</button>
            <button id="tr_play" class="primary" aria-label="Play" title="Play / pause (space)">▶ Play</button>
            <button id="tr_next" aria-label="Next step" title="Next (→)">▶</button>
            <button id="tr_last" aria-label="Last step" title="Last step">⏭</button>
            <input id="tr_scrub" type="range" min="0" max="0" value="0" aria-label="Step">
            <label>Speed <input id="tr_speed" class="speed" type="range" min="1" max="10" value="${D.speed}" aria-label="Speed"></label>
          </div>
          <div class="msg" id="tr_msg" aria-live="polite"></div>
          <div class="stats" id="tr_stats"></div>
        </section></div>
        <div>
          <section class="card"><div class="lang" id="tr_langBar"></div><pre class="code" id="tr_code"></pre></section>
          <section class="card about" id="tr_about"></section>
        </div>
      </div>`;
    q('kind').onchange = (e) => { stop(); D.kind = e.target.value; D.op = T.STRUCTS[D.kind].order[0]; setup(); };
    q('op').onchange = (e) => { D.op = e.target.value; q('err').textContent = ''; syncInputs(); renderCode(); renderAbout(); };
    q('run').onclick = runOp;
    q('val').onkeydown = (e) => { if (e.key === 'Enter') runOp(); };
    q('rand').onclick = randomFill; q('undo').onclick = undo;
    q('reset').onclick = () => { stop(); D.per[D.kind] = { state: T.emptyState(D.kind), undo: [], hist: [] }; showState('Reset: the structure is empty again.'); };
    q('first').onclick = () => { stop(); go(0); };
    q('prev').onclick = () => { stop(); go(D.idx - 1); };
    q('next').onclick = () => { stop(); go(D.idx + 1); };
    q('last').onclick = () => { stop(); go(D.frames.length - 1); };
    q('play').onclick = () => (D.timer ? stop() : play());
    q('scrub').oninput = (e) => { stop(); go(Number(e.target.value)); };
    q('speed').oninput = (e) => { D.speed = Number(e.target.value); if (D.timer) { stop(); play(); } };
    q('goto').onclick = () => vscode.postMessage({ type: 'reveal', view: 'tr', line: 0 });
    q('rerun').onclick = () => vscode.postMessage({ type: 'tr-rerun' });
    q('leave').onclick = () => { stop(); D.user = null; setup(); };
    q('showArr').onchange = (e) => { D.showArrays = e.target.checked; render(); };
    D.built = true;
  }

  function setup() {
    if (!D.built) shell();
    clearBanners();
    q('kind').value = D.kind;
    q('demoTools').hidden = !!D.user; q('userTools').hidden = !D.user;
    if (D.user) { userFrames(); return; }
    const S = T.STRUCTS[D.kind];
    q('op').innerHTML = S.order.map((id) => `<option value="${id}">${esc(S.ops[id].name)}</option>`).join('');
    if (!S.ops[D.op]) D.op = S.order[0];
    q('op').value = D.op; syncInputs(); showState(null);
  }
  function syncInputs() { q('valW').hidden = !T.STRUCTS[D.kind].ops[D.op].args.includes('value'); }

  // ------------------------------------------------------------- operations
  function showState(msg) {
    D.frames = [T.stateFrame(D.kind, D.per[D.kind].state)];
    if (msg) D.frames[0].msg = msg;
    D.idx = 0; q('scrub').max = '0'; render(); renderCode(); renderAbout();
  }
  function runOp() {
    stop();
    const S = T.STRUCTS[D.kind], op = S.ops[D.op], P = D.per[D.kind], args = {};
    const err = (m) => { q('err').textContent = m; };
    if (op.args.includes('value')) {
      const t = q('val').value.trim();
      if (t === '') { args.value = 1 + Math.floor(Math.random() * 99); q('val').value = String(args.value); }
      else if (!/^-?\d+$/.test(t)) { err('The value must be a whole number (or leave it empty for a random one).'); return; }
      else args.value = parseInt(t, 10);
    }
    const r = T.runOp(D.kind, D.op, P.state, args);
    if (r.error) { err(r.error); return; }
    err('');
    P.undo.push({ state: P.state, hist: P.hist.slice() });
    P.state = r.state;
    P.hist.push(op.name + (args.value !== undefined ? ' ' + args.value : ''));
    D.frames = r.frames; D.idx = 0; q('scrub').max = String(D.frames.length - 1);
    render(); renderCode(); renderAbout();
    if (D.frames.length > 1) { go(1); play(); }
  }
  function randomFill() {
    stop(); q('err').textContent = '';
    const P = D.per[D.kind]; P.undo.push({ state: P.state, hist: P.hist.slice() });
    let st = T.emptyState(D.kind); const n = D.kind.includes('heap') ? 7 : 8, used = new Set();
    for (let i = 0; i < n; i++) { let v; do { v = 1 + Math.floor(Math.random() * 99); } while (used.has(v)); used.add(v); st = T.runOp(D.kind, 'insert', st, { value: v }).state; }
    P.state = st; P.hist = ['Random fill']; showState(`Filled with ${n} random values.`);
  }
  function undo() {
    stop(); const P = D.per[D.kind];
    if (!P.undo.length) { q('err').textContent = 'Nothing to undo.'; return; }
    q('err').textContent = ''; const u = P.undo.pop(); P.state = u.state; P.hist = u.hist; showState('Undone.');
  }

  // --------------------------------------------------------------- user mode
  function userFrames() {
    const tr = D.user.trace;
    D.frames = tr.frames.map((f) => {
      const ids = new Set(f.nodes.map((n) => n.id)), child = new Set();
      f.nodes.forEach((n) => { if (n.l !== null) child.add(n.l); if (n.r !== null) child.add(n.r); });
      const roots = f.nodes.filter((n) => !child.has(n.id)).map((n) => n.id);
      return { kind: 'tree', nodes: f.nodes, roots, root: roots[0] === undefined ? null : roots[0], ptrs: f.ptrs, hl: {}, float: [], fade: [], bf: null, extra: null, arrays: f.arrays, ln: f.ln, user: true,
        msg: f.ln ? `After line ${f.ln}${f.fn && f.fn !== 'main' ? ` in ${f.fn}()` : ''}.` : (f.fn && f.fn !== 'main' ? `Entering ${f.fn}().` : 'The state before the first highlighted line.'), error: false, _ids: ids };
    });
    if (!D.frames.length) D.frames = [{ kind: 'tree', nodes: [], roots: [], root: null, ptrs: {}, hl: {}, float: [], fade: [], bf: null, extra: null, arrays: [], msg: 'Nothing to show.', user: true }];
    clearBanners(); (tr.notes || []).forEach((n) => banner('warn', n));
    D.idx = 0; q('scrub').max = String(D.frames.length - 1);
    render(); renderCode(); renderAbout();
  }

  // ----------------------------------------------------------------- drawing
  const RAD = 19, SX = 48, SY = 66, X0 = 34, STAGE = 30, Y0 = 98;
  const ptrCls = (name) => { const n = name.split('.').pop().replace(/\u2191+$/, ''); return /^(root|head)$/.test(n) ? 'ph' : /^(cur|current|curr|node|n|p|temp|tmp)$/.test(n) ? 'pc' : /^(parent|succ|s|prev)$/.test(n) ? 'pp' : 'po'; };

  function drawTree(f, wrapExtra) {
    const floats = new Set(f.float || []), fades = new Set(f.fade || []);
    const live = f.nodes.filter((n) => !floats.has(n.id));
    const roots = f.roots || (f.root === null || f.root === undefined ? [] : [f.root]);
    const lay = T.layoutBinary(live, roots);
    const p = [];
    const X = (id) => X0 + lay.pos[id].x * SX, Y = (id) => Y0 + lay.pos[id].y * SY;
    live.forEach((n) => [n.l, n.r].forEach((c) => {
      if (c === null || c === undefined || !lay.pos[c] || !lay.pos[n.id]) return;
      p.push(`<line class="ed ${fades.has(n.id) || fades.has(c) ? 'fade' : ''}" x1="${X(n.id)}" y1="${Y(n.id)}" x2="${X(c)}" y2="${Y(c)}"/>`);
    }));
    const labels = new Map(), nulls = [];
    Object.keys(f.ptrs || {}).forEach((k) => { const id = f.ptrs[k]; if (id === null) nulls.push(k); else { if (!labels.has(id)) labels.set(id, []); labels.get(id).push(k); } });
    const hl = f.hl || {}, has = (k, id) => hl[k] && hl[k].includes(id);
    const node = (n, x, y, staged) => {
      const vis = hl.visited ? hl.visited.indexOf(n.id) : -1;
      const cls = ['tnode', staged ? 'float' : '', fades.has(n.id) ? 'fade' : '', has('cmp', n.id) ? 'cmp' : '', has('found', n.id) ? 'found' : '', has('del', n.id) ? 'del' : '', has('rot', n.id) ? 'rot' : '', vis >= 0 ? 'vis' : ''].join(' ');
      let s = `<g class="${cls}"><circle cx="${x}" cy="${y}" r="${RAD}"/><text x="${x}" y="${y + 5}" text-anchor="middle">${esc(n.v)}</text>`;
      if (vis >= 0) s += `<circle class="badge" cx="${x + RAD - 2}" cy="${y - RAD + 2}" r="9"/><text class="bt" x="${x + RAD - 2}" y="${y - RAD + 6}" text-anchor="middle">${vis + 1}</text>`;
      if (f.bf && f.bf[n.id] !== undefined && !staged) { const b = f.bf[n.id]; s += `<text class="bf ${Math.abs(b) > 1 ? 'bad' : ''}" x="${x + RAD + 3}" y="${y - RAD + 8}">${b > 0 ? '+' + b : b}</text>`; }
      return s + '</g>';
    };
    live.forEach((n) => { if (lay.pos[n.id]) p.push(node(n, X(n.id), Y(n.id), false)); });
    f.nodes.filter((n) => floats.has(n.id)).forEach((n) => { p.push(node(n, X0, STAGE, true)); p.push(`<text class="pl po" x="${X0 + RAD + 10}" y="${STAGE + 4}">new node (not attached yet)</text>`); });
    live.forEach((n) => {
      if (!lay.pos[n.id]) return;
      const labs = (labels.get(n.id) || []).slice();
      if (!f.user && f.root === n.id) labs.unshift('root');
      labs.forEach((lab, i) => p.push(`<text class="pl ${ptrCls(lab)}" x="${X(n.id)}" y="${Y(n.id) + RAD + 15 + i * 14}" text-anchor="middle">▲ ${esc(lab)}</text>`));
    });
    f.nodes.filter((n) => floats.has(n.id)).forEach((n) => { (labels.get(n.id) || []).forEach((lab, i) => p.push(`<text class="pl ${ptrCls(lab)}" x="${X0}" y="${STAGE + RAD + 14 + i * 14}" text-anchor="middle">▲ ${esc(lab)}</text>`)); });
    if (!live.length && !floats.size) p.push(`<text class="empty" x="${X0}" y="${Y0}">(empty tree)</text>`);
    let W = Math.max(380, X0 * 2 + lay.width * SX), H = Y0 + lay.height * SY + 40;
    const arrays = f.arrays && D.showArrays ? f.arrays : [];
    arrays.forEach((a, i) => {
      const ay = H + i * 46;
      p.push(`<text class="al" x="${X0 - 14}" y="${ay + 20}">${esc(a.name)}</text>`);
      const ax = X0 + 90;
      if (!a.items.length) p.push(`<text class="empty" x="${ax}" y="${ay + 20}">(empty)</text>`);
      a.items.forEach((it, k) => p.push(`<g class="cellg"><rect x="${ax + k * 44}" y="${ay}" width="44" height="28"/><text x="${ax + k * 44 + 22}" y="${ay + 19}" text-anchor="middle">${esc(it)}</text></g>`));
      W = Math.max(W, ax + a.items.length * 44 + 20);
    });
    H += arrays.length * 46;
    fig(`<svg viewBox="0 0 ${W} ${H}" width="${W}" style="min-width:${Math.round(W * 0.75)}px" role="img" aria-label="Tree diagram">${p.join('')}</svg>`);
    q('nulls').innerHTML = nulls.length ? `NULL / None: ${nulls.map((k) => `<code>${esc(k)}</code>`).join(', ')}` : '';
  }

  function drawHeap(f) {
    const a = f.items, n = a.length;
    const nodes = a.map((v, i) => ({ id: i, v, l: 2 * i + 1 < n ? 2 * i + 1 : null, r: 2 * i + 2 < n ? 2 * i + 2 : null }));
    const lay = T.layoutBinary(nodes, n ? [0] : []);
    const p = [], X = (i) => X0 + lay.pos[i].x * SX, Y = (i) => 40 + lay.pos[i].y * SY;
    const hl = f.hl || {}, has = (k, i) => hl[k] && hl[k].includes(i);
    nodes.forEach((nd) => [nd.l, nd.r].forEach((c) => { if (c !== null) p.push(`<line class="ed" x1="${X(nd.id)}" y1="${Y(nd.id)}" x2="${X(c)}" y2="${Y(c)}"/>`); }));
    const cls = (i) => ['tnode', has('cmp', i) ? 'cmp' : '', has('swap', i) ? 'rot' : '', has('new', i) ? 'found' : '', has('del', i) ? 'del' : ''].join(' ');
    nodes.forEach((nd) => p.push(`<g class="${cls(nd.id)}"><circle cx="${X(nd.id)}" cy="${Y(nd.id)}" r="${RAD}"/><text x="${X(nd.id)}" y="${Y(nd.id) + 5}" text-anchor="middle">${esc(nd.v)}</text></g>`));
    const ay = 40 + Math.max(1, lay.height) * SY + 20, CW = 46, W = Math.max(380, X0 * 2 + lay.width * SX, X0 + 15 * CW);
    p.push(`<text class="al" x="${X0 - 14}" y="${ay - 8}">array</text>`);
    for (let i = 0; i < Math.max(n, 1); i++) {
      if (!n) { p.push(`<text class="empty" x="${X0}" y="${ay + 20}">(empty heap)</text>`); break; }
      p.push(`<g class="${cls(i).replace('tnode', 'cellg')}"><rect x="${X0 - 14 + i * CW}" y="${ay}" width="${CW}" height="30"/><text x="${X0 - 14 + i * CW + CW / 2}" y="${ay + 20}" text-anchor="middle">${esc(a[i])}</text></g><text class="idx" x="${X0 - 14 + i * CW + CW / 2}" y="${ay + 44}" text-anchor="middle">${i}</text>`);
    }
    const H = ay + 58;
    fig(`<svg viewBox="0 0 ${W} ${H}" width="${W}" style="min-width:${Math.round(W * 0.75)}px" role="img" aria-label="Heap as a tree and as an array">${p.join('')}</svg>`);
    q('nulls').innerHTML = '';
  }
  function fig(html) { q('fig').innerHTML = html; }

  function outBar(f) {
    const e = f.extra, box = q('out');
    if (!e || e.type !== 'out') { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="memo"><span class="dim">${esc(e.title)}:</span>${e.items.length ? e.items.map((v) => `<span class="chip">${esc(v)}</span>`).join('') : '<span class="dim">(nothing yet)</span>'}${e.queue ? `<span class="dim" style="margin-left:12px">queue:</span>${e.queue.length ? e.queue.map((v) => `<span class="chip q">${esc(v)}</span>`).join('') : '<span class="dim">(empty)</span>'}` : ''}</div>`;
  }
  const heightOf = (f) => { const m = new Map(f.nodes.map((n) => [n.id, n])); const fl = new Set(f.float || []); const h = (id) => (id === null || id === undefined || !m.has(id) || fl.has(id) ? 0 : 1 + Math.max(h(m.get(id).l), h(m.get(id).r))); return h(f.root); };

  function render() {
    const f = D.frames[D.idx]; if (!f) return;
    if (f.kind === 'heap') drawHeap(f); else drawTree(f);
    outBar(f);
    const m = q('msg'); m.textContent = f.msg || ''; m.classList.toggle('bad', !!f.error);
    q('stats').innerHTML = `<span>Step <b>${D.idx + 1}</b> / ${D.frames.length}</span>` +
      (f.kind === 'heap' ? `<span>Items <b>${f.items.length}</b></span>` : f.user ? '' : `<span>Nodes <b>${f.nodes.filter((n) => !(f.float || []).includes(n.id)).length}</b></span><span>Height <b>${heightOf(f)}</b></span>`) +
      (!D.user ? `<span>Time <b>${esc(T.STRUCTS[D.kind].ops[D.op].cost)}</b></span>` : '');
    q('scrub').value = String(D.idx);
    const end = D.idx === D.frames.length - 1, start = D.idx === 0;
    q('prev').disabled = start; q('first').disabled = start; q('next').disabled = end; q('last').disabled = end;
    highlightCode(f);
  }

  // -------------------------------------------------------------------- code
  const hit = (lineLabel, label) => !!label && lineLabel.split(' ').includes(label);
  function codeLines() {
    if (D.user) return D.user.source.map((t, i) => [t, '', i + 1]);
    const C = T.CODE[D.kind], all = [...C.prelude[D.lang].map((l) => [l[0], '__pre']), ...C[D.op][D.lang]];
    return all.map((l, i) => [l[0], l[1], i + 1]);
  }
  function renderCode() {
    const bar = q('langBar');
    if (D.user) bar.innerHTML = `<span class="dim">Your code · ${esc(D.user.file)}${D.user.dirty ? ' (unsaved changes included)' : ''}</span>`;
    else {
      bar.innerHTML = `<button id="tr_lcpp" class="${D.lang === 'cpp' ? 'on' : ''}">C++</button><button id="tr_lpy" class="${D.lang === 'py' ? 'on' : ''}">Python</button>`;
      q('lcpp').onclick = () => { D.lang = 'cpp'; renderCode(); };
      q('lpy').onclick = () => { D.lang = 'py'; renderCode(); };
    }
    q('code').innerHTML = codeLines().map(([t, lab, n]) => `<span class="row${lab === '__pre' ? ' pre' : ''}"><span class="ln">${n}</span>${esc(t) || ' '}</span>`).join('');
    highlightCode(D.frames[D.idx]);
  }
  function highlightCode(f) {
    if (!f) return;
    const lines = codeLines(), on = new Set();
    if (D.user) { if (f.ln) on.add(f.ln - 1); } else lines.forEach((l, i) => { if (hit(l[1], f.label)) on.add(i); });
    let first = null;
    q('code').querySelectorAll('.row').forEach((r, i) => { const h = on.has(i); r.classList.toggle('hl', h); if (h && first === null) first = r; });
    if (first) { const b = q('code'), t = first.offsetTop, h = first.offsetHeight; if (t < b.scrollTop || t + h > b.scrollTop + b.clientHeight) b.scrollTop = Math.max(0, t - b.clientHeight / 3); }
  }
  function renderAbout() {
    const box = q('about');
    if (D.user) {
      box.innerHTML = `<h2>Your tree code, step by step</h2><p>The whole file ran once. Every change to a binary tree (objects with <code>.left</code> / <code>.right</code>) became one step, with the line that caused it highlighted. Recursive calls show up as your <code>root</code> / <code>node</code> variable moving down the tree.</p><p class="dim">Use ◀ to step back and see exactly which line attached the wrong child.</p>`;
      return;
    }
    const S = T.STRUCTS[D.kind], P = D.per[D.kind], vals = T.contents(D.kind, P.state);
    box.innerHTML = `<h2>${esc(S.name)}</h2><p>${esc(INFO[D.kind])}</p>
      <p><b>${S.type === 'heap' ? 'Array' : 'Sorted contents (in-order)'} after this operation:</b> <code>[${vals.map(esc).join(', ')}]</code></p>
      ${D.kind === 'avl' ? '<p class="dim">This demo shows insertion; deletion also rotates but is left out.</p>' : ''}
      ${P.hist.length ? `<p class="dim">History: ${P.hist.slice(-6).map(esc).join(' → ')}</p>` : ''}`;
  }

  // ---------------------------------------------------------------- stepping
  function go(i) { D.idx = Math.max(0, Math.min(D.frames.length - 1, i)); render(); }
  function play() {
    if (D.frames.length < 2) return;
    if (D.idx >= D.frames.length - 1) go(0);
    q('play').textContent = '❚❚ Pause';
    D.timer = setInterval(() => { if (D.idx >= D.frames.length - 1) { stop(); return; } go(D.idx + 1); }, DELAYS[D.speed - 1]);
  }
  function stop() { if (D.timer) { clearInterval(D.timer); D.timer = null; } if (D.built) q('play').textContent = '▶ Play'; }
  AV.stopTr = stop;
  AV.setupTr = () => { if (!D.frames.length) setup(); };
  window.addEventListener('keydown', (e) => {
    if (AV.tab !== 'tr') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === 'ArrowRight') { stop(); go(D.idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); go(D.idx - 1); e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'BUTTON') { D.timer ? stop() : play(); e.preventDefault(); }
  });

  function banner(kind, text, detail) {
    const d = document.createElement('div'); d.className = 'banner ' + (kind === 'info' ? '' : kind);
    d.innerHTML = `<p>${esc(text)}</p>${detail ? `<pre>${esc(detail)}</pre>` : ''}`; q('banners').appendChild(d);
  }
  function clearBanners() { if (D.built) q('banners').innerHTML = ''; }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'tr-running') {
      AV.show('tr'); if (!D.built) shell(); stop(); clearBanners();
      const d = document.createElement('div'); d.className = 'banner';
      d.innerHTML = `<span class="spin"></span>Running ${esc(m.name)} and recording every change to the tree… <button id="tr_cancel">Cancel</button>`;
      q('banners').appendChild(d); q('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
    } else if (m.type === 'tr-user') { stop(); AV.show('tr'); if (!D.built) shell(); D.user = m; setup(); }
    else if (m.type === 'tr-error') { AV.show('tr'); if (!D.built) shell(); stop(); clearBanners(); banner('error', m.message, m.detail); }
  });
})();
