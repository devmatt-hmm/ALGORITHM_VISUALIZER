'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require('../media/graphs.js');
const { traceGraph } = require('../src/graphrun');
const ext = path.join(__dirname, '..');
const cfg = { pythonPath: '', maxSnapshots: 400, timeoutSeconds: 5 };
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const src = fs.readFileSync(path.join(ext, 'samples/graphs.py'), 'utf8');
const t = (fn, graph, o = {}) => traceGraph({ text: o.text || src, fn, graph, format: o.format || 'lists', formatName: 'x', plan: o.plan || ['graph', 'start'], start: o.start || graph.nodes[0].id, target: o.target, extensionPath: ext, config: { ...cfg, ...(o.cfg || {}) } });

(async () => {
  let r = await t('bfs', G.preset('small'));
  ok(r.status === 'ok' && r.frames.length > 8 && r.returned === "['A', 'B', 'C', 'D', 'E', 'F']", 'bfs traced: ' + r.returned);
  const f = r.frames;
  ok(f.some((x) => x.ptrs.node === 'B') && f.some((x) => x.ptrs.nxt === 'D'), 'current node + neighbour pointers');
  ok(f.some((x) => x.seqs.some((s) => s.name === 'queue' && s.items.join() === 'B,C')), 'queue contents');
  ok(f.some((x) => x.sets.some((s) => s.name === 'visited' && s.nodes.length === 6)), 'visited set fills up');
  ok(f.every((x) => x.ptrs.graph === undefined), 'the graph parameter itself is not drawn');
  ok(f.some((x) => x.ln > 0 && x.fn === 'bfs'), 'line + function recorded');

  r = await t('dfs', G.preset('small'), { plan: ['graph', 'start'] });
  ok(r.status === 'ok' && r.frames.some((x) => 'node' in x.ptrs && 'node\u2191' in x.ptrs), 'recursion: caller variable shown as node↑');

  r = await t('dijkstra', G.preset('roads'), { format: 'dicts' });
  ok(r.status === 'ok' && r.returned.includes("'F': 13"), 'dijkstra result: ' + r.returned);
  ok(r.frames.some((x) => x.maps.some((m) => m.name === 'dist' && m.rows.some((row) => row[0] === 'A' && row[1] === '0') && m.rows.some((row) => row[1] === '\u221e'))), 'dist table with infinity');
  ok(r.frames.some((x) => x.seqs.some((s) => s.name === 'heap' && s.nodes.length)), 'priority queue of tuples shown');
  const tup = await t('dijkstra', G.preset('roads'), { format: 'tuples', text: src.replace('graph[u].items()', 'graph[u]') }); ok(tup.status === 'ok' && tup.returned.includes("'F': 13"), 'tuple format works');

  // int node names + list-of-bools "visited" arrays
  const gi = G.parseGraph('0-1, 1-2, 2-3, 0-3').graph;
  r = await t('f', gi, { text: 'def f(graph, start):\n    visited = [False] * 4\n    stack = [start]\n    while stack:\n        u = stack.pop()\n        if visited[u]:\n            continue\n        visited[u] = True\n        stack.extend(graph[u])\n    return visited\n', start: '0' });
  ok(r.status === 'ok' && r.frames.some((x) => x.sets.some((s) => s.name === 'visited' && s.nodes.length === 4)) && r.frames.some((x) => x.ptrs.u !== undefined), 'int nodes + bool array + stack');

  // problems
  r = await t('bfs', G.preset('small'), { text: 'def bfs(graph, start):\n    return graph[start][99]\n' }); ok(r.runtimeError && r.runtimeError.type === 'IndexError' && r.notes.some((n) => /IndexError/.test(n)), 'runtime error reported');
  r = await t('bfs', G.preset('roads'), { format: 'dicts', text: src }); ok(r.runtimeError || r.status === 'ok', 'wrong format does not crash the tool');
  r = await t('f', G.preset('small'), { text: 'def f(graph):\n    return len(graph)\n', plan: ['graph'] }); ok(r.status === 'ok' && !r.frames.length && r.notes.some((n) => /No graph nodes/.test(n)), 'nothing to show explained');
  r = await t('f', G.preset('small'), { text: 'def f(graph, start):\n    q = [start]\n    while True:\n        q.append(start)\n        q.pop(0)\n', cfg: { maxSnapshots: 30 } }); ok(r.truncated || r.timedOut || r.frames.length, 'infinite loop capped');
  r = await t('f', G.preset('small'), { text: 'import time\ndef f(graph, start):\n    x = start\n    time.sleep(30)\n', cfg: { timeoutSeconds: 2 } }); ok(r.timedOut && r.notes.some((n) => /stopped after/.test(n)), 'timeout');
  r = await t('nope', G.preset('small')); ok(r.status === 'error' && /not found/.test(r.message), 'missing function');
  r = await t('f', G.preset('small'), { text: 'def f(:\n pass' }); ok(r.status === 'error' && /SyntaxError/.test(r.message), 'syntax error');
  r = await t('f', G.preset('small'), { text: 'x = input()\ndef f(graph, start): pass\n' }); ok(r.status === 'error' && /while loading/.test(r.message), 'module-level input()');
  r = await t('f', G.preset('disconnected'), { text: 'def f(graph, start):\n    seen = set()\n    stack = [start]\n    while stack:\n        u = stack.pop()\n        seen.add(u)\n        stack += [v for v in graph[u] if v not in seen]\n    return seen\n' }); ok(r.status === 'ok' && r.frames.length > 3, 'works on a disconnected graph (isolated node F has an empty neighbour list)');
  console.log(`graph trace: all ${pass} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
