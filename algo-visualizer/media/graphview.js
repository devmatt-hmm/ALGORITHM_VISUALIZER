(function () {
  'use strict';
  const AV = window.AV;
  const vscode = AV.vscode;
  const GR = window.Graphs;
  const root = document.getElementById('grView');
  const q = (id) => document.getElementById('gr_' + id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DELAYS = [900, 700, 520, 380, 270, 180, 120, 70, 40, 18];
  const R = 20, W = 640, H = 400;

  const S = { preset: 'small', graph: GR.preset('small'), algo: 'bfs', start: 'A', target: '', frames: [], idx: 0, timer: null, speed: 5, lang: 'cpp', user: null, built: false, customText: 'A-B, A-C, B-D, C-D, D-E' };

  // ------------------------------------------------------------------ shell
  function shell() {
    root.innerHTML = `
      <div class="toolbar">
        <span id="gr_demoTools" class="toolbar" style="margin:0">
          <label>Graph <select id="gr_preset">${GR.PRESET_ORDER.map((id) => `<option value="${id}">${esc(GR.PRESETS[id].name)}</option>`).join('')}<option value="custom">Type my own edges…</option></select></label>
          <label>Algorithm <select id="gr_algo">${GR.ORDER.map((id) => `<option value="${id}">${esc(GR.ALGOS[id].name)}</option>`).join('')}</select></label>
          <label>Start <select id="gr_start"></select></label>
          <label>Target <select id="gr_target"></select></label>
          <button id="gr_run" class="primary">Run</button>
        </span>
        <span id="gr_userTools" hidden class="toolbar" style="margin:0"><button id="gr_goto">Go to code</button><button id="gr_rerun">Re-run</button><button id="gr_leave">Back to demos</button></span>
        <span class="err" id="gr_err" role="alert"></span>
      </div>
      <div id="gr_customRow" class="toolbar" hidden>
        <label style="flex:1 1 360px">Edges <input id="gr_edges" type="text" style="flex:1;min-width:240px" aria-label="Edge list" placeholder="A-B, A-C:4, B-D   (A->B for directed, :5 for a weight)"></label>
        <button id="gr_apply">Apply</button>
      </div>
      <div id="gr_banners"></div>
      <div class="grid">
        <div><section class="card">
          <div id="gr_fig" class="fig"></div>
          <div class="legend" id="gr_legend"></div>
          <div id="gr_structs" class="structs"></div>
          <div class="controls">
            <button id="gr_first" aria-label="First step" title="First step">⏮</button>
            <button id="gr_prev" aria-label="Previous step" title="Previous (←)">◀</button>
            <button id="gr_play" class="primary" aria-label="Play" title="Play / pause (space)">▶ Play</button>
            <button id="gr_next" aria-label="Next step" title="Next (→)">▶</button>
            <button id="gr_last" aria-label="Last step" title="Last step">⏭</button>
            <input id="gr_scrub" type="range" min="0" max="0" value="0" aria-label="Step">
            <label>Speed <input id="gr_speed" class="speed" type="range" min="1" max="10" value="${S.speed}" aria-label="Speed"></label>
          </div>
          <div class="msg" id="gr_msg" aria-live="polite"></div>
          <div class="stats" id="gr_stats"></div>
        </section></div>
        <div>
          <section class="card" id="gr_tablesCard"><div id="gr_tables"></div></section>
          <section class="card"><div class="lang" id="gr_langBar"></div><pre class="code" id="gr_code"></pre></section>
          <section class="card about" id="gr_about"></section>
        </div>
      </div>`;
    q('preset').onchange = (e) => { stop(); if (e.target.value === 'custom') { q('customRow').hidden = false; q('edges').value = S.customText; applyCustom(true); } else { S.preset = e.target.value; q('customRow').hidden = true; setGraph(GR.preset(S.preset)); } };
    q('algo').onchange = (e) => { S.algo = e.target.value; build(); };
    q('start').onchange = (e) => { S.start = e.target.value; build(); };
    q('target').onchange = (e) => { S.target = e.target.value; build(); };
    q('run').onclick = () => build(true);
    q('apply').onclick = () => applyCustom(false);
    q('edges').onkeydown = (e) => { if (e.key === 'Enter') applyCustom(false); };
    q('first').onclick = () => { stop(); go(0); }; q('prev').onclick = () => { stop(); go(S.idx - 1); };
    q('next').onclick = () => { stop(); go(S.idx + 1); }; q('last').onclick = () => { stop(); go(S.frames.length - 1); };
    q('play').onclick = () => (S.timer ? stop() : play());
    q('scrub').oninput = (e) => { stop(); go(Number(e.target.value)); };
    q('speed').oninput = (e) => { S.speed = Number(e.target.value); if (S.timer) { stop(); play(); } };
    q('goto').onclick = () => vscode.postMessage({ type: 'reveal', view: 'gr', line: S.user ? S.user.source.startLine : 0 });
    q('rerun').onclick = () => vscode.postMessage({ type: 'gr-rerun' });
    q('leave').onclick = () => { stop(); S.user = null; setup(); };
    S.built = true;
  }

  function applyCustom(initial) {
    const r = GR.parseGraph(q('edges').value);
    if (r.error) { q('err').textContent = r.error; if (!initial) return; return; }
    q('err').textContent = ''; S.customText = q('edges').value; setGraph(r.graph);
  }
  function setGraph(g) {
    S.graph = g;
    const ids = g.nodes.map((n) => n.id);
    if (!ids.includes(S.start)) S.start = ids[0];
    if (S.target && !ids.includes(S.target)) S.target = '';
    q('start').innerHTML = ids.map((i) => `<option>${esc(i)}</option>`).join(''); q('start').value = S.start;
    q('target').innerHTML = `<option value="">(none: whole graph)</option>` + ids.map((i) => `<option>${esc(i)}</option>`).join(''); q('target').value = S.target;
    build();
  }

  function setup() {
    if (!S.built) shell();
    clearBanners();
    q('demoTools').hidden = !!S.user; q('userTools').hidden = !S.user; q('customRow').hidden = !!S.user || S.preset !== 'custom' && q('preset').value !== 'custom';
    if (S.user) { userFrames(); return; }
    q('preset').value = q('preset').value || S.preset; q('algo').value = S.algo; setGraph(S.graph);
  }

  // ----------------------------------------------------------------- building
  function build(autoplay) {
    stop(); clearBanners();
    const a = GR.ALGOS[S.algo];
    const res = GR.run(S.algo, S.graph, { start: S.start, target: S.target });
    if (res.error) { q('err').textContent = res.error; return; }
    q('err').textContent = '';
    if (S.algo === 'dijkstra' && !S.graph.weighted) banner('info', 'This graph has no weights, so every edge counts as 1 and Dijkstra gives the same distances as BFS. Try "Road map (weighted)".');
    if (S.algo !== 'dijkstra' && S.graph.weighted) banner('info', `${a.name} ignores the weights (it counts edges). Try Dijkstra to use them.`);
    S.frames = res.frames.map((f) => ({ ...f, structs: f.struct ? [f.struct] : [], tables: f.table ? [f.table] : [], labels: {} }));
    S.idx = 0; q('scrub').max = String(S.frames.length - 1);
    renderLegend(); renderCode(); renderAbout(); render();
    if (autoplay && S.frames.length > 1) { go(1); play(); }
  }

  function userFrames() {
    const u = S.user, g = u.graph, tr = u.trace;
    S.graph = g;
    const palette = ['g0', 'g1', 'g2'];
    S.frames = tr.frames.map((f) => {
      const node = {}, labels = {}; g.nodes.forEach((n) => { node[n.id] = 'unseen'; });
      const groups = [];
      f.seqs.forEach((s) => s.nodes.forEach((id) => { if (node[id] === 'unseen') node[id] = 'queued'; }));
      f.sets.forEach((s, i) => {
        const done = /(vis|seen|done|closed|explor|discover|process|final|settled|mark|reach)/i.test(s.name);
        s.nodes.forEach((id) => { if (node[id] === undefined) return; if (done) node[id] = 'done'; else if (node[id] === 'unseen' || node[id] === 'queued') node[id] = palette[i % 3]; });
        if (!done) groups.push([s.name, palette[i % 3]]);
      });
      Object.keys(f.ptrs).forEach((name) => { const id = f.ptrs[name]; if (node[id] !== undefined) { node[id] = 'cur'; (labels[id] = labels[id] || []).push(name); } });
      return {
        kind: 'graph', node, edge: {}, cur: null, labels, groups, path: null, label: '', ln: f.ln, error: false,
        msg: f.ln ? `After line ${f.ln}${f.fn ? ` in ${f.fn}()` : ''}.` : (f.fn ? `Entering ${f.fn}().` : 'The state before the first highlighted line.'),
        structs: f.seqs.map((s) => ({ title: s.name, items: s.items.map((t) => ({ t })) })), tables: f.maps.map((m) => ({ title: m.name, cols: ['node', 'value'], rows: m.rows })),
        sets: f.sets,
      };
    });
    if (!S.frames.length) S.frames = [{ kind: 'graph', node: Object.fromEntries(g.nodes.map((n) => [n.id, 'unseen'])), edge: {}, cur: null, labels: {}, groups: [], structs: [], tables: [], msg: 'Nothing to show.', error: false }];
    clearBanners(); (tr.notes || []).forEach((n) => banner('warn', n));
    if (tr.returned !== null && tr.returned !== undefined) banner('info', `Your function returned: ${tr.returned}`);
    S.idx = 0; q('scrub').max = String(S.frames.length - 1);
    renderLegend(); renderCode(); renderAbout(); render();
  }

  // ------------------------------------------------------------------ drawing
  function drawGraph(f) {
    const g = S.graph, P = {}; g.nodes.forEach((n) => { P[n.id] = [40 + n.x * (W - 80), 36 + n.y * (H - 72)]; });
    const pair = new Set(g.edges.map((e) => `${e.u}>${e.v}`));
    const p = [];
    g.edges.forEach((e, ei) => {
      const [x1, y1] = P[e.u], [x2, y2] = P[e.v]; let dx = x2 - x1, dy = y2 - y1; const d = Math.max(1, Math.hypot(dx, dy)); dx /= d; dy /= d;
      const both = g.directed && pair.has(`${e.v}>${e.u}`), off = both ? 16 : 0, nx = -dy, ny = dx;
      const sx = x1 + dx * R + nx * off * 0.6, sy = y1 + dy * R + ny * off * 0.6, ex = x2 - dx * (R + (g.directed ? 3 : 0)) + nx * off * 0.6, ey = y2 - dy * (R + (g.directed ? 3 : 0)) + ny * off * 0.6;
      const cx = (x1 + x2) / 2 + nx * off * 1.6, cy = (y1 + y2) / 2 + ny * off * 1.6;
      const st = f.edge[ei] || '';
      p.push(`<path class="ge ${st}" d="M${sx.toFixed(1)} ${sy.toFixed(1)} ${both ? `Q ${cx.toFixed(1)} ${cy.toFixed(1)}` : 'L'} ${ex.toFixed(1)} ${ey.toFixed(1)}"${g.directed ? ` marker-end="url(#garr${st ? '_' + st : ''})"` : ''}/>`);
      if (g.weighted) p.push(`<text class="gw" x="${(cx + nx * 11).toFixed(1)}" y="${(cy + ny * 11 + 4).toFixed(1)}" text-anchor="middle">${esc(e.w)}</text>`);
    });
    const badge = {};
    const t0 = f.tables && f.tables[0];
    if (!S.user && t0 && ['dist', 'level', 'found / finished'].includes(t0.cols[1])) t0.rows.forEach((row) => { if (row[1] !== '–') badge[row[0]] = row[1]; });
    g.nodes.forEach((n) => {
      const [x, y] = P[n.id], st = f.node[n.id] || 'unseen';
      p.push(`<g class="gn ${st} ${f.cur === n.id ? 'curn' : ''} ${f.path && f.path.includes(n.id) ? 'onpath' : ''}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R}"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">${esc(n.id)}</text></g>`);
      if (badge[n.id] !== undefined) p.push(`<text class="gb" x="${x.toFixed(1)}" y="${(y - R - 6).toFixed(1)}" text-anchor="middle">${esc(badge[n.id])}</text>`);
      (f.labels[n.id] || []).forEach((lab, i) => p.push(`<text class="pl pc" x="${x.toFixed(1)}" y="${(y + R + 15 + i * 13).toFixed(1)}" text-anchor="middle">▲ ${esc(lab)}</text>`));
    });
    const mk = (id, cls) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="${cls}" d="M0 0L10 5L0 10z"/></marker>`;
    q('fig').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Graph diagram"><defs>${mk('garr', 'ga')}${['tree', 'cur', 'skip', 'relax', 'path'].map((s) => mk('garr_' + s, 'ga ' + s)).join('')}</defs>${p.join('')}</svg>`;
  }

  function renderLegend() {
    const items = S.user ? [['var(--yellow)', 'a variable points here'], ['var(--green)', 'visited / done'], ['var(--blue)', 'in a queue / stack']] : [['var(--blue)', 'discovered, waiting'], ['var(--yellow)', 'being processed'], ['var(--green)', 'finished'], ['var(--green)', 'tree / path edges'], ['var(--red)', 'skipped edge']];
    q('legend').innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
  }

  function render() {
    const f = S.frames[S.idx]; if (!f) return;
    drawGraph(f);
    q('structs').innerHTML = (f.structs || []).map((s) => `<div class="memo"><span class="dim">${esc(s.title)}:</span>${s.items.length ? s.items.map((it) => `<span class="chip ${it.hl ? 'top' : ''} ${it.stale ? 'stale' : ''}">${esc(it.t)}</span>`).join('') : '<span class="dim">(empty)</span>'}</div>`).join('');
    const tabs = f.tables || [];
    q('tablesCard').hidden = !tabs.length;
    q('tables').innerHTML = tabs.map((t) => `<h2>${esc(t.title)}</h2><table><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${t.rows.map((row) => `<tr class="${t.hl !== undefined && t.hl !== null && String(row[0]) === String(t.hl) ? 'hlrow' : ''}">${row.map((c, i) => `<${i ? 'td' : 'th scope="row"'}>${esc(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`).join('');
    const m = q('msg'); m.textContent = f.msg || ''; m.classList.toggle('bad', !!f.error);
    q('stats').innerHTML = `<span>Step <b>${S.idx + 1}</b> / ${S.frames.length}</span><span>Nodes <b>${S.graph.nodes.length}</b></span><span>Edges <b>${S.graph.edges.length}</b></span><span>${S.graph.directed ? 'directed' : 'undirected'}${S.graph.weighted ? ', weighted' : ''}</span>` + (!S.user ? `<span>Time <b>${esc(GR.ALGOS[S.algo].cost.time)}</b></span>` : '');
    q('scrub').value = String(S.idx);
    const end = S.idx === S.frames.length - 1, start = S.idx === 0;
    q('prev').disabled = start; q('first').disabled = start; q('next').disabled = end; q('last').disabled = end;
    highlightCode(f);
  }

  // -------------------------------------------------------------------- code
  const hit = (lineLabel, label) => !!label && lineLabel.split(' ').includes(label);
  function codeLines() {
    if (S.user) return S.user.source.lines.map((t, i) => [t, '', S.user.source.startLine + 1 + i]);
    return GR.ALGOS[S.algo].code[S.lang].map((l, i) => [l[0], l[1], i + 1]);
  }
  function renderCode() {
    const bar = q('langBar');
    if (S.user) bar.innerHTML = `<span class="dim">Your function ${esc(S.user.name)}() · ${esc(S.user.file)}${S.user.dirty ? ' (unsaved changes included)' : ''}</span>`;
    else {
      bar.innerHTML = `<button id="gr_lcpp" class="${S.lang === 'cpp' ? 'on' : ''}">C++</button><button id="gr_lpy" class="${S.lang === 'py' ? 'on' : ''}">Python</button>`;
      q('lcpp').onclick = () => { S.lang = 'cpp'; renderCode(); }; q('lpy').onclick = () => { S.lang = 'py'; renderCode(); };
    }
    q('code').innerHTML = codeLines().map(([t, , n]) => `<span class="row"><span class="ln">${n}</span>${esc(t) || ' '}</span>`).join('');
    highlightCode(S.frames[S.idx]);
  }
  function highlightCode(f) {
    if (!f) return;
    const lines = codeLines(), on = new Set();
    if (S.user) { if (f.ln) on.add(f.ln - 1 - S.user.source.startLine); } else lines.forEach((l, i) => { if (hit(l[1], f.label)) on.add(i); });
    let first = null;
    q('code').querySelectorAll('.row').forEach((r, i) => { const h = on.has(i); r.classList.toggle('hl', h); if (h && first === null) first = r; });
    if (first) { const b = q('code'), t = first.offsetTop, h = first.offsetHeight; if (t < b.scrollTop || t + h > b.scrollTop + b.clientHeight) b.scrollTop = Math.max(0, t - b.clientHeight / 3); }
  }
  function renderAbout() {
    const box = q('about');
    if (S.user) {
      box.innerHTML = `<h2>${esc(S.user.name)}() on your graph</h2><p>Your function ran once on the graph you chose (start <code>${esc(S.user.start)}</code>${S.user.target ? `, target <code>${esc(S.user.target)}</code>` : ''}, format: ${esc(S.user.formatName)}). Whenever one of its variables changed, the nodes that variable refers to were marked: <b>yellow</b> for a variable holding a node (labelled ▲ name), <b>green</b> for visited sets, <b>blue</b> for queues and stacks, and dicts keyed by node become tables.</p>
        <p class="dim">A name used by both a function and its caller shows the caller's as <code>name↑</code>.</p>`;
      return;
    }
    const a = GR.ALGOS[S.algo];
    box.innerHTML = `<h2>${esc(a.name)}</h2><p>${esc(a.desc)}</p><table><tr><th>Time</th><th>Space</th></tr><tr><td>${a.cost.time}</td><td>${a.cost.space}</td></tr></table>`;
  }

  // ---------------------------------------------------------------- stepping
  function go(i) { S.idx = Math.max(0, Math.min(S.frames.length - 1, i)); render(); }
  function play() {
    if (S.frames.length < 2) return;
    if (S.idx >= S.frames.length - 1) go(0);
    q('play').textContent = '❚❚ Pause';
    S.timer = setInterval(() => { if (S.idx >= S.frames.length - 1) { stop(); return; } go(S.idx + 1); }, DELAYS[S.speed - 1]);
  }
  function stop() { if (S.timer) { clearInterval(S.timer); S.timer = null; } if (S.built) q('play').textContent = '▶ Play'; }
  AV.stopGr = stop;
  AV.setupGr = () => { if (!S.frames.length) setup(); };
  window.addEventListener('keydown', (e) => {
    if (AV.tab !== 'gr') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === 'ArrowRight') { stop(); go(S.idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); go(S.idx - 1); e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'BUTTON') { S.timer ? stop() : play(); e.preventDefault(); }
  });

  function banner(kind, text, detail) {
    const d = document.createElement('div'); d.className = 'banner ' + (kind === 'info' ? '' : kind);
    d.innerHTML = `<p>${esc(text)}</p>${detail ? `<pre>${esc(detail)}</pre>` : ''}`; q('banners').appendChild(d);
  }
  function clearBanners() { if (S.built) q('banners').innerHTML = ''; }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'gr-running') {
      AV.show('gr'); if (!S.built) shell(); stop(); clearBanners();
      const d = document.createElement('div'); d.className = 'banner';
      d.innerHTML = `<span class="spin"></span>Running ${esc(m.name)}() on your graph and recording every change… <button id="gr_cancel">Cancel</button>`;
      q('banners').appendChild(d); q('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
    } else if (m.type === 'gr-user') { stop(); AV.show('gr'); if (!S.built) shell(); S.user = m; setup(); }
    else if (m.type === 'gr-error') { AV.show('gr'); if (!S.built) shell(); stop(); clearBanners(); banner('error', m.message, m.detail); }
  });
})();
