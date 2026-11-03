'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../media/recur.js');
const { traceRecursion } = require('../src/recrun');
const { findFunctions, defaultArgs } = require('../src/funcs');
const ext = path.join(__dirname, '..');
const cfg = { pythonPath: '', maxCalls: 300, timeoutSeconds: 5 };
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const src = fs.readFileSync(path.join(ext, 'samples/recursion.py'), 'utf8');
const tr = (text, fn, argsText, over = {}) => traceRecursion({ text, fn, argsText, extensionPath: ext, config: { ...cfg, ...over } });
const calls = (t) => t.events.filter((e) => e.k === 'call').length;

(async () => {
  let t = await tr(src, 'fact', '5');
  ok(t.status === 'ok' && calls(t) === 5 && t.returned === '120', 'fact(5): ' + calls(t) + ' ' + t.returned);
  let f = R.framesFromEvents(t.events); ok(f[f.length - 1].msg === 'Done: fact(5) = 120.', 'final message: ' + f[f.length - 1].msg);
  ok(t.events.filter((e) => e.k === 'ret').map((e) => e.value).join() === '1,2,6,24,120', 'return order');
  ok(t.events.every((e) => e.ln > 0), 'line numbers recorded');

  t = await tr(src, 'fib', '6'); ok(calls(t) === 25 && t.returned === '8', 'fib(6) = 25 calls like the built-in');
  const built = R.build('fib', { n: 6 }); ok(JSON.stringify(t.events.filter((e) => e.k === 'call').map((e) => [e.id, e.parent, e.text])) === JSON.stringify(built.events.filter((e) => e.k === 'call').map((e) => [e.id, e.parent, e.text])), 'user trace tree equals built-in tree');

  t = await tr(src, 'sum_list', '[3, 1, 4, 1, 5]'); ok(calls(t) === 6 && t.returned === '14' && /\[1, 4, 1, 5\]|…/.test(t.events[1].text), 'list args shown: ' + t.events[1].text);
  t = await tr(src, 'hanoi', '3, "A", "C", "B"'); ok(calls(t) === 7 && t.returned === '7', 'hanoi with several args');
  t = await tr(src, 'fact', '1'); ok(calls(t) === 1 && t.notes.some((n) => /never called itself/.test(n)), 'no recursion explained');
  t = await tr('def f(n):\n    return f(n - 1)\n', 'f', '3', { maxCalls: 50 });
  ok(t.truncated && calls(t) === 50 && t.notes.some((n) => /infinite recursion/.test(n)), 'infinite recursion capped');
  f = R.framesFromEvents(t.events); ok(/stopped/.test(f[f.length - 1].msg), 'unfinished frames');
  t = await tr(src, 'countdown', '3', { maxCalls: 40 }); ok(t.truncated, 'buggy base case never reached');
  t = await tr('def f(n):\n    if n == 0:\n        raise ValueError("boom")\n    return f(n - 1)\n', 'f', '2');
  ok(t.runtimeError && t.runtimeError.type === 'ValueError' && t.events.filter((e) => e.k === 'ret' && e.err).length === 3 && t.notes.some((n) => /raised ValueError/.test(n)), 'exceptions marked on every unwound call');
  f = R.framesFromEvents(t.events); ok(f[f.length - 1].st.every((s) => s === 5), 'all red');
  t = await tr('import sys\ndef f(n):\n    return f(n + 1) if n < 3000 else 0\n', 'f', '0', { maxCalls: 2000 });
  ok(t.truncated || t.runtimeError, 'deep recursion handled');
  t = await tr('def f(n):\n    return 1 if n < 2 else 2 * f(n - 1)\n', 'f', '1000', { maxCalls: 2000 });
  ok(t.status === 'ok' && calls(t) > 100, 'deep but legitimate recursion records');

  // problems with arguments / functions / files
  t = await tr(src, 'fact', '5,,'); ok(t.status === 'error' && /arguments/.test(t.message), 'bad args syntax: ' + t.message);
  t = await tr(src, 'fact', 'abc'); ok(t.status === 'error' && /arguments/.test(t.message), 'bad args name');
  t = await tr(src, 'fact', ''); ok(t.status === 'error' && /do not fit/.test(t.message), 'missing args: ' + t.message);
  t = await tr(src, 'fact', '1, 2'); ok(t.status === 'error' && /do not fit/.test(t.message), 'too many args');
  t = await tr(src, 'nope', '1'); ok(t.status === 'error' && /not found/.test(t.message), 'missing function');
  t = await tr('def f(:\n  pass', 'f', '1'); ok(t.status === 'error' && /SyntaxError/.test(t.message), 'syntax error');
  t = await tr('x = input()\ndef f(n): return n\n', 'f', '1'); ok(t.status === 'error' && /while loading/.test(t.message), 'module-level input()');
  t = await tr('import time\ndef f(n):\n    time.sleep(30)\n', 'f', '1', { timeoutSeconds: 2 }); ok(t.timedOut && t.notes.some((n) => /stopped after/.test(n)), 'timeout');
  t = await tr('import functools\n@functools.lru_cache(None)\ndef f(n):\n    return n if n < 2 else f(n-1) + f(n-2)\n', 'f', '8'); ok(t.status === 'ok' && calls(t) === 9, 'lru_cache: cached calls never enter the function, so 9 calls: ' + calls(t));

  // defaults
  const fns = findFunctions(src);
  ok(defaultArgs(fns.find((x) => x.name === 'fact')) === '5' && defaultArgs(fns.find((x) => x.name === 'sum_list')) === '[5, 2, 9, 1]' && defaultArgs(fns.find((x) => x.name === 'hanoi')) === '5, "A", "C", "B"', 'default args: ' + defaultArgs(fns.find((x) => x.name === 'hanoi')));
  console.log(`rec: all ${pass} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
