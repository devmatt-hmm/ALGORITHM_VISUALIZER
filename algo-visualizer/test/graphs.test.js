'use strict';
const assert = require('assert');
const G = require('../media/graphs.js');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
let seed = 11; const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
const last = (r) => r.frames[r.frames.length - 1];

// ---- parsing
const P = (t) => G.parseGraph(t);
let g = P('A-B, A-C:4, B-D').graph;
ok(g.nodes.map((n) => n.id).join() === 'A,B,C,D' && !g.directed && g.weighted && g.edges[1].w === 4 && g.edges[0].w === 1, 'parse undirected weighted');
g = P('A->B\nB->C; C->A:7').graph; ok(g.directed && g.edges.length === 3, 'parse directed with mixed separators');
ok(P('A-B, C').graph.nodes.length === 3, 'isolated node token');
for (const bad of ['', '   ', 'A-B, A->C', 'A-A', 'A-B, B-A', 'A->B, A->B', 'A-B:x', 'A--B', 'hello world', 'ABCDEF-B', 'A-B:-3']) ok(P(bad).error, `rejects "${bad}"`);
ok(!P('A->B, B->A').error, 'opposite directed edges are fine');
ok(P(Array.from({ length: 13 }, (_, i) => `N${i}-N${i + 1}`).join(',')).error, 'too many nodes rejected');
ok(P(Array.from({ length: 31 }, (_, i) => `N${i % 6}-M${i}`).join(',')).error, 'too many edges/nodes rejected');
for (const id of G.PRESET_ORDER) { const pg = G.preset(id); ok(pg && pg.nodes.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1), `preset ${id}`); }

// ---- layout: deterministic, inside bounds, nodes apart
const a1 = P('A-B, B-C, C-D, D-E, E-A, A-C').graph, a2 = P('A-B, B-C, C-D, D-E, E-A, A-C').graph;
eq(a1.nodes, a2.nodes, 'layout is deterministic');
ok(a1.nodes.every((n) => n.x >= 0.07 && n.x <= 0.93 && n.y >= 0.09 && n.y <= 0.91), 'layout inside bounds');
let minD = 9; for (let i = 0; i < a1.nodes.length; i++) for (let j = i + 1; j < a1.nodes.length; j++) minD = Math.min(minD, Math.hypot(a1.nodes[i].x - a1.nodes[j].x, a1.nodes[i].y - a1.nodes[j].y));
ok(minD > 0.12, 'nodes are not on top of each other: ' + minD.toFixed(2));
ok(P('Z').graph.nodes[0].x === 0.5, 'single node centred');

// ---- reference implementations
function refBfs(g, s) { const A = G.adjacency(g), level = { [s]: 0 }, order = [], q = [s]; while (q.length) { const u = q.shift(); order.push(u); for (const e of A[u]) if (level[e.to] === undefined) { level[e.to] = level[u] + 1; q.push(e.to); } } return { order, level }; }
function refDfs(g, s) { const A = G.adjacency(g), order = []; const seen = new Set(); const f = (u) => { seen.add(u); order.push(u); for (const e of A[u]) if (!seen.has(e.to)) f(e.to); }; f(s); return order; }
function refDist(g, s) { const d = {}; g.nodes.forEach((n) => { d[n.id] = Infinity; }); d[s] = 0; for (let i = 0; i < g.nodes.length; i++) g.edges.forEach((e) => { if (d[e.u] + e.w < d[e.v]) d[e.v] = d[e.u] + e.w; if (!g.directed && d[e.v] + e.w < d[e.u]) d[e.u] = d[e.v] + e.w; }); return d; }

function randomGraph(directed, weighted) {
  const n = 3 + rnd(8), ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)), seen = new Set(), parts = [];
  for (let k = 0; k < n + rnd(n); k++) { const a = ids[rnd(n)], b = ids[rnd(n)]; const key = directed ? a + b : [a, b].sort().join(''); if (a === b || seen.has(key)) continue; seen.add(key); parts.push(`${a}${directed ? '->' : '-'}${b}${weighted ? ':' + (1 + rnd(20)) : ''}`); }
  if (!parts.length) parts.push(`A${directed ? '->' : '-'}B`);
  return P(parts.join(', ')).graph;
}

for (let it = 0; it < 300; it++) {
  const directed = it % 2 === 0, weighted = it % 3 !== 0, g2 = randomGraph(directed, weighted), start = g2.nodes[rnd(g2.nodes.length)].id;
  // BFS
  let r = G.run('bfs', g2, { start }); const rb = refBfs(g2, start);
  eq(r.result.order, rb.order, `BFS order #${it}`); eq(r.result.level, rb.level, `BFS levels #${it}`);
  ok(last(r).label === 'done', 'BFS ends'); eq(r.result.unreached.sort(), g2.nodes.map((n) => n.id).filter((id) => rb.level[id] === undefined).sort(), 'BFS unreached');
  // DFS
  r = G.run('dfs', g2, { start }); eq(r.result.order, refDfs(g2, start), `DFS order #${it}`);
  const { disc, fin } = r.result; const vis = Object.keys(disc);
  ok(vis.every((v) => disc[v] < fin[v]), 'disc < fin');
  const times = [...vis.map((v) => disc[v]), ...vis.map((v) => fin[v])].sort((a, b) => a - b); eq(times, Array.from({ length: vis.length * 2 }, (_, i) => i + 1), 'times are 1..2n');
  ok(vis.every((u) => vis.every((v) => u === v || fin[u] < disc[v] || fin[v] < disc[u] || (disc[u] < disc[v] && fin[v] < fin[u]) || (disc[v] < disc[u] && fin[u] < fin[v]))), 'intervals are disjoint or nested');
  // Dijkstra
  r = G.run('dijkstra', g2, { start }); const rd = refDist(g2, start);
  for (const n of g2.nodes) ok(r.result.dist[n.id] === rd[n.id], `Dijkstra dist ${start}->${n.id} #${it}: ${r.result.dist[n.id]} vs ${rd[n.id]}`);
  // path validity with a reachable target
  const reach = g2.nodes.map((n) => n.id).filter((id) => id !== start && rd[id] < Infinity);
  if (reach.length) {
    const tgt = reach[rnd(reach.length)]; const A = G.adjacency(g2);
    const rr = G.run('dijkstra', g2, { start, target: tgt }); const lf = last(rr);
    ok(lf.label === 'found' && lf.path[0] === start && lf.path[lf.path.length - 1] === tgt, 'Dijkstra found');
    let cost = 0; for (let i = 0; i + 1 < lf.path.length; i++) { const e = A[lf.path[i]].find((x) => x.to === lf.path[i + 1]); ok(e, 'path edge exists'); cost += e.w; }
    ok(cost === rd[tgt], `path cost ${cost} equals shortest distance ${rd[tgt]}`);
    const rbf = G.run('bfs', g2, { start, target: tgt }); ok(last(rbf).label === 'found' && last(rbf).path.length - 1 === rb.level[tgt], 'BFS path has the fewest edges');
    const rdf = G.run('dfs', g2, { start, target: tgt }); const pd = last(rdf).path; ok(last(rdf).label === 'found' && pd[0] === start && pd[pd.length - 1] === tgt, 'DFS finds a path');
    for (let i = 0; i + 1 < pd.length; i++) ok(A[pd[i]].some((x) => x.to === pd[i + 1]), 'DFS path edges exist');
  }
  const unr = g2.nodes.map((n) => n.id).filter((id) => id !== start && rd[id] === Infinity);
  if (unr.length) { for (const id of ['bfs', 'dfs', 'dijkstra']) { const rr = G.run(id, g2, { start, target: unr[0] }); ok(last(rr).error && /no path/.test(last(rr).msg), `${id}: unreachable target explained`); } }
}

// ---- specific known answers
const roads = G.preset('roads');
let r = G.run('dijkstra', roads, { start: 'A' }); eq(r.result.dist, { A: 0, B: 3, C: 2, D: 8, E: 10, F: 13 }, 'roads distances');
r = G.run('dijkstra', roads, { start: 'A', target: 'F' }); eq(last(r).path, ['A', 'C', 'B', 'D', 'E', 'F'], 'roads shortest path to F'); ok(/13/.test(last(r).msg), 'distance in message');
r = G.run('bfs', G.preset('small'), { start: 'A' }); eq(r.result.order, ['A', 'B', 'C', 'D', 'E', 'F'], 'small BFS order');
r = G.run('dfs', G.preset('small'), { start: 'A' }); eq(r.result.order, ['A', 'B', 'D', 'F', 'E', 'C'], 'small DFS order');
r = G.run('bfs', G.preset('disconnected'), { start: 'A' }); eq(r.result.unreached, ['D', 'E', 'F'], 'islands not reached'); ok(/Not reached/.test(last(r).msg), 'explained');
r = G.run('dfs', G.preset('directed'), { start: 'A' }); ok(r.frames.some((f) => /cycle/.test(f.msg)), 'directed DFS reports the cycle edge');
r = G.run('dijkstra', P('A-B:1, A-C:1, B-C:5, C-D:2, B-D:9').graph, { start: 'A' }); ok(r.frames.some((f) => f.label === 'keep') && r.frames.some((f) => f.label === 'relax'), 'relax and keep frames');
r = G.run('dijkstra', P('A-B:1, A-C:2, B-D:1, C-D:1').graph, { start: 'A' }); ok(r.frames.some((f) => f.label === 'stale') || r.result.dist.D === 2, 'stale queue entries handled');

// ---- frames are consistent; labels exist in listings
for (const id of G.ORDER) for (const pid of G.PRESET_ORDER) {
  const gg = G.preset(pid), res = G.run(id, gg, { start: gg.nodes[0].id });
  const labels = new Set(G.ALGOS[id].code.cpp.concat(G.ALGOS[id].code.py).flatMap((l) => l[1].split(' ')));
  for (const f of res.frames) {
    ok(Object.keys(f.node).length === gg.nodes.length && Object.values(f.edge).every((s) => ['tree', 'cur', 'skip', 'relax', 'path'].includes(s)), `${id}/${pid}: frame shape`);
    ok(f.label === 'done' || labels.has(f.label) || f.label === 'found', `${id}/${pid}: label ${f.label} not in listing`);
    ok(f.cur === null || f.cur in f.node, 'cur is a node');
  }
  ok(res.frames.length >= 2 && res.frames.length < 400, `${id}/${pid} frame count ${res.frames.length}`);
}

// ---- validation of run()
const sg = G.preset('small');
ok(G.run('bfs', sg, { start: 'Z' }).error && G.run('bfs', sg, { start: '' }).error && G.run('bfs', sg, { start: 'A', target: 'Q' }).error && G.run('bfs', sg, { start: 'A', target: 'A' }).error && G.run('nope', sg, { start: 'A' }).error, 'bad run() input rejected');
console.log(`graphs: all ${pass} checks passed`);
