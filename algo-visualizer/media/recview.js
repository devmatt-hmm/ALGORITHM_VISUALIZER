(function () {
  'use strict';
  const AV = window.AV;
  const vscode = AV.vscode;
  const R = window.Recur;
  const root = document.getElementById('rcView');
  const q = (id) => document.getElementById('rc_' + id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DELAYS = [900, 700, 520, 380, 270, 180, 120, 70, 40, 18];

  const S = { algo: 'fact', vals: {}, frames: [], events: [], idx: 0, timer: null, speed: 5, lang: 'cpp', user: null, layout: null, nodes: [], built: false };

  // ------------------------------------------------------------------ shell
  function shell() {
    root.innerHTML = `
      <div class="toolbar">
        <span id="rc_demoTools" class="toolbar" style="margin:0">
          <label>Function <select id="rc_algo">${R.ORDER.map((id) => `<option value="${id}">${esc(R.ALGOS[id].name)}</option>`).join('')}</select></label>
          <span id="rc_params" class="toolbar" style="margin:0"></span>
          <button id="rc_run" class="primary">Run</button>
        </span>
        <span id="rc_userTools" hidden class="toolbar" style="margin:0"><button id="rc_goto">Go to code</button><button id="rc_rerun">Re-run</button><button id="rc_leave">Back to demos</button></span>
        <span class="err" id="rc_err" role="alert"></span>
      </div>
      <div id="rc_banners"></div>
      <div class="grid rcgrid">
        <div><section class="card">
          <div id="rc_extra"></div>
          <div id="rc_tree" class="rctree" tabindex="0" aria-label="Call tree"></div>
          <div class="legend" id="rc_legend"></div>
          <div class="controls">
            <button id="rc_first" aria-label="First step" title="First step">⏮</button>
            <button id="rc_prev" aria-label="Previous step" title="Previous (←)">◀</button>
            <button id="rc_play" class="primary" aria-label="Play" title="Play / pause (space)">▶ Play</button>
            <button id="rc_next" aria-label="Next step" title="Next (→)">▶</button>
            <button id="rc_last" aria-label="Last step" title="Last step">⏭</button>
            <input id="rc_scrub" type="range" min="0" max="0" value="0" aria-label="Step">
            <label>Speed <input id="rc_speed" class="speed" type="range" min="1" max="10" value="${S.speed}" aria-label="Speed"></label>
          </div>
          <div class="msg" id="rc_msg" aria-live="polite"></div>
          <div class="stats" id="rc_stats"></div>
        </section></div>
        <div>
          <section class="card"><h2>Call stack</h2><div id="rc_stack" class="cstack"></div></section>
          <section class="card"><div class="lang" id="rc_langBar"></div><pre class="code" id="rc_code"></pre></section>
          <section class="card about" id="rc_about"></section>
        </div>
      </div>`;
    q('algo').onchange = (e) => { stop(); S.algo = e.target.value; q('err').textContent = ''; params(); rebuild(); };
    q('run').onclick = () => { rebuild(true); };
    q('first').onclick = () => { stop(); go(0); };
    q('prev').onclick = () => { stop(); go(S.idx - 1); };
    q('next').onclick = () => { stop(); go(S.idx + 1); };
    q('last').onclick = () => { stop(); go(S.frames.length - 1); };
    q('play').onclick = () => (S.timer ? stop() : play());
    q('scrub').oninput = (e) => { stop(); go(Number(e.target.value)); };
    q('speed').oninput = (e) => { S.speed = Number(e.target.value); if (S.timer) { stop(); play(); } };
    q('goto').onclick = () => vscode.postMessage({ type: 'reveal', view: 'rc', line: S.user ? S.user.source.startLine : 0 });
    q('rerun').onclick = () => vscode.postMessage({ type: 'rc-rerun' });
    q('leave').onclick = () => { stop(); S.user = null; setup(); };
    S.built = true;
  }

  function params() {
    const a = R.ALGOS[S.algo];
    q('params').innerHTML = a.params.map((p) => `<label>${esc(p.name)} <input type="text" size="4" id="rc_p_${p.name}" value="${esc(S.vals[S.algo + p.name] !== undefined ? S.vals[S.algo + p.name] : p.def)}" aria-label="${esc(p.name)}, ${p.min} to ${p.max}" title="${p.min} to ${p.max}"></label>`).join('');
    a.params.forEach((p) => { q('p_' + p.name).onkeydown = (e) => { if (e.key === 'Enter') rebuild(true); }; q('p_' + p.name).onchange = () => rebuild(true); });
  }

  function setup() {
    if (!S.built) shell();
    clearBanners();
    q('demoTools').hidden = !!S.user; q('userTools').hidden = !S.user;
    q('algo').value = S.algo;
    if (S.user) { userFrames(); return; }
    params(); rebuild();
  }

  // -------------------------------------------------------------- building
  function rebuild(autoplay) {
    stop();
    const a = R.ALGOS[S.algo];
    const raw = {};
    a.params.forEach((p) => { raw[p.name] = q('p_' + p.name).value; S.vals[S.algo + p.name] = raw[p.name]; });
    const v = R.validate(S.algo, raw);
    if (v.error) { q('err').textContent = v.error; return; }
    q('err').textContent = '';
    const b = R.build(S.algo, v.params);
    S.events = b.events; S.frames = b.frames;
    if (a.id === 'hanoi') S.frames[S.frames.length - 1].msg = `Done: the tower was moved in ${b.result} moves (2ⁿ − 1 = ${b.result}).`;
    finishBuild();
    if (autoplay && S.frames.length > 1) { go(1); play(); }
  }
  function userFrames() {
    const t = S.user.trace;
    S.events = t.events; S.frames = R.framesFromEvents(t.events, { empty: 'Your function was never called.' });
    (t.notes || []).forEach((n) => banner('warn', n));
    finishBuild();
  }
  function finishBuild() {
    const created = S.events.filter((e) => e.k === 'call');
    S.nodes = []; created.forEach((e) => { S.nodes[e.id] = { id: e.id, parent: e.parent === undefined ? null : e.parent, text: e.text }; });
    S.layout = R.layoutTree(S.nodes);
    S.idx = 0; q('scrub').max = String(S.frames.length - 1);
    renderLegend(); renderCode(); renderAbout(); render();
  }

  // --------------------------------------------------------------- drawing
  const NH = 42, LH = 84;
  function drawTree(f) {
    const nodes = S.nodes, lay = S.layout;
    if (!f.created) { q('tree').innerHTML = '<p class="dim" style="margin:12px">No calls yet.</p>'; return; }
    const widest = Math.max(4, ...nodes.filter(Boolean).map((n) => n.text.length));
    const NW = Math.max(56, widest * 7.4 + 16), SW = NW + 14;
    const W = 30 + lay.width * SW, H = 30 + lay.height * LH + 10;
    const cx = (id) => 15 + lay.x[id] * SW + SW / 2, cy = (id) => 14 + lay.depth[id] * LH;
    const p = [];
    for (let i = 0; i < f.created; i++) {
      const n = nodes[i]; if (!n || n.parent === null) continue;
      const x1 = cx(n.parent), y1 = cy(n.parent) + NH, x2 = cx(i), y2 = cy(i), my = (y1 + y2) / 2;
      p.push(`<path class="te ${f.st[i] >= 3 ? 'ok' : ''}" d="M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}"/>`);
    }
    for (let i = 0; i < f.created; i++) {
      const n = nodes[i]; if (!n) continue;
      const s = f.st[i], cls = ['tn', ['', 'run', 'wait', 'done', 'memo', 'err'][s], i === f.cur ? 'cur' : ''].join(' ');
      const has = f.val[i] !== null && f.val[i] !== undefined && s >= 3;
      p.push(`<g class="${cls}"><rect x="${cx(i) - NW / 2}" y="${cy(i)}" width="${NW}" height="${NH}" rx="6"/><text x="${cx(i)}" y="${cy(i) + 17}" text-anchor="middle">${esc(n.text)}</text>` +
        (has ? `<text class="rv ${s === 5 ? 'bad' : ''}" x="${cx(i)}" y="${cy(i) + 33}" text-anchor="middle">${s === 5 ? '✗ ' + esc(f.val[i]) : '→ ' + esc(f.val[i])}</text>` : s === 4 ? `<text class="rv memo" x="${cx(i)}" y="${cy(i) + 33}" text-anchor="middle">cached</text>` : '') + '</g>');
    }
    const box = q('tree');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Call tree">${p.join('')}</svg>`;
    if (f.cur !== null && f.cur < f.created) {
      const px = cx(f.cur), py = cy(f.cur);
      if (px - NW / 2 < box.scrollLeft || px + NW / 2 > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, px - box.clientWidth / 2);
      if (py < box.scrollTop || py + NH + 20 > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, py - box.clientHeight / 2);
    }
  }

  function drawExtra(f) {
    const box = q('extra'), e = f.extra;
    if (!e) { box.innerHTML = ''; return; }
    if (e.type === 'pegs') {
      const n = Math.max(1, ...Object.values(e.pegs).map((p) => Math.max(0, ...p)), 1), PW = 190, H = 24 + n * 17 + 30, parts = [];
      ['A', 'B', 'C'].forEach((name, k) => {
        const cx = 20 + PW / 2 + k * PW;
        parts.push(`<rect class="peg" x="${cx - 3}" y="14" width="6" height="${n * 17 + 12}" rx="2"/><rect class="base" x="${cx - PW / 2 + 12}" y="${14 + n * 17 + 12}" width="${PW - 24}" height="5" rx="2"/><text class="pegname" x="${cx}" y="${H - 6}" text-anchor="middle">${name}</text>`);
        e.pegs[name].forEach((d, i) => {
          const w = 24 + d * 22, y = 14 + n * 17 + 12 - (i + 1) * 17;
          parts.push(`<g class="disk d${d % 6}"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="15" rx="4"/><text x="${cx}" y="${y + 12}" text-anchor="middle">${d}</text></g>`);
        });
      });
      box.innerHTML = `<svg viewBox="0 0 ${20 + PW * 3} ${H}" width="${20 + PW * 3}" role="img" aria-label="The three pegs">${parts.join('')}</svg>`;
    } else if (e.type === 'table') {
      box.innerHTML = `<div class="memo"><span class="dim">${esc(e.title)}</span> ${e.rows.length ? e.rows.map((r) => `<span class="chip">${esc(r[0])} → <b>${esc(r[1])}</b></span>`).join('') : '<span class="dim">(empty)</span>'}</div>`;
    }
  }

  function drawStack(f) {
    const rows = f.stack.slice().reverse();
    if (!rows.length) { q('stack').innerHTML = '<p class="dim" style="margin:0">(empty: no call is running)</p>'; return; }
    const shown = rows.slice(0, 12);
    q('stack').innerHTML = shown.map((id, i) => `<div class="srow ${i === 0 ? 'top' : ''}"><span>${esc(S.nodes[id].text)}</span><span class="dim">${i === 0 ? 'running' : 'waiting'}</span></div>`).join('') + (rows.length > 12 ? `<div class="srow dim">… ${rows.length - 12} more below</div>` : '');
  }

  function renderLegend() {
    const items = [['yellow', 'running now'], ['blue', 'waiting for a call it made'], ['green', 'returned (→ value)'], ['purple', 'answered from cache'], ['red', 'raised an error']];
    q('legend').innerHTML = items.map(([c, t]) => `<span><i style="background:var(--${c})"></i>${t}</span>`).join('');
  }

  function render() {
    const f = S.frames[S.idx]; if (!f) return;
    drawTree(f); drawExtra(f); drawStack(f);
    const m = q('msg'); m.textContent = f.msg || '';
    q('stats').innerHTML = `<span>Calls <b>${f.calls}</b> / ${S.nodes.filter(Boolean).length}</span><span>Depth <b>${f.depth}</b> (max ${f.maxDepth})</span><span>Repeated calls <b>${f.repeated}</b></span><span>Step <b>${S.idx + 1}</b> / ${S.frames.length}</span>`;
    q('scrub').value = String(S.idx);
    const end = S.idx === S.frames.length - 1, start = S.idx === 0;
    q('prev').disabled = start; q('first').disabled = start; q('next').disabled = end; q('last').disabled = end;
    highlightCode(f);
  }

  // ------------------------------------------------------------------ code
  const hit = (lineLabel, label) => !!label && lineLabel.split(' ').includes(label);
  function codeLines() {
    if (S.user) return S.user.source.lines.map((t, i) => [t, '', S.user.source.startLine + 1 + i]);
    return R.ALGOS[S.algo].code[S.lang].map((l, i) => [l[0], l[1], i + 1]);
  }
  function renderCode() {
    const bar = q('langBar');
    if (S.user) bar.innerHTML = `<span class="dim">Your function ${esc(S.user.name)}(${esc(S.user.argsText)}) · ${esc(S.user.file)}${S.user.dirty ? ' (unsaved changes included)' : ''}</span>`;
    else {
      bar.innerHTML = `<button id="rc_lcpp" class="${S.lang === 'cpp' ? 'on' : ''}">C++</button><button id="rc_lpy" class="${S.lang === 'py' ? 'on' : ''}">Python</button>`;
      q('lcpp').onclick = () => { S.lang = 'cpp'; renderCode(); };
      q('lpy').onclick = () => { S.lang = 'py'; renderCode(); };
    }
    q('code').innerHTML = codeLines().map(([t, , n]) => `<span class="row"><span class="ln">${n}</span>${esc(t) || ' '}</span>`).join('');
    highlightCode(S.frames[S.idx]);
  }
  function highlightCode(f) {
    if (!f) return;
    const lines = codeLines(), on = new Set();
    if (S.user) { if (f.ln) on.add(f.ln - 1 - S.user.source.startLine); }
    else lines.forEach((l, i) => { if (hit(l[1], f.label)) on.add(i); });
    let first = null;
    q('code').querySelectorAll('.row').forEach((r, i) => { const h = on.has(i); r.classList.toggle('hl', h); if (h && first === null) first = r; });
    if (first) { const b = q('code'), t = first.offsetTop, h = first.offsetHeight; if (t < b.scrollTop || t + h > b.scrollTop + b.clientHeight) b.scrollTop = Math.max(0, t - b.clientHeight / 3); }
  }
  function renderAbout() {
    const box = q('about');
    if (S.user) {
      box.innerHTML = `<h2>${esc(S.user.name)}(${esc(S.user.argsText)})</h2><p>This is your own function, called once with those arguments. Every call (including every recursive call) is a box, and a call's children are the calls it made. The highlighted line is where the call started or where it returned.</p>
        <p class="dim">A tree that is a long straight line means recursion that goes one level at a time; a bushy tree that repeats the same boxes is a hint to try caching.</p>`;
      return;
    }
    const a = R.ALGOS[S.algo];
    box.innerHTML = `<h2>${esc(a.name)}</h2><p>${esc(a.desc)}</p><table><tr><th>Time</th><th>Space</th></tr><tr><td>${a.cost.time}</td><td>${a.cost.space}</td></tr></table>`;
  }

  // --------------------------------------------------------------- stepping
  function go(i) { S.idx = Math.max(0, Math.min(S.frames.length - 1, i)); render(); }
  function play() {
    if (S.frames.length < 2) return;
    if (S.idx >= S.frames.length - 1) go(0);
    q('play').textContent = '❚❚ Pause';
    S.timer = setInterval(() => { if (S.idx >= S.frames.length - 1) { stop(); return; } go(S.idx + 1); }, DELAYS[S.speed - 1]);
  }
  function stop() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    if (S.built) q('play').textContent = '▶ Play';
  }
  AV.stopRc = stop;
  AV.setupRc = () => { if (!S.frames.length) setup(); };
  window.addEventListener('keydown', (e) => {
    if (AV.tab !== 'rc') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === 'ArrowRight') { stop(); go(S.idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); go(S.idx - 1); e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'BUTTON') { S.timer ? stop() : play(); e.preventDefault(); }
  });

  function banner(kind, text, detail) {
    const d = document.createElement('div');
    d.className = 'banner ' + (kind === 'info' ? '' : kind);
    d.innerHTML = `<p>${esc(text)}</p>${detail ? `<pre>${esc(detail)}</pre>` : ''}`;
    q('banners').appendChild(d);
  }
  function clearBanners() { if (S.built) q('banners').innerHTML = ''; }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'rc-running') {
      AV.show('rc'); if (!S.built) shell(); stop(); clearBanners();
      const d = document.createElement('div'); d.className = 'banner';
      d.innerHTML = `<span class="spin"></span>Calling ${esc(m.name)}(${esc(m.argsText)}) and recording every call… <button id="rc_cancel">Cancel</button>`;
      q('banners').appendChild(d); q('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
    } else if (m.type === 'rc-user') {
      stop(); AV.show('rc'); if (!S.built) shell(); S.user = m; setup();
    } else if (m.type === 'rc-error') {
      AV.show('rc'); if (!S.built) shell(); stop(); clearBanners(); banner('error', m.message, m.detail);
    }
  });
})();
