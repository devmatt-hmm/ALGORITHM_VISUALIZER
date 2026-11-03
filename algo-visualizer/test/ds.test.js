'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { traceStructures } = require('../src/dsrun');
const ext = path.join(__dirname, '..');
const cfg = { pythonPath: '', maxSnapshots: 400, timeoutSeconds: 5 };
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const tr = (text, over = {}) => traceStructures({ text, extensionPath: ext, config: { ...cfg, ...over } });

(async () => {
  let t = await tr(fs.readFileSync(path.join(ext, 'samples/linked_list.py'), 'utf8'));
  ok(t.status === 'ok' && t.sawNodes && t.frames.length > 8, 'linked list traced: ' + t.frames.length);
  const last = t.frames[t.frames.length - 1];
  const chain = (f) => { const m = new Map(f.nodes.map((n) => [n.id, n])); const out = []; let id = f.ptrs.head !== undefined ? f.ptrs.head : f.ptrs['ll.head']; const seen = new Set(); while (id != null && m.has(id) && !seen.has(id)) { seen.add(id); out.push(m.get(id).v); id = m.get(id).next; } return out; };
  ok(chain(last).join() === '30,20,10', 'reversed list at the end: ' + chain(last));
  ok(t.frames.some((f) => chain(f).join() === '10,20,30'), 'original order seen');
  ok(t.frames.some((f) => 'cur' in f.ptrs) && t.frames.some((f) => 'prev' in f.ptrs && f.ptrs.prev === null || f.ptrs.prev), 'pointer variables labelled');
  ok(t.frames.some((f) => f.ptrs.cur === null), 'cur reaching NULL is shown');
  ok(t.frames.every((f) => f.nodes.every((n) => n.next === null || f.nodes.some((m) => m.id === n.next))), 'no dangling next ids');
  ok(t.frames.some((f) => f.ln > 0 && f.fn === 'reverse'), 'line + function recorded');
  ok(!t.frames.some((f) => 'll.head' in f.ptrs && 'head' in f.ptrs && f.ptrs.head === f.ptrs['ll.head']), 'duplicate holder labels removed');

  t = await tr(fs.readFileSync(path.join(ext, 'samples/stack_queue.py'), 'utf8'));
  ok(t.status === 'ok' && t.sawArrays && !t.sawNodes, 'list/deque traced');
  const stk = t.frames.map((f) => (f.arrays.find((a) => a.name === 'stack') || {}).items).filter(Boolean);
  ok(JSON.stringify(stk[stk.length - 1]) === JSON.stringify(['1', '2']), 'stack ends [1,2]: ' + JSON.stringify(stk[stk.length - 1]));
  ok(t.frames.some((f) => f.arrays.some((a) => a.name === 'queue' && a.deque)), 'deque flagged');

  // doubly linked + circular
  t = await tr('class N:\n    def __init__(s, v):\n        s.v = v; s.next = None; s.prev = None\na = N(1); b = N(2)\na.next = b\nb.prev = a\nb.next = a\n');
  ok(t.frames.some((f) => f.nodes.some((n) => n.prev !== null)) && t.frames.some((f) => f.nodes.length === 2 && f.nodes.every((n) => n.next !== null)), 'doubly + circular snapshot');

  // infinite loop and timeouts
  t = await tr('class N:\n    def __init__(s):\n        s.next = None\nn = N()\nwhile True:\n    n.next = N()\n    n = n.next\n', { maxSnapshots: 30 });
  ok(t.truncated === true && t.notes.some((x) => /Recording stopped/.test(x)), 'growth capped');
  t = await tr('class N:\n    def __init__(s):\n        s.next = None\nn = N()\nwhile True:\n    pass\n', { timeoutSeconds: 2 });
  ok((t.timedOut || t.truncated) && t.notes.length >= 1, 'busy infinite loop stopped');
  t = await tr('import time\nclass N:\n    def __init__(s):\n        s.next = None\nn = N()\ntime.sleep(30)\n', { timeoutSeconds: 2 });
  ok(t.timedOut && t.notes.some((x) => /stopped after/.test(x)), 'timeout');

  // errors
  t = await tr('class N:\n    def __init__(s):\n        s.next = None\nn = N()\nn.next = N()\nprint(n.next.next.next)\n');
  ok(t.frames.length >= 1 && t.runtimeError && t.runtimeError.type === 'AttributeError' && t.notes.some((x) => /AttributeError/.test(x)), 'runtime error keeps earlier steps');
  t = await tr('x = input()\n');
  ok(t.notes.some((x) => /input/.test(x)), 'input() explained');
  t = await tr('def f(:\n  pass');
  ok(t.status === 'error' && /SyntaxError/.test(t.message), 'syntax error');
  t = await tr('x = 1\nprint(x)\n');
  ok(t.status === 'ok' && !t.frames.length && t.notes.some((x) => /No linked structures/.test(x)), 'nothing to show explained');
  console.log(`ds: all ${pass} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
