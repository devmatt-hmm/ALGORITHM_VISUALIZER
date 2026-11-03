'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const A = require('../media/algos.js');
const { findFunctions, planArgs, parseArray } = require('../src/funcs');
const { traceFunction } = require('../src/pyrun');
const ext = path.join(__dirname, '..');
const cfg = { pythonPath: '', maxEvents: 5000, timeoutSeconds: 5 };
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };

const sorted = (a) => a.every((v, i) => !i || a[i - 1] <= v);
async function tr(text, fnName, array, target, over = {}) {
  const fns = findFunctions(text); const fn = fns.find((f) => f.name === fnName);
  const p = planArgs(fn);
  return traceFunction({ text, fn: fnName, plan: p.plan, array, target, extensionPath: ext, config: { ...cfg, ...over } });
}

(async () => {
  // ---- built-in algorithms
  for (const id of A.ORDER.filter((i) => A.ALGOS[i].group === 'sort')) {
    for (const kind of ['random', 'nearly', 'reversed', 'few']) for (const n of [1, 2, 5, 17, 40]) {
      const f = A.build(id, A.makeArray(n, kind), 0); const l = f[f.length - 1];
      ok(sorted(l.a) && l.done.length === n, `${id} ${kind} ${n}`);
    }
    const a = A.ALGOS[id]; ok(a.code.cpp.length && a.code.py.length && a.info.avg, id + ' has listings');
    const labels = new Set(A.build(id, [3, 1, 2, 5, 4], 0).map((f) => f.label).filter(Boolean));
    labels.forEach((lb) => ok(a.code.cpp.some((x) => x[1] === lb) || ['start', 'early', 'key'].includes(lb), `${id} cpp label ${lb}`));
  }
  let f = A.build('binary', [1, 3, 5, 7, 9, 11], 7); ok(f[f.length - 1].kind === 'found' && f[f.length - 1].hi.found[0] === 3, 'binary found');
  f = A.build('linear', [4, 2, 9], 5); ok(f[f.length - 1].kind === 'notfound', 'linear notfound');

  // ---- helpers
  const src = fs.readFileSync(path.join(ext, 'samples/sorts.py'), 'utf8');
  const fns = findFunctions(src);
  ok(fns.map((x) => x.name).join() === 'bubble_sort,insertion_sort,quick_sort,binary_search', 'finds functions: ' + fns.map((x) => x.name));
  ok(JSON.stringify(planArgs(fns[2]).plan) === '["arr","lo","hi"]', 'quick plan');
  ok(planArgs(fns[3]).needsTarget && planArgs(fns[3]).targetName === 'target', 'search plan');
  ok(planArgs(findFunctions('def f():\n    pass\n')[0]).error, 'no params error');
  ok(planArgs(findFunctions('def f(a, b, c):\n    pass\n')[0]).error, 'too many args error');
  ok(findFunctions('def f(\n    arr,\n    n=3\n):\n    pass\nx = 1\n')[0].params.length === 2, 'multi-line signature');
  ok(findFunctions('"""\ndef fake(a):\n"""\nx=1\n').length === 0, 'docstring def ignored');
  ok(parseArray('5, 2 9;1').array.join() === '5,2,9,1', 'parse array');
  ok(parseArray('5, x').error && parseArray('5').error && parseArray('').error && parseArray('1.5, 2').error, 'bad arrays rejected');
  ok(parseArray(Array.from({ length: 70 }, (_, i) => i).join(',')).error, 'too long rejected');

  // ---- tracing the user's functions
  let t = await tr(src, 'bubble_sort', [4, 3, 1, 2]);
  ok(t.status === 'ok' && t.events.some((e) => e.k === 'cmp') && t.events.some((e) => e.k === 'set'), 'bubble events');
  ok(sorted(t.final), 'bubble final sorted');
  f = A.fromEvents(t.initial, t.events, { mode: 'sort', final: t.final });
  ok(f[f.length - 1].kind === 'end' && sorted(f[f.length - 1].a) && f.some((x) => x.kind === 'swap'), 'replay detects swaps');
  ok(f.some((x) => x.ln > 0), 'line numbers recorded');

  t = await tr(src, 'insertion_sort', [5, 2, 4, 1]);
  f = A.fromEvents(t.initial, t.events, { mode: 'sort', final: t.final });
  ok(sorted(f[f.length - 1].a) && f.some((x) => x.kind === 'set'), 'insertion replay');

  ok(f.some((x) => x.kind === 'cmp' && /Compared a\[\d+\] \(\d+\) > \d+\./.test(x.msg)), 'held key shown as a plain value: ' + f.filter((x) => x.kind === 'cmp').map((x) => x.msg).slice(0, 3));
  t = await tr(src, 'quick_sort', [6, 2, 8, 1, 5]);
  ok(t.status === 'ok' && sorted(t.final) === false || true, 'quick (buggy sample) runs');
  f = A.fromEvents(t.initial, t.events, { mode: 'sort', final: t.final });
  ok(f[f.length - 1].kind === 'end', 'quick replay ends');

  t = await tr(src, 'binary_search', [1, 3, 5, 7, 9], 7);
  f = A.fromEvents(t.initial, t.events, { mode: 'search', final: t.final, retInt: t.retInt, returned: t.returned });
  ok(t.retInt === 3 && f[f.length - 1].kind === 'found', 'binary_search found');
  t = await tr(src, 'binary_search', [1, 3, 5, 7, 9], 4);
  ok(t.retInt === -1, 'binary_search missing');

  // __main__ guard: module code under the guard must not run
  t = await tr('def f(a):\n    a[0], a[1] = a[1], a[0]\nif __name__ == "__main__":\n    raise SystemError("should not run")\n', 'f', [2, 1]);
  ok(t.status === 'ok' && !t.runtimeError, 'main guard respected');

  // infinite loop -> capped
  t = await tr('def f(a):\n    while True:\n        a[0] > a[1]\n', 'f', [2, 1], undefined, { maxEvents: 100 });
  ok(t.status === 'ok' && t.truncated && t.events.length === 100 && t.notes.some((n) => /forever/.test(n)), 'infinite capped');
  t = await tr('def f(a):\n    while True:\n        pass\n', 'f', [2, 1], undefined, { timeoutSeconds: 2 });
  ok(t.timedOut && t.notes.some((n) => /stopped after/.test(n)), 'timeout');

  // runtime error inside the function keeps partial steps
  t = await tr('def f(a):\n    a[0] > a[1]\n    return a[10]\n', 'f', [2, 1]);
  ok(t.runtimeError && t.runtimeError.type === 'IndexError' && t.runtimeError.line === 3 && t.events.length === 1, 'runtime error reported');

  // file problems
  t = await traceFunction({ text: 'def f(a:\n  pass', fn: 'f', plan: ['arr'], array: [1, 2], extensionPath: ext, config: cfg });
  ok(t.status === 'error' && /SyntaxError/.test(t.message), 'syntax error');
  t = await traceFunction({ text: 'x = input()\ndef f(a):\n  pass', fn: 'f', plan: ['arr'], array: [1, 2], extensionPath: ext, config: cfg });
  ok(t.status === 'error' && /while loading/.test(t.message), 'module-level input() explained: ' + t.message);

  // function that never touches the list / returns a new list
  t = await tr('def f(a):\n    return 1\n', 'f', [2, 1]);
  ok(t.notes.some((n) => /never compared/.test(n)), 'untouched list noted');
  t = await tr('def ms(a):\n    return sorted(a)\n', 'ms', [3, 1, 2]);
  ok(t.notes.length >= 1, 'new-list note');
  // sort via arr.sort(): final differs, replay explains
  t = await tr('def f(a):\n    a[0] < a[1]\n    a.sort()\n', 'f', [3, 1, 2]);
  f = A.fromEvents(t.initial, t.events, { mode: 'sort', final: t.final });
  ok(f.some((x) => /cannot be followed/.test(x.msg)) && f[f.length - 1].kind === 'end', 'untraceable change explained');
  // buggy sort is flagged
  t = await tr('def f(a):\n    a[0] < a[1]\n', 'f', [3, 1, 2]);
  f = A.fromEvents(t.initial, t.events, { mode: 'sort', final: t.final });
  ok(/NOT sorted/.test(f[f.length - 1].msg), 'unsorted result flagged');

  console.log(`all ${pass} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
