(function () {
  'use strict';
  const AV = window.AV;
  const vscode = AV.vscode;
  const St = window.Structs;
  const root = document.getElementById('dsView');
  const tabs = document.getElementById('tabs');
  const q = (id) => document.getElementById('ds_' + id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DELAYS = [900, 700, 520, 380, 270, 180, 120, 70, 40, 18];
  const KINDS = ['list', 'stack', 'queue', 'cqueue'];
  const INFO = {
    list: 'Each node holds a value and a pointer to the next node. head points at the first node and the last node points to NULL, so a list has no fixed size and inserting or deleting needs no shifting, but reaching the n-th node means walking there.',
    stack: 'Last in, first out (LIFO). Only the top can be read or removed. This one is an array with capacity 8, so you can see overflow (push when full) and underflow (pop when empty).',
    queue: 'First in, first out (FIFO). Add at the rear, remove from the front. Built from linked nodes with both a front and a rear pointer, so both operations are O(1).',
    cqueue: 'A queue in a fixed array of 6 cells treated as a ring. front and rear wrap around with % capacity, so cells freed by dequeue are reused instead of being wasted.',
  };

  const D = {
    kind: 'list', op: 'insertHead', per: {}, frames: [], idx: 0, timer: null, speed: 5, lang: 'cpp', user: null, showArrays: true, seq: 0,
  };
  KINDS.forEach((k) => { D.per[k] = { state: St.emptyState(k), undo: [], hist: [] }; });

  // ------------------------------------------------------------------ tabs
  tabs.innerHTML = '<button id="tabAlgo" class="tab on">Algorithms</button><button id="tabDs" class="tab">Data structures</button><button id="tabRc" class="tab">Recursion</button><button id="tabTr" class="tab">Trees</button><button id="tabGr" class="tab">Graphs</button>';
  AV.show = (t) => {
    AV.tab = t;
    document.getElementById('algoView').hidden = t !== 'algo';
    root.hidden = t !== 'ds';
    document.getElementById('rcView').hidden = t !== 'rc';
    document.getElementById('trView').hidden = t !== 'tr';
    document.getElementById('grView').hidden = t !== 'gr';
    document.getElementById('tabGr').classList.toggle('on', t === 'gr');
    if (t !== 'gr' && AV.stopGr) AV.stopGr();
    if (t === 'gr' && AV.setupGr) AV.setupGr();
    document.getElementById('tabTr').classList.toggle('on', t === 'tr');
    if (t !== 'tr' && AV.stopTr) AV.stopTr();
    if (t === 'tr' && AV.setupTr) AV.setupTr();
    document.getElementById('tabAlgo').classList.toggle('on', t === 'algo');
    document.getElementById('tabDs').classList.toggle('on', t === 'ds');
    document.getElementById('tabRc').classList.toggle('on', t === 'rc');
    if (t !== 'ds') stop();
    if (t !== 'algo' && AV.stopAlgo) AV.stopAlgo();
    if (t !== 'rc' && AV.stopRc) AV.stopRc();
    if (t === 'ds' && !D.frames.length) setup();
    if (t === 'rc' && AV.setupRc) AV.setupRc();
  };
  document.getElementById('tabAlgo').onclick = () => AV.show('algo');
  document.getElementById('tabDs').onclick = () => AV.show('ds');
  document.getElementById('tabRc').onclick = () => AV.show('rc');
  document.getElementById('tabTr').onclick = () => AV.show('tr');
  document.getElementById('tabGr').onclick = () => AV.show('gr');

  // ----------------------------------------------------------------- shell
  let built = false;
  function shell() {
    root.innerHTML = `
      <div class="toolbar">
        <span id="ds_demoTools" class="toolbar" style="margin:0">
          <label>Structure <select id="ds_kind">${KINDS.map((k) => `<option value="${k}">${esc(St.STRUCTS[k].name)}</option>`).join('')}</select></label>
          <label>Operation <select id="ds_op"></select></label>
          <label id="ds_valW">Value <input id="ds_val" type="text" size="5" aria-label="Value" placeholder="random"></label>
          <label id="ds_idxW">Index <input id="ds_idx" type="text" size="4" aria-label="Index"></label>
          <button id="ds_run" class="primary">Run</button>
          <button id="ds_rand" title="Fill with a few random values">Random fill</button>
          <button id="ds_undo">Undo</button><button id="ds_reset">Reset</button>
        </span>
        <span id="ds_userTools" hidden class="toolbar" style="margin:0">
          <button id="ds_goto">Go to code</button><button id="ds_rerun">Re-run</button><button id="ds_leave">Back to demos</button>
          <label><input type="checkbox" id="ds_showArr"> Show lists and deques</label>
        </span>
        <span class="err" id="ds_err" role="alert"></span>
      </div>
      <div id="ds_banners"></div>
      <div class="grid">
        <div><section class="card">
          <div id="ds_fig" class="fig"></div>
          <div class="nulls" id="ds_nulls"></div>
          <div class="controls">
            <button id="ds_first" aria-label="First step" title="First step">⏮</button>
            <button id="ds_prev" aria-label="Previous step" title="Previous (←)">◀</button>
            <button id="ds_play" class="primary" aria-label="Play" title="Play / pause (space)">▶ Play</button>
            <button id="ds_next" aria-label="Next step" title="Next (→)">▶</button>
            <button id="ds_last" aria-label="Last step" title="Last step">⏭</button>
            <input id="ds_scrub" type="range" min="0" max="0" value="0" aria-label="Step">
            <label>Speed <input id="ds_speed" class="speed" type="range" min="1" max="10" value="${D.speed}" aria-label="Speed"></label>
          </div>
          <div class="msg" id="ds_msg" aria-live="polite"></div>
          <div class="stats" id="ds_stats"></div>
        </section></div>
        <div>
          <section class="card"><div class="lang" id="ds_langBar"></div><pre class="code" id="ds_code"></pre></section>
          <section class="card about" id="ds_about"></section>
        </div>
      </div>`;
    q('kind').onchange = (e) => { stop(); D.kind = e.target.value; D.op = St.STRUCTS[D.kind].opOrder[0]; setup(); };
    q('op').onchange = (e) => { D.op = e.target.value; q('err').textContent = ''; syncInputs(); renderCode(); renderAbout(); };
    q('run').onclick = runOp;
    q('val').onkeydown = q('idx').onkeydown = (e) => { if (e.key === 'Enter') runOp(); };
    q('rand').onclick = randomFill;
    q('undo').onclick = undo;
    q('reset').onclick = () => { stop(); D.per[D.kind] = { state: St.emptyState(D.kind), undo: [], hist: [] }; showState('Reset: the structure is empty again.'); };
    q('first').onclick = () => { stop(); go(0); };
    q('prev').onclick = () => { stop(); go(D.idx - 1); };
    q('next').onclick = () => { stop(); go(D.idx + 1); };
    q('last').onclick = () => { stop(); go(D.frames.length - 1); };
    q('play').onclick = () => (D.timer ? stop() : play());
    q('scrub').oninput = (e) => { stop(); go(Number(e.target.value)); };
    q('speed').oninput = (e) => { D.speed = Number(e.target.value); if (D.timer) { stop(); play(); } };
    q('goto').onclick = () => vscode.postMessage({ type: 'reveal', view: 'ds', line: 0 });
    q('rerun').onclick = () => vscode.postMessage({ type: 'ds-rerun' });
    q('leave').onclick = () => { stop(); D.user = null; setup(); };
    q('showArr').onchange = (e) => { D.showArrays = e.target.checked; render(); };
    built = true;
  }

  function setup() {
    if (!built) shell();
    clearBanners();
    q('kind').value = D.kind;
    q('demoTools').hidden = !!D.user; q('userTools').hidden = !D.user;
    if (D.user) { userFrames(); return; }
    const S = St.STRUCTS[D.kind];
    q('op').innerHTML = S.opOrder.map((id) => `<option value="${id}">${esc(S.ops[id].name)}</option>`).join('');
    if (!S.ops[D.op]) D.op = S.opOrder[0];
    q('op').value = D.op;
    syncInputs();
    showState(D.kind === 'stack' ? 'The stack is empty. Pick an operation and press Run.' : null);
  }
  function syncInputs() {
    const a = St.STRUCTS[D.kind].ops[D.op].args;
    q('valW').hidden = !a.includes('value'); q('idxW').hidden = !a.includes('index');
  }

  // -------------------------------------------------------------- operations
  function showState(msg) {
    D.frames = [St.stateFrame(D.kind, D.per[D.kind].state)];
    if (msg) D.frames[0].msg = msg;
    D.idx = 0; q('scrub').max = '0'; render(); renderCode(); renderAbout();
  }
  function runOp() {
    stop();
    const S = St.STRUCTS[D.kind], op = S.ops[D.op], P = D.per[D.kind];
    const args = {};
    const err = (m) => { q('err').textContent = m; };
    if (op.args.includes('value')) {
      const t = q('val').value.trim();
      if (t === '') { args.value = 10 + Math.floor(Math.random() * 90); q('val').value = String(args.value); }
      else if (!/^-?\d+$/.test(t)) { err('The value must be a whole number (or leave it empty for a random one).'); return; }
      else args.value = parseInt(t, 10);
    }
    if (op.args.includes('index')) {
      const t = q('idx').value.trim();
      if (!/^\d+$/.test(t)) { err('Type the index as a whole number, 0 or more.'); return; }
      args.index = parseInt(t, 10);
    }
    const r = St.runOp(D.kind, D.op, P.state, args);
    if (r.error) { err(r.error); return; }
    err('');
    P.undo.push({ state: P.state, hist: P.hist.slice() });
    P.state = r.state;
    P.hist.push(op.name + (args.value !== undefined || args.index !== undefined ? ' (' + [args.value !== undefined ? 'value ' + args.value : '', args.index !== undefined ? 'index ' + args.index : ''].filter(Boolean).join(', ') + ')' : ''));
    D.frames = r.frames; D.idx = 0; q('scrub').max = String(D.frames.length - 1);
    render(); renderCode(); renderAbout();
    if (D.frames.length > 1) { go(1); play(); }
  }
  function randomFill() {
    stop(); q('err').textContent = '';
    const P = D.per[D.kind];
    P.undo.push({ state: P.state, hist: P.hist.slice() });
    let st = St.emptyState(D.kind);
    const op = D.kind === 'list' ? 'insertTail' : D.kind === 'stack' ? 'push' : 'enqueue';
    const n = D.kind === 'list' || D.kind === 'queue' ? 5 : 4;
    for (let i = 0; i < n; i++) st = St.runOp(D.kind, op, st, { value: 10 + Math.floor(Math.random() * 90) }).state;
    P.state = st; P.hist = ['Random fill'];
    showState(`Filled with ${n} random values.`);
  }
  function undo() {
    stop();
    const P = D.per[D.kind];
    if (!P.undo.length) { q('err').textContent = 'Nothing to undo.'; return; }
    q('err').textContent = '';
    const u = P.undo.pop(); P.state = u.state; P.hist = u.hist;
    showState('Undone.');
  }

  // ---------------------------------------------------------------- user mode
  function userFrames() {
    const tr = D.user.trace;
    D.showArrays = tr.sawNodes ? false : true;
    q('showArr').checked = D.showArrays;
    D.frames = tr.frames.map((f) => {
      const lay = St.layoutChains(f.nodes, 8);
      return {
        kind: 'graph', nodes: lay.nodes, rows: lay.rows, hidden: lay.hidden, ptrs: f.ptrs, arrays: f.arrays, label: '', ln: f.ln,
        msg: f.ln ? `After line ${f.ln}${f.fn && f.fn !== 'main' ? ` in ${f.fn}()` : ''}.` : (f.fn && f.fn !== 'main' ? `Entering ${f.fn}().` : 'The state before the first highlighted line.'), error: false,
      };
    });
    if (!D.frames.length) D.frames = [{ kind: 'graph', nodes: [], rows: 0, ptrs: {}, arrays: [], msg: 'Nothing to show.', ln: null }];
    clearBanners();
    (tr.notes || []).forEach((n) => banner('warn', n));
    D.idx = 0; q('scrub').max = String(D.frames.length - 1);
    render(); renderCode(); renderAbout();
  }

  // ---------------------------------------------------------------- drawing
  const BW = 88, BH = 42, GAP = 46, X0 = 34, ROWH = 140, Y0 = 86;
  function ptrClass(name) {
    const n = name.split('.').pop().replace(/\u2191+$/, '');
    if (/^(head|front|top|first)$/.test(n)) return 'ph';
    if (/^(tail|rear|last)$/.test(n)) return 'pt';
    if (/^(cur|current|curr|temp|tmp|node|p|q|ptr)$/.test(n)) return 'pc';
    if (/^(prev|previous|nxt|next_node|n|new|new_node|nxt)$/.test(n)) return 'pp';
    return 'po';
  }
  function fromListFrame(f) {
    const ptrs = {};
    if (f.names.head) ptrs[f.names.head] = f.head;
    if (f.names.tail && f.tail !== undefined) ptrs[f.names.tail] = f.tail;
    Object.assign(ptrs, f.ptrs);
    return { nodes: f.nodes.map((n) => ({ ...n })), rows: 1, ptrs, hl: f.hl || {}, arrays: [] };
  }

  function drawGraph(g) {
    const nodes = g.nodes;
    const nulls = Object.keys(g.ptrs).filter((k) => g.ptrs[k] === null);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const cell = new Map(nodes.map((n) => [n.row + ':' + n.col, n]));
    const maxCol = nodes.length ? Math.max(...nodes.map((n) => n.col)) : 0;
    const rows = Math.max(1, g.rows || 1);
    const hasFloat = nodes.some((n) => n.float);
    const x = (n) => X0 + n.col * (BW + GAP);
    const y = (n) => Y0 + n.row * ROWH - (n.float ? 70 : 0);
    const arrays = g.showArrays ? g.arrays : [];
    const arrH = arrays.length * 50;
    const W = Math.max(380, X0 * 2 + (maxCol + 1) * (BW + GAP) + 20);
    const H = Y0 + rows * ROWH - 40 + arrH + (hasFloat ? 0 : -10);
    const p = [];
    const arrow = (d, cls) => p.push(`<path class="ar ${cls || ''}" d="${d}" marker-end="url(#dsarr)"/>`);

    // labels per node
    const labels = new Map();
    Object.keys(g.ptrs).forEach((k) => { const id = g.ptrs[k]; if (id !== null && byId.has(id)) { if (!labels.has(id)) labels.set(id, []); labels.get(id).push(k); } });
    nodes.forEach((n) => { if (n.float) { if (!labels.has(n.id)) labels.set(n.id, []); labels.get(n.id).push('new'); } });

    nodes.forEach((n) => {
      const sx = x(n) + BW - 14, sy = y(n) + BH / 2;
      const m = n.next != null ? byId.get(n.next) : null;
      if (n.loopTo) {
        const t = cell.get(n.loopTo.row + ':' + n.loopTo.col);
        if (t) { const tx = x(t) + BW / 2, ty = y(t); arrow(`M${sx} ${y(n)} C ${sx} ${y(n) - 70}, ${tx} ${ty - 70}, ${tx} ${ty - 2}`); }
      } else if (!m) {
        p.push(`<path class="ar" d="M${sx} ${sy} h24"/><text class="nul" x="${sx + 28}" y="${sy + 4}">NULL</text>`);
      } else if (m.row === n.row && !n.float && !m.float && m.col === n.col + 1) {
        arrow(`M${sx} ${sy} L${x(m) - 3} ${y(m) + BH / 2}`);
      } else if (m.row === n.row && !n.float && !m.float) {
        const mx = x(m) + BW / 2, h = 34 + 12 * Math.min(4, Math.abs(m.col - n.col));
        arrow(`M${sx} ${y(n)} C ${sx} ${y(n) - h}, ${mx} ${y(m) - h}, ${mx} ${y(m) - 2}`, m.col < n.col ? 'back' : '');
      } else if (x(m) > sx) {
        arrow(`M${sx} ${sy} L${x(m) - 3} ${y(m) + BH / 2}`);
      } else {
        arrow(`M${sx} ${sy} L${x(m) + BW / 2} ${y(m) + BH + 2}`);
      }
      if (n.prev != null && byId.has(n.prev)) {
        const pn = byId.get(n.prev);
        p.push(`<path class="ar prevlink" d="M${x(n) + 12} ${y(n) + BH} Q ${(x(n) + x(pn) + BW) / 2} ${y(n) + BH + 26}, ${x(pn) + BW - 12} ${y(pn) + BH + 2}" marker-end="url(#dsarr)"/>`);
      }
    });
    nodes.forEach((n) => {
      const hl = g.hl || {};
      const has = (k) => hl[k] && hl[k].includes(n.id);
      const cls = ['nd', n.float ? 'float' : '', n.fade ? 'fade' : '', has('cmp') ? 'cmp' : '', has('found') ? 'found' : ''].join(' ');
      p.push(`<g class="${cls}"><rect x="${x(n)}" y="${y(n)}" width="${BW}" height="${BH}" rx="4"/><line x1="${x(n) + 60}" y1="${y(n)}" x2="${x(n) + 60}" y2="${y(n) + BH}"/>
        <text x="${x(n) + 30}" y="${y(n) + BH / 2 + 5}" text-anchor="middle">${esc(n.v)}</text><circle cx="${x(n) + 74}" cy="${y(n) + BH / 2}" r="3.5"/></g>`);
      (labels.get(n.id) || []).forEach((lab, i) => {
        p.push(`<text class="pl ${ptrClass(lab)}" x="${x(n) + BW / 2}" y="${y(n) + BH + 18 + i * 15}" text-anchor="middle">▲ ${esc(lab)}</text>`);
      });
    });
    if (!nodes.length) p.push(`<text class="empty" x="${X0}" y="${Y0 + 22}">(no nodes yet)</text>`);
    arrays.forEach((a, i) => {
      const ay = Y0 + rows * ROWH - 30 + i * 50;
      p.push(`<text class="al" x="${X0}" y="${ay + 22}">${esc(a.name)}${a.deque ? ' (deque)' : ''}</text>`);
      const ax = X0 + 130;
      if (!a.items.length) p.push(`<text class="empty" x="${ax}" y="${ay + 22}">(empty)</text>`);
      a.items.forEach((it, k) => p.push(`<g class="cellg"><rect x="${ax + k * 46}" y="${ay}" width="46" height="30"/><text x="${ax + k * 46 + 23}" y="${ay + 20}" text-anchor="middle">${esc(it)}</text></g>`));
    });
    $fig(`<svg viewBox="0 0 ${W} ${H}" width="${W}" style="min-width:${Math.round(W * 0.8)}px" role="img" aria-label="Linked structure diagram"><defs><marker id="dsarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>${p.join('')}</svg>`);
    q('nulls').innerHTML = (g.hidden ? `<span>+${g.hidden} more node(s) in extra chains not drawn</span> ` : '') + (nulls.length ? `NULL / None: ${nulls.map((k) => `<code>${esc(k)}</code>`).join(', ')}` : '');
  }

  function drawStack(f) {
    const CAP = f.cap, CH = 34, W = 330, top = 16, H = top + CAP * CH + 56;
    const p = [];
    for (let i = 0; i < CAP; i++) {
      const yy = top + (CAP - 1 - i) * CH, filled = i < f.items.length;
      const cls = ['sc', filled ? 'full' : 'free', f.hl.top === i ? 'found' : '', f.hl.pop === i ? 'del' : ''].join(' ');
      p.push(`<g class="${cls}"><rect x="90" y="${yy}" width="130" height="${CH - 4}" rx="3"/>${filled ? `<text x="155" y="${yy + 21}" text-anchor="middle">${esc(f.items[i])}</text>` : ''}</g><text class="idx" x="76" y="${yy + 21}" text-anchor="end">${i}</text>`);
    }
    const t = f.items.length - 1;
    if (t >= 0) p.push(`<text class="pl ph" x="232" y="${top + (CAP - 1 - t) * CH + 21}">◀ top</text>`);
    p.push(`<text class="pl ph" x="90" y="${top + CAP * CH + 20}">top = ${t}${t < 0 ? ' (empty)' : ''}${f.items.length === CAP ? ' (full)' : ''}</text>`);
    $fig(`<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Stack diagram">${p.join('')}</svg>`);
    q('nulls').innerHTML = '';
  }

  function drawSlots(f) {
    const CAP = f.cap, CW = 66, X = 40, Y = 82, W = X * 2 + CAP * CW, H = 236;
    const p = [];
    for (let i = 0; i < CAP; i++) {
      const v = f.cells[i];
      const cls = ['sc', v !== null ? 'full' : 'free', f.hl.idx === i ? 'cmp' : ''].join(' ');
      p.push(`<g class="${cls}"><rect x="${X + i * CW}" y="${Y}" width="${CW - 4}" height="44" rx="3"/>${v !== null ? `<text x="${X + i * CW + (CW - 4) / 2}" y="${Y + 28}" text-anchor="middle">${esc(v)}</text>` : ''}</g>
        <text class="idx" x="${X + i * CW + (CW - 4) / 2}" y="${Y + 62}" text-anchor="middle">${i}</text>`);
    }
    const mid = (i) => X + i * CW + (CW - 4) / 2;
    if (f.size > 0 || f.front !== 0) p.push(`<text class="pl ph" x="${mid(f.front)}" y="${Y + 84}" text-anchor="middle">▲ front</text>`);
    if (f.rear >= 0) p.push(`<text class="pl pt" x="${mid(f.rear)}" y="${Y - 14}" text-anchor="middle">rear ▼</text>`);
    p.push(`<text class="pl po" x="${X}" y="${Y + 112}">front = ${f.front}    rear = ${f.rear}    size = ${f.size} / ${f.cap}</text>`);
    $fig(`<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Circular queue diagram">${p.join('')}</svg>`);
    q('nulls').innerHTML = '';
  }
  function $fig(html) { q('fig').innerHTML = html; }

  function render() {
    const f = D.frames[D.idx];
    if (!f) return;
    if (f.kind === 'list') drawGraph(fromListFrame(f));
    else if (f.kind === 'graph') drawGraph({ nodes: f.nodes, rows: f.rows, hidden: f.hidden, ptrs: f.ptrs, hl: {}, arrays: f.arrays, showArrays: D.showArrays });
    else if (f.kind === 'stack') drawStack(f);
    else drawSlots(f);
    const m = q('msg'); m.textContent = f.msg || ''; m.classList.toggle('bad', !!f.error);
    q('stats').innerHTML = `<span>Step <b>${D.idx + 1}</b> / ${D.frames.length}</span>` +
      (!D.user ? `<span>Time <b>${esc(St.STRUCTS[D.kind].ops[D.op].cost)}</b></span>` : '');
    q('scrub').value = String(D.idx);
    const end = D.idx === D.frames.length - 1, start = D.idx === 0;
    q('prev').disabled = start; q('first').disabled = start; q('next').disabled = end; q('last').disabled = end;
    highlightCode(f);
  }

  // ----------------------------------------------------------------- code
  function codeLines() {
    if (D.user) return D.user.source.map((t, i) => [t, '', i + 1]);
    const C = St.CODE[D.kind], op = C[D.op];
    const all = [...C.prelude[D.lang].map((l) => [l[0], '__pre']), ...op[D.lang]];
    return all.map((l, i) => [l[0], l[1], i + 1]);
  }
  function renderCode() {
    const bar = q('langBar');
    if (D.user) bar.innerHTML = `<span class="dim">Your code · ${esc(D.user.file)}${D.user.dirty ? ' (unsaved changes included)' : ''}</span>`;
    else {
      bar.innerHTML = `<button id="ds_lcpp" class="${D.lang === 'cpp' ? 'on' : ''}">C++</button><button id="ds_lpy" class="${D.lang === 'py' ? 'on' : ''}">Python</button>`;
      q('lcpp').onclick = () => { D.lang = 'cpp'; renderCode(); highlightCode(D.frames[D.idx]); };
      q('lpy').onclick = () => { D.lang = 'py'; renderCode(); highlightCode(D.frames[D.idx]); };
    }
    q('code').innerHTML = codeLines().map(([t, lab, n]) => `<span class="row${lab === '__pre' ? ' pre' : ''}"><span class="ln">${n}</span>${esc(t) || ' '}</span>`).join('');
    highlightCode(D.frames[D.idx]);
  }
  function highlightCode(f) {
    if (!f) return;
    const lines = codeLines(), hit = new Set();
    if (D.user) { if (f.ln) hit.add(f.ln - 1); }
    else if (f.label && f.label !== 'idle') lines.forEach((l, i) => { if (l[1] === f.label) hit.add(i); });
    let first = null;
    q('code').querySelectorAll('.row').forEach((r, i) => { const on = hit.has(i); r.classList.toggle('hl', on); if (on && first === null) first = r; });
    if (first) { const box = q('code'); const t = first.offsetTop, h = first.offsetHeight; if (t < box.scrollTop || t + h > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, t - box.clientHeight / 3); }
  }

  function renderAbout() {
    const box = q('about');
    if (D.user) {
      box.innerHTML = `<h2>Your code, step by step</h2><p>The whole file ran once. Every time a linked structure (objects with a <code>.next</code> pointer) or a short list / deque changed, that became one step, with the line that caused it highlighted.</p>
        <p class="dim">Triangles ▲ are your variables pointing at nodes. Use ◀ to step back and see exactly which line broke a link.</p>`;
      return;
    }
    const S = St.STRUCTS[D.kind], P = D.per[D.kind];
    const vals = St.contents(D.kind, P.state);
    box.innerHTML = `<h2>${esc(S.name)}</h2><p>${esc(INFO[D.kind])}</p>
      <p><b>Contents after this operation${D.kind === 'stack' ? ' (bottom → top)' : D.kind.includes('queue') ? ' (front → rear)' : ' (head → tail)'}:</b> <code>[${vals.map(esc).join(', ')}]</code></p>
      ${P.hist.length ? `<p class="dim">History: ${P.hist.slice(-6).map(esc).join(' → ')}</p>` : ''}`;
  }

  // ------------------------------------------------------------- stepping
  function go(i) { D.idx = Math.max(0, Math.min(D.frames.length - 1, i)); render(); }
  function play() {
    if (D.frames.length < 2) return;
    if (D.idx >= D.frames.length - 1) go(0);
    q('play').textContent = '❚❚ Pause';
    D.timer = setInterval(() => { if (D.idx >= D.frames.length - 1) { stop(); return; } go(D.idx + 1); }, DELAYS[D.speed - 1]);
  }
  function stop() {
    if (D.timer) { clearInterval(D.timer); D.timer = null; }
    if (built) q('play').textContent = '▶ Play';
  }
  window.addEventListener('keydown', (e) => {
    if (AV.tab !== 'ds') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === 'ArrowRight') { stop(); go(D.idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); go(D.idx - 1); e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'BUTTON') { D.timer ? stop() : play(); e.preventDefault(); }
  });

  function banner(kind, text, detail) {
    const d = document.createElement('div');
    d.className = 'banner ' + (kind === 'info' ? '' : kind);
    d.innerHTML = `<p>${esc(text)}</p>${detail ? `<pre>${esc(detail)}</pre>` : ''}`;
    q('banners').appendChild(d);
  }
  function clearBanners() { q('banners').innerHTML = ''; }

  // ------------------------------------------------------------- messages
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'init') { AV.show(['ds', 'rc', 'tr', 'gr'].includes(m.tab) ? m.tab : 'algo'); }
    else if (m.type === 'ds-running') {
      AV.show('ds'); if (!built) shell(); stop(); clearBanners();
      const d = document.createElement('div'); d.className = 'banner';
      d.innerHTML = `<span class="spin"></span>Running ${esc(m.name)} and recording every change… <button id="ds_cancel">Cancel</button>`;
      q('banners').appendChild(d); q('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
    } else if (m.type === 'ds-user') {
      stop(); AV.show('ds'); if (!built) shell(); D.user = m; setup();
    } else if (m.type === 'ds-error') {
      AV.show('ds'); if (!built) shell(); stop(); clearBanners(); banner('error', m.message, m.detail);
    }
  });

  AV.show('algo');
})();
