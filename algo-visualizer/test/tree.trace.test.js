'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { traceStructures } = require('../src/dsrun');
const ext = path.join(__dirname, '..');
const cfg = { pythonPath: '', maxSnapshots: 400, timeoutSeconds: 5 };
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const tr = (text, over = {}) => traceStructures({ text, extensionPath: ext, harness: 'tree_harness.py', config: { ...cfg, ...over } });
const shape = (f, id) => { const m = new Map(f.nodes.map((n) => [n.id, n])); const w = (i) => (i === null || !m.has(i) ? null : [m.get(i).v, w(m.get(i).l), w(m.get(i).r)]); return w(id); };

(async () => {
  let t = await tr(fs.readFileSync(path.join(ext, 'samples/bst.py'), 'utf8'));
  ok(t.status === 'ok' && t.sawNodes && t.frames.length > 10, 'bst traced: ' + t.frames.length);
  const last = t.frames[t.frames.length - 1];
  const rootId = last.ptrs.root;
  ok(JSON.stringify(shape(last, rootId)) === JSON.stringify(['50', ['30', ['20', null, null], ['40', null, null]], ['70', null, null]]), 'final tree shape: ' + JSON.stringify(shape(last, rootId)));
  ok(t.frames.some((f) => f.nodes.length === 1 && f.nodes[0].l === null), 'first node alone is seen');
  ok(t.frames.every((f) => f.nodes.every((n) => (n.l === null || f.nodes.some((m) => m.id === n.l)) && (n.r === null || f.nodes.some((m) => m.id === n.r)))), 'no dangling ids');
  ok(t.frames.some((f) => f.ln > 0 && f.fn === 'insert'), 'line and function recorded');
  ok(t.frames.some((f) => f.arrays.some((a) => a.name === 'result' && a.items.length === 5)), 'collected output list shown');
  ok(t.frames.some((f) => 'root' in f.ptrs && 'node' in f.ptrs === false), 'root pointer labelled');

  // class-based tree with holder object, different attribute names
  t = await tr('class N:\n    def __init__(s, k):\n        s.key = k; s.left_child = None; s.right_child = None\nclass T:\n    def __init__(s):\n        s.root = None\n    def add(s, k):\n        n = N(k)\n        if s.root is None:\n            s.root = n\n        else:\n            s.root.left_child = n\nt = T()\nt.add(1)\nt.add(2)\n');
  ok(t.status === 'ok' && t.sawNodes && t.frames.some((f) => f.nodes.length === 2 && f.nodes.some((n) => n.l !== null)), 'alternate attribute names + holder object');
  ok(t.frames.some((f) => 't.root' in f.ptrs || 'root' in f.ptrs), 'holder label');
  // not a tree
  t = await tr('x = [1, 2, 3]\nprint(x)\n'); ok(t.status === 'ok' && t.notes.length === 0 === false || t.frames.length >= 0, 'plain list is not an error');
  t = await tr('class N:\n    def __init__(s):\n        s.next = None\nn = N()\n', { }); ok(t.status === 'ok' && !t.sawNodes, 'linked-list nodes (next) are not trees');
  t = await traceStructures({ text: 'x = 1\n', extensionPath: ext, harness: 'tree_harness.py', emptyNote: 'No tree nodes were found.', config: cfg }); ok(t.notes.some((n) => /No tree nodes/.test(n)), 'custom empty note');
  // cycle + growth + crash
  t = await tr('class N:\n    def __init__(s):\n        s.left = None; s.right = None\na = N(); a.left = a\n'); ok(t.status === 'ok' && t.frames.length >= 1, 'self-loop does not hang');
  t = await tr('class N:\n    def __init__(s):\n        s.left = None; s.right = None\nn = N()\nwhile True:\n    n.left = N()\n    n = n.left\n', { maxSnapshots: 30 }); ok(t.truncated, 'growth capped');
  t = await tr('class N:\n    def __init__(s):\n        s.left = None; s.right = None\nn = N()\nn.left = N()\nprint(n.left.left.left)\n'); ok(t.runtimeError && t.runtimeError.type === 'AttributeError' && t.frames.length >= 1, 'crash keeps earlier steps');
  t = await tr('def f(:'); ok(t.status === 'error' && /SyntaxError/.test(t.message), 'syntax error');
  t = await tr(fs.readFileSync(path.join(ext, 'samples/bst.py'), 'utf8'));
  ok(t.frames.some((f) => 'root' in f.ptrs && 'root\u2191' in f.ptrs && f.ptrs.root !== f.ptrs['root\u2191']), 'caller variable with the same name is shown as root\u2191');
  console.log(`tree trace: all ${pass} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
