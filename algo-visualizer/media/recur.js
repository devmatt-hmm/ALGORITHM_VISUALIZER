/*
 * Recursion engine (window.Recur / module.exports).
 * Algorithms and user traces both produce EVENTS; framesFromEvents turns events into animation frames.
 *   {k:'call', id, parent, text, label?, msg?, extra?, memo?, ln?}
 *   {k:'note', label, msg, extra?}
 *   {k:'ret',  id, value, label?, msg?, extra?, memo?, err?, ln?}
 * Node status codes: 0 not yet called, 1 running, 2 waiting for a child, 3 returned, 4 answered from cache, 5 raised an error.
 */
(function (root) {
  'use strict';
  const L = (text, label) => [text, label || ''];

  class Rec {
    constructor() { this.events = []; this.stack = []; this.n = 0; }
    top() { return this.stack.length ? this.stack[this.stack.length - 1] : null; }
    call(text, o) {
      const id = this.n++;
      this.events.push(Object.assign({ k: 'call', id, parent: this.top(), text }, o || {}));
      this.stack.push(id); return id;
    }
    note(label, msg, extra) { this.events.push({ k: 'note', label, msg, extra }); }
    ret(id, value, msg, o) { this.stack.pop(); this.events.push(Object.assign({ k: 'ret', id, value: String(value), msg }, o || {})); }
  }

  // ----------------------------------------------------------------------- algorithms
  const pegsExtra = (p) => ({ type: 'pegs', pegs: { A: p.A.slice(), B: p.B.slice(), C: p.C.slice() } });

  const ALGOS = {
    fact: {
      id: 'fact', name: 'Factorial', params: [{ name: 'n', min: 0, max: 10, def: 5 }],
      cost: { time: 'O(n)', space: 'O(n) stack' },
      desc: 'n! = n × (n − 1)!. Each call waits for a smaller call, until n reaches 1 (the base case). Then the answers multiply back up the chain. Depth equals n, so the stack grows with n.',
      run(r, { n }) {
        const f = (k) => {
          const id = r.call(`fact(${k})`);
          if (k <= 1) { r.note('base', `n = ${k} ≤ 1: base case, no more calls.`); r.ret(id, 1, `fact(${k}) returns 1.`, { label: 'base' }); return 1; }
          r.note('rec', `n = ${k}: call fact(${k - 1}), then multiply its answer by ${k}.`);
          const sub = f(k - 1), v = k * sub;
          r.ret(id, v, `fact(${k}) returns ${k} × ${sub} = ${v}.`); return v;
        };
        return f(n);
      },
      code: {
        cpp: [L('long long fact(int n) {', 'enter'), L('  if (n <= 1) return 1;', 'base'), L('  return n * fact(n - 1);', 'rec ret'), L('}')],
        py: [L('def fact(n):', 'enter'), L('    if n <= 1:', 'base'), L('        return 1', 'base'), L('    return n * fact(n - 1)', 'rec ret')],
      },
    },
    fib: {
      id: 'fib', name: 'Fibonacci (plain)', params: [{ name: 'n', min: 0, max: 8, def: 5 }],
      cost: { time: 'O(2ⁿ)', space: 'O(n) stack' },
      desc: 'fib(n) = fib(n−1) + fib(n−2). Every call makes two more calls, so the tree explodes, and the same values are computed again and again. Watch the "repeated calls" counter, then compare with the memoized version.',
      run(r, { n }) {
        const f = (k) => {
          const id = r.call(`fib(${k})`);
          if (k < 2) { r.note('base', `n = ${k} < 2: base case, return ${k}.`); r.ret(id, k, `fib(${k}) returns ${k}.`, { label: 'base' }); return k; }
          r.note('rec', `fib(${k}) needs fib(${k - 1}) and fib(${k - 2}): two recursive calls.`);
          const a = f(k - 1), b = f(k - 2);
          r.ret(id, a + b, `fib(${k}) returns ${a} + ${b} = ${a + b}.`); return a + b;
        };
        return f(n);
      },
      code: {
        cpp: [L('int fib(int n) {', 'enter'), L('  if (n < 2) return n;', 'base'), L('  return fib(n - 1) + fib(n - 2);', 'rec ret'), L('}')],
        py: [L('def fib(n):', 'enter'), L('    if n < 2:', 'base'), L('        return n', 'base'), L('    return fib(n - 1) + fib(n - 2)', 'rec ret')],
      },
    },
    fibMemo: {
      id: 'fibMemo', name: 'Fibonacci (memoized)', params: [{ name: 'n', min: 0, max: 12, def: 6 }],
      cost: { time: 'O(n)', space: 'O(n)' },
      desc: 'Same recurrence, but every answer is saved in a memo table. A purple call is answered straight from the table without recursing, so the tree shrinks from exponential to linear. This is the idea behind dynamic programming.',
      run(r, { n }) {
        const memo = new Map();
        const table = () => ({ type: 'table', title: 'memo table (n → fib(n))', rows: [...memo.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, v]) });
        const f = (k) => {
          const id = r.call(`fib(${k})`, { extra: table() });
          if (k < 2) { r.note('base', `n = ${k} < 2: base case, return ${k}.`); r.ret(id, k, `fib(${k}) returns ${k}.`, { label: 'base' }); return k; }
          if (memo.has(k)) { r.note('memo', `fib(${k}) is already in the memo table (${memo.get(k)}): return it without recursing.`); r.ret(id, memo.get(k), `fib(${k}) returns ${memo.get(k)} from the cache.`, { memo: true, label: 'memo' }); return memo.get(k); }
          r.note('rec', `fib(${k}) is not cached yet: compute fib(${k - 1}) and fib(${k - 2}).`);
          const a = f(k - 1), b = f(k - 2);
          memo.set(k, a + b);
          r.ret(id, a + b, `fib(${k}) = ${a} + ${b} = ${a + b}. Saved in the memo table.`, { extra: table() }); return a + b;
        };
        return f(n);
      },
      code: {
        cpp: [L('map<int, long long> memo;'), L('long long fib(int n) {', 'enter'), L('  if (n < 2) return n;', 'base'), L('  if (memo.count(n)) return memo[n];', 'memo'),
          L('  return memo[n] = fib(n - 1) + fib(n - 2);', 'rec ret'), L('}')],
        py: [L('memo = {}'), L('def fib(n):', 'enter'), L('    if n < 2:', 'base'), L('        return n', 'base'), L('    if n in memo:', 'memo'), L('        return memo[n]', 'memo'),
          L('    memo[n] = fib(n - 1) + fib(n - 2)', 'rec ret'), L('    return memo[n]', 'ret')],
      },
    },
    hanoi: {
      id: 'hanoi', name: 'Tower of Hanoi', params: [{ name: 'n', min: 1, max: 4, def: 3 }],
      cost: { time: 'O(2ⁿ)', space: 'O(n) stack' },
      desc: 'Move n disks from A to C, never putting a bigger disk on a smaller one. Recursive idea: move the n−1 top disks out of the way (to B), move the biggest disk, then move the n−1 disks on top of it. It takes 2ⁿ − 1 moves.',
      run(r, { n }) {
        const pegs = { A: Array.from({ length: n }, (_, i) => n - i), B: [], C: [] };
        let moves = 0;
        const mv = (a, c) => { const d = pegs[a].pop(); pegs[c].push(d); moves++; return d; };
        const f = (k, a, c, b, first) => {
          const id = r.call(`hanoi(${k}, ${a}→${c})`, first ? { extra: pegsExtra(pegs) } : {});
          const before = moves;
          if (k === 1) {
            r.note('base', `Only one disk: no recursion needed.`);
            const d = mv(a, c); r.note('move1', `Move disk ${d} from ${a} to ${c}.`, pegsExtra(pegs));
          } else {
            r.note('rec', `Step 1: move the top ${k - 1} disk${k > 2 ? 's' : ''} from ${a} to ${b}, out of the way.`);
            f(k - 1, a, b, c);
            const d = mv(a, c); r.note('move', `Step 2: move disk ${d} from ${a} to ${c}.`, pegsExtra(pegs));
            r.note('rec2', `Step 3: move the ${k - 1} disk${k > 2 ? 's' : ''} from ${b} onto ${c}.`);
            f(k - 1, b, c, a);
          }
          r.ret(id, moves - before, `hanoi(${k}, ${a}→${c}) is done after ${moves - before} move${moves - before === 1 ? '' : 's'}.`, k === 1 ? { label: 'move1' } : {});
        };
        f(n, 'A', 'C', 'B', true);
        return moves;
      },
      code: {
        cpp: [L('int hanoi(int n, char from, char to, char via) {', 'enter'), L('  if (n == 1) {', 'base'), L('    cout << "disk 1: " << from << "->" << to;', 'move1'), L('    return 1;', 'move1'),
          L('  }'), L('  int a = hanoi(n - 1, from, via, to);', 'rec'), L('  cout << "disk " << n << ": " << from << "->" << to;', 'move'),
          L('  int b = hanoi(n - 1, via, to, from);', 'rec2'), L('  return a + b + 1;', 'ret'), L('}')],
        py: [L('def hanoi(n, src, dst, via):', 'enter'), L('    if n == 1:', 'base'), L('        print("disk 1:", src, "->", dst)', 'move1'), L('        return 1', 'move1'),
          L('    a = hanoi(n - 1, src, via, dst)', 'rec'), L('    print("disk", n, ":", src, "->", dst)', 'move'), L('    b = hanoi(n - 1, via, dst, src)', 'rec2'), L('    return a + b + 1', 'ret')],
      },
    },
    gcd: {
      id: 'gcd', name: 'GCD (Euclid)', params: [{ name: 'a', min: 0, max: 999, def: 48 }, { name: 'b', min: 0, max: 999, def: 18 }],
      cost: { time: 'O(log min(a,b))', space: 'O(log n) stack' },
      desc: 'gcd(a, b) = gcd(b, a mod b) until b is 0. Each call makes exactly one more call, so the tree is a straight line (a "tail" recursion), and the numbers shrink fast.',
      run(r, { a, b }) {
        const f = (x, y) => {
          const id = r.call(`gcd(${x}, ${y})`);
          if (y === 0) { r.note('base', `b = 0: the answer is a = ${x}.`); r.ret(id, x, `gcd(${x}, ${y}) returns ${x}.`, { label: 'base' }); return x; }
          r.note('rec', `${x} mod ${y} = ${x % y}, so call gcd(${y}, ${x % y}).`);
          const v = f(y, x % y);
          r.ret(id, v, `gcd(${x}, ${y}) returns ${v} (the same answer is passed back up).`); return v;
        };
        return f(a, b);
      },
      code: {
        cpp: [L('int gcd(int a, int b) {', 'enter'), L('  if (b == 0) return a;', 'base'), L('  return gcd(b, a % b);', 'rec ret'), L('}')],
        py: [L('def gcd(a, b):', 'enter'), L('    if b == 0:', 'base'), L('        return a', 'base'), L('    return gcd(b, a % b)', 'rec ret')],
      },
    },
    power: {
      id: 'power', name: 'Fast power', params: [{ name: 'base', min: 1, max: 9, def: 2 }, { name: 'exp', min: 0, max: 12, def: 10 }],
      cost: { time: 'O(log exp)', space: 'O(log exp) stack' },
      desc: 'base^exp by halving the exponent: base^e = (base^(e/2))², times one more base if e is odd. Only about log₂(e) calls instead of e multiplications.',
      run(r, { base, exp }) {
        const f = (e) => {
          const id = r.call(`power(${base}, ${e})`);
          if (e === 0) { r.note('base', 'exp = 0: anything to the power 0 is 1.'); r.ret(id, 1, `power(${base}, 0) returns 1.`, { label: 'base' }); return 1; }
          r.note('rec', `Compute half = power(${base}, ${Math.floor(e / 2)}) first.`);
          const half = f(Math.floor(e / 2));
          const v = e % 2 === 0 ? half * half : half * half * base;
          r.ret(id, v, e % 2 === 0 ? `exp is even: ${half} × ${half} = ${v}.` : `exp is odd: ${half} × ${half} × ${base} = ${v}.`); return v;
        };
        return f(exp);
      },
      code: {
        cpp: [L('long long power(int b, int e) {', 'enter'), L('  if (e == 0) return 1;', 'base'), L('  long long half = power(b, e / 2);', 'rec'), L('  if (e % 2 == 0) return half * half;', 'ret'), L('  return half * half * b;', 'ret'), L('}')],
        py: [L('def power(b, e):', 'enter'), L('    if e == 0:', 'base'), L('        return 1', 'base'), L('    half = power(b, e // 2)', 'rec'), L('    if e % 2 == 0:', 'ret'), L('        return half * half', 'ret'), L('    return half * half * b', 'ret')],
      },
    },
  };
  const ORDER = ['fact', 'fib', 'fibMemo', 'hanoi', 'gcd', 'power'];

  function validate(id, raw) {
    const a = ALGOS[id], p = {};
    for (const d of a.params) {
      const t = String(raw[d.name] === undefined ? '' : raw[d.name]).trim();
      if (!/^\d+$/.test(t)) return { error: `${d.name} must be a whole number from ${d.min} to ${d.max}.` };
      const v = parseInt(t, 10);
      if (v < d.min || v > d.max) return { error: `${d.name} must be between ${d.min} and ${d.max} (bigger values make the tree too large to draw).` };
      p[d.name] = v;
    }
    if (id === 'gcd' && p.a === 0 && p.b === 0) return { error: 'gcd(0, 0) is not defined: pick at least one number above 0.' };
    return { params: p };
  }

  function build(id, params) {
    const r = new Rec();
    const result = ALGOS[id].run(r, params);
    return { events: r.events, result, frames: framesFromEvents(r.events, { result: String(result) }) };
  }

  // -------------------------------------------------------------------- events -> frames
  function framesFromEvents(events, o) {
    o = o || {};
    const nodes = [], st = [], val = [], stack = [], frames = [], seen = new Map();
    let cur = null, extra = null, calls = 0, repeated = 0, maxDepth = 0;
    const snap = (label, msg, ln) => frames.push({
      created: nodes.length, cur, stack: stack.slice(), st: st.slice(), val: val.slice(), label: label || '', msg, ln: ln || null, extra,
      calls, depth: stack.length, maxDepth, repeated,
    });
    for (const e of events) {
      if (e.k === 'call') {
        nodes[e.id] = { id: e.id, parent: e.parent === undefined ? null : e.parent, text: e.text };
        st[e.id] = 1; val[e.id] = null;
        if (stack.length) st[stack[stack.length - 1]] = 2;
        stack.push(e.id); cur = e.id; calls++; maxDepth = Math.max(maxDepth, stack.length);
        const c = seen.get(e.text) || 0; if (c > 0) repeated++; seen.set(e.text, c + 1);
        if (e.extra) extra = e.extra;
        snap(e.label || 'enter', e.msg || `Call ${e.text}.`, e.ln);
      } else if (e.k === 'note') {
        if (e.extra) extra = e.extra;
        snap(e.label, e.msg, null);
      } else if (e.k === 'ret') {
        st[e.id] = e.err ? 5 : e.memo ? 4 : 3; val[e.id] = e.value;
        const i = stack.lastIndexOf(e.id); if (i >= 0) stack.splice(i, 1);
        cur = e.id;
        if (stack.length) st[stack[stack.length - 1]] = 1;
        if (e.extra) extra = e.extra;
        snap(e.label || 'ret', e.msg || `${nodes[e.id].text} returns ${e.value}.`, e.ln);
      }
    }
    if (!frames.length) { snap('', o.empty || 'Nothing was called.'); }
    else {
      const rootId = nodes.findIndex((n) => n && n.parent === null);
      const unfinished = stack.length > 0;
      cur = unfinished ? cur : (rootId >= 0 ? rootId : cur);
      snap('done', o.final || (unfinished ? 'Recording stopped before the function finished.' : `Done: ${nodes[rootId].text} = ${val[rootId]}${o.result !== undefined && o.result !== val[rootId] ? '' : ''}.`));
    }
    return frames;
  }

  // ---------------------------------------------------------------------- tree layout
  /** nodes: [{id, parent}] (ids 0..n-1, parents created before children). Returns {x (leaf units), depth, width, height}. */
  function layoutTree(nodes) {
    const n = nodes.length, kids = Array.from({ length: n }, () => []), depth = new Array(n).fill(0), x = new Array(n).fill(0);
    const roots = [];
    nodes.forEach((nd) => { if (!nd) return; if (nd.parent === null || nd.parent === undefined) roots.push(nd.id); else { kids[nd.parent].push(nd.id); depth[nd.id] = depth[nd.parent] + 1; } });
    let leaf = 0;
    const visit = (rootId) => { // iterative post-order
      const stk = [[rootId, 0]];
      while (stk.length) {
        const top = stk[stk.length - 1], id = top[0], ch = kids[id];
        if (top[1] < ch.length) { stk.push([ch[top[1]++], 0]); continue; }
        x[id] = ch.length ? (x[ch[0]] + x[ch[ch.length - 1]]) / 2 : leaf++;
        stk.pop();
      }
    };
    roots.forEach(visit);
    return { x, depth, width: Math.max(1, leaf), height: n ? Math.max(...depth) + 1 : 1 };
  }

  const api = { Rec, ALGOS, ORDER, build, validate, framesFromEvents, layoutTree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Recur = api;
})(typeof window !== 'undefined' ? window : globalThis);
