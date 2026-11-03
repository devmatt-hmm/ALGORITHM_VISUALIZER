(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  window.AV = window.AV || {};
  window.AV.vscode = vscode; window.AV.tab = window.AV.tab || 'algo';
  const A = window.Algos;
  const app = document.getElementById('algoView');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DELAYS = [800, 600, 450, 320, 220, 150, 100, 60, 35, 15];

  const S = {
    algo: 'bubble', arr: [], target: 1, size: 16, preset: 'random', frames: [], idx: 0, timer: null, speed: 5,
    lang: 'cpp', user: null, trusted: true, running: null, notice: '',
  };

  // ---------------------------------------------------------------- shell
  function shell() {
    const opts = (g) => A.ORDER.filter((id) => A.ALGOS[id].group === g).map((id) => `<option value="${id}">${esc(A.ALGOS[id].name)}</option>`).join('');
    app.innerHTML = `
      <div class="toolbar" id="toolbar">
        <label>Algorithm
          <select id="algo"><optgroup label="Sorting">${opts('sort')}</optgroup><optgroup label="Searching">${opts('search')}</optgroup></select></label>
        <span id="arrayTools" class="toolbar" style="margin:0">
          <label>Size <input id="size" type="range" min="5" max="50" value="${S.size}"><span id="sizeV">${S.size}</span></label>
          <select id="preset" aria-label="Array type">
            <option value="random">Random</option><option value="nearly">Nearly sorted</option><option value="reversed">Reversed</option><option value="few">Few unique</option></select>
          <button id="newArr">New array</button>
          <input id="custom" type="text" placeholder="or type: 5, 2, 9, 1" aria-label="Custom array"><button id="useCustom">Use</button>
          <label id="targetWrap" hidden>Target <input id="target" type="text" value="${S.target}" aria-label="Search target"></label>
        </span>
        <span id="userTools" hidden class="toolbar" style="margin:0"><button id="goto">Go to code</button><button id="rerun">Re-run</button><button id="leave">Back to demos</button></span>
        <span class="err" id="inputErr" role="alert"></span>
      </div>
      <div id="banners"></div>
      <div class="grid">
        <div>
          <section class="card">
            <div class="bars" id="bars" role="img" aria-label="Bar chart of the array"></div>
            <div class="legend" id="legend"></div>
            <div class="controls">
              <button id="first" aria-label="First step" title="First step">⏮</button>
              <button id="prev" aria-label="Previous step" title="Previous (←)">◀</button>
              <button id="play" class="primary" aria-label="Play" title="Play / pause (space)">▶ Play</button>
              <button id="next" aria-label="Next step" title="Next (→)">▶</button>
              <button id="last" aria-label="Last step" title="Last step">⏭</button>
              <input id="scrub" type="range" min="0" max="0" value="0" aria-label="Step">
              <label>Speed <input id="speed" class="speed" type="range" min="1" max="10" value="${S.speed}" aria-label="Speed"></label>
            </div>
            <div class="msg" id="msg" aria-live="polite"></div>
            <div class="stats" id="stats"></div>
          </section>
        </div>
        <div>
          <section class="card"><div class="lang" id="langBar"></div><pre class="code" id="code"></pre></section>
          <section class="card about" id="about"></section>
        </div>
      </div>`;
    $('algo').value = S.algo;
    $('preset').value = S.preset;
    $('algo').onchange = (e) => { if (e.target.value === 'user') return; stop(); S.user = null; S.algo = e.target.value; clearNotice(); rebuild(); };
    $('size').oninput = (e) => { $('sizeV').textContent = e.target.value; };
    $('size').onchange = (e) => { S.size = Number(e.target.value); newArray(); };
    $('preset').onchange = (e) => { S.preset = e.target.value; newArray(); };
    $('newArr').onclick = newArray;
    const applyCustom = () => {
      const r = parseArray($('custom').value);
      if (r.error) { $('inputErr').textContent = r.error; return; }
      $('inputErr').textContent = ''; stop(); S.user = null; S.arr = r.array; S.size = r.array.length;
      $('size').value = String(Math.min(50, S.size)); $('sizeV').textContent = String(S.size);
      pickTarget(); rebuild();
    };
    $('useCustom').onclick = applyCustom;
    $('custom').onkeydown = (e) => { if (e.key === 'Enter') applyCustom(); };
    $('target').onchange = (e) => {
      const t = String(e.target.value).trim();
      if (!/^-?\d+$/.test(t)) { $('inputErr').textContent = 'The target must be a whole number.'; return; }
      $('inputErr').textContent = ''; S.target = parseInt(t, 10); stop(); rebuild();
    };
    $('first').onclick = () => { stop(); go(0); };
    $('prev').onclick = () => { stop(); go(S.idx - 1); };
    $('next').onclick = () => { stop(); go(S.idx + 1); };
    $('last').onclick = () => { stop(); go(S.frames.length - 1); };
    $('play').onclick = () => (S.timer ? stop() : play());
    $('scrub').oninput = (e) => { stop(); go(Number(e.target.value)); };
    $('speed').oninput = (e) => { S.speed = Number(e.target.value); if (S.timer) { stop(); play(); } };
    $('goto').onclick = () => vscode.postMessage({ type: 'reveal', view: 'algo', line: S.user ? S.user.source.startLine : 0 });
    $('rerun').onclick = () => vscode.postMessage({ type: 'rerun' });
    $('leave').onclick = () => { stop(); S.user = null; clearNotice(); rebuild(); };
  }

  function parseArray(s) {
    const cleaned = String(s).replace(/[[\](){}]/g, ' ').trim();
    if (!cleaned) return { error: 'Type some whole numbers separated by commas, e.g. 5, 2, 9, 1.' };
    const parts = cleaned.split(/[,;\s]+/).filter(Boolean);
    const bad = parts.find((p) => !/^-?\d+$/.test(p));
    if (bad !== undefined) return { error: `"${bad}" is not a whole number. Use integers separated by commas.` };
    const nums = parts.map(Number);
    if (nums.some((n) => Math.abs(n) > 99999)) return { error: 'Keep the numbers between -99999 and 99999.' };
    if (nums.length < 2) return { error: 'Give at least 2 numbers.' };
    if (nums.length > 60) return { error: `Give at most 60 numbers (you gave ${nums.length}).` };
    return { array: nums };
  }

  function newArray() {
    stop(); S.user = null; S.arr = A.makeArray(S.size, S.preset); $('inputErr').textContent = ''; pickTarget(); rebuild();
  }
  function pickTarget() {
    const hit = Math.random() < 0.75;
    S.target = hit ? S.arr[Math.floor(Math.random() * S.arr.length)] : Math.max(...S.arr) + 1;
    $('target').value = String(S.target);
  }

  // --------------------------------------------------------------- frames
  function rebuild() {
    if (!S.user) { const uo = $('algo').querySelector('option[value="user"]'); if (uo) uo.remove(); }
    $('algo').value = S.user ? 'user' : S.algo;
    const user = S.user;
    $('arrayTools').hidden = !!user; $('userTools').hidden = !user;
    $('targetWrap').hidden = !(!user && A.ALGOS[S.algo].group === 'search');
    clearBanners();
    if (S.notice) banner('info', S.notice);
    if (user) {
      const t = user.trace;
      S.frames = A.fromEvents(t.initial, t.events, { mode: user.mode, final: t.final, retInt: t.retInt, returned: t.returned, truncated: t.truncated, maxEvents: t.events.length });
      (t.notes || []).forEach((n) => banner('warn', n));
    } else {
      if (!S.arr.length) { S.arr = A.makeArray(S.size, S.preset); pickTarget(); }
      let arr = S.arr;
      const algo = A.ALGOS[S.algo];
      if (algo.needsSorted && !A.isSorted(arr)) { arr = arr.slice().sort((x, y) => x - y); banner('info', 'Binary search needs a sorted array, so the array was sorted first.'); }
      S.frames = A.build(S.algo, arr, S.target);
    }
    buildBars(S.frames[0].a);
    renderLegend(); renderCode(); renderAbout();
    $('scrub').max = String(S.frames.length - 1);
    go(0);
  }

  function banner(kind, text, detail) {
    const d = document.createElement('div');
    d.className = 'banner ' + (kind === 'info' ? '' : kind);
    d.innerHTML = `<p>${esc(text)}</p>${detail ? `<pre>${esc(detail)}</pre>` : ''}`;
    $('banners').appendChild(d);
  }
  function clearBanners() { $('banners').innerHTML = ''; }
  function clearNotice() { S.notice = ''; }

  // ----------------------------------------------------------------- bars
  let bars = [], vmin = 0, vmax = 1;
  function buildBars(a) {
    const el = $('bars');
    el.classList.toggle('many', a.length > 24);
    vmin = Math.min(...a); vmax = Math.max(...a);
    el.innerHTML = a.map(() => '<div class="bar"><span class="v"></span></div>').join('');
    bars = [...el.children];
  }
  const pct = (v) => 6 + 94 * (Math.max(vmin, Math.min(vmax, v)) - vmin) / ((vmax - vmin) || 1);

  function renderLegend() {
    const items = [['yellow', 'comparing'], ['orange', 'swapped'], ['purple', 'written'], ['blue', 'pivot / middle'], ['green', 'sorted / found']];
    $('legend').innerHTML = items.map(([c, t]) => `<span><i style="background:var(--${c})"></i>${t}</span>`).join('');
  }

  function renderFrame(f) {
    const hi = f.hi || {};
    const inSet = (k, i) => hi[k] && hi[k].includes(i);
    bars.forEach((b, i) => {
      const v = f.a[i];
      b.style.height = pct(v) + '%';
      b.firstChild.textContent = v;
      let cls = 'bar';
      if (inSet('found', i)) cls += ' found';
      else if (inSet('swap', i)) cls += ' swap';
      else if (inSet('set', i)) cls += ' set';
      else if (inSet('cmp', i)) cls += ' cmp';
      else if (inSet('mid', i)) cls += ' mid';
      else if (f.pivot === i) cls += ' pivot';
      else if (f.done.includes(i)) cls += ' done';
      if (f.range && (i < f.range[0] || i > f.range[1])) cls += ' out';
      b.className = cls;
    });
    const showSwaps = S.user ? true : A.ALGOS[S.algo].group === 'sort';
    $('msg').innerHTML = esc(f.msg) + (f.hold !== null && f.hold !== undefined ? `<span class="hold">key = ${f.hold}</span>` : '');
    $('stats').innerHTML = `<span>Comparisons <b>${f.c.cmp}</b></span>` +
      (showSwaps ? `<span>Swaps <b>${f.c.swap}</b></span><span>Writes <b>${f.c.set}</b></span>` : '') +
      `<span>Step <b>${S.idx + 1}</b> / ${S.frames.length}</span>`;
    highlightCode(f);
  }

  // ----------------------------------------------------------------- code
  function codeLines() {
    if (S.user) return S.user.source.lines.map((t, i) => [t, '', S.user.source.startLine + 1 + i]);
    return A.ALGOS[S.algo].code[S.lang].map((l, i) => [l[0], l[1], i + 1]);
  }
  function renderCode() {
    const bar = $('langBar');
    if (S.user) bar.innerHTML = `<span class="dim">Your function ${esc(S.user.name)}() · ${esc(S.user.file)}${S.user.dirty ? ' (unsaved changes included)' : ''}</span>`;
    else {
      bar.innerHTML = `<button id="lcpp" class="${S.lang === 'cpp' ? 'on' : ''}">C++</button><button id="lpy" class="${S.lang === 'py' ? 'on' : ''}">Python</button>`;
      $('lcpp').onclick = () => { S.lang = 'cpp'; renderCode(); highlightCode(S.frames[S.idx]); };
      $('lpy').onclick = () => { S.lang = 'py'; renderCode(); highlightCode(S.frames[S.idx]); };
    }
    $('code').innerHTML = codeLines().map(([t, , n], i) => `<span class="row" data-i="${i}"><span class="ln">${n}</span>${esc(t) || ' '}</span>`).join('');
  }
  function highlightCode(f) {
    if (!f) return;
    const lines = codeLines();
    const hit = new Set();
    if (S.user) { if (f.ln) { const i = f.ln - 1 - S.user.source.startLine; if (i >= 0 && i < lines.length) hit.add(i); } }
    else if (f.label) lines.forEach((l, i) => { if (l[1] === f.label) hit.add(i); });
    let first = null;
    $('code').querySelectorAll('.row').forEach((r, i) => { const on = hit.has(i); r.classList.toggle('hl', on); if (on && first === null) first = r; });
    if (first) { const box = $('code'); const top = first.offsetTop, h = first.offsetHeight; if (top < box.scrollTop || top + h > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 3); }
  }

  function renderAbout() {
    const box = $('about');
    if (S.user) {
      box.innerHTML = `<h2>${esc(S.user.name)}()</h2><p>This is your own code, run once on <code>${esc(JSON.stringify(S.user.trace.initial))}</code>${S.user.mode === 'search' ? ` looking for <code>${esc(S.user.target)}</code>` : ''}. Every comparison and every write to the list becomes one step.</p>
        <p class="dim">Tip: use ◀ to step back and see exactly which line did something unexpected.</p>`;
      return;
    }
    const a = A.ALGOS[S.algo], i = a.info;
    box.innerHTML = `<h2>${esc(a.name)}</h2><p>${esc(a.desc)}</p>
      <table><tr><th>Best</th><th>Average</th><th>Worst</th><th>Extra space</th><th>${a.group === 'sort' ? 'Stable' : ''}</th></tr>
      <tr><td>${i.best}</td><td>${i.avg}</td><td>${i.worst}</td><td>${i.space}</td><td>${a.group === 'sort' ? i.stable : ''}</td></tr></table>`;
  }

  // ------------------------------------------------------------- stepping
  function go(i) {
    S.idx = Math.max(0, Math.min(S.frames.length - 1, i));
    $('scrub').value = String(S.idx);
    renderFrame(S.frames[S.idx]);
    const end = S.idx === S.frames.length - 1, start = S.idx === 0;
    $('prev').disabled = start; $('first').disabled = start; $('next').disabled = end; $('last').disabled = end;
  }
  function play() {
    if (S.idx >= S.frames.length - 1) go(0);
    $('play').textContent = '❚❚ Pause';
    S.timer = setInterval(() => { if (S.idx >= S.frames.length - 1) { stop(); return; } go(S.idx + 1); }, DELAYS[S.speed - 1]);
  }
  function stop() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    const p = $('play'); if (p) p.textContent = '▶ Play';
  }

  window.addEventListener('keydown', (e) => {
    if (window.AV.tab !== 'algo') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === 'ArrowRight') { stop(); go(S.idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); go(S.idx - 1); e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'BUTTON') { S.timer ? stop() : play(); e.preventDefault(); }
  });

  // ------------------------------------------------------------- messages
  function addUserOption() {
    const sel = $('algo');
    let o = sel.querySelector('option[value="user"]');
    if (!o) { o = document.createElement('option'); o.value = 'user'; sel.insertBefore(o, sel.firstChild); }
    o.textContent = `My function: ${S.user.name}()`;
  }
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'init') { S.trusted = m.trusted; }
    else if (m.type === 'running') { if (window.AV.show) window.AV.show('algo'); stop(); clearBanners();
      const d = document.createElement('div'); d.className = 'banner';
      d.innerHTML = `<span class="spin"></span>Running ${esc(m.name)}() to record every step… <button id="cancel">Cancel</button>`;
      $('banners').appendChild(d); $('cancel').onclick = () => vscode.postMessage({ type: 'cancel' }); }
    else if (m.type === 'user') {
      stop(); if (window.AV.show) window.AV.show('algo'); S.user = m; addUserOption(); rebuild();
    } else if (m.type === 'user-error') {
      stop(); if (window.AV.show) window.AV.show('algo'); clearBanners(); banner('error', m.message, m.detail);
      if (S.user) { /* keep showing the previous trace */ }
    }
  });

  window.AV.stopAlgo = stop;
  shell();
  S.arr = A.makeArray(S.size, S.preset); pickTarget();
  rebuild();
  vscode.postMessage({ type: 'ready' });
})();
