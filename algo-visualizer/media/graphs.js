/*
 * Graphs engine (window.Graphs / module.exports).
 * Graph: { nodes:[{id,x,y}], edges:[{u,v,w}], directed, weighted }   (x,y in 0..1)
 * Frame: { kind:'graph', label, msg, error, node:{id:'unseen|queued|cur|done'}, edge:{index:'tree|cur|skip|relax|path'},
 *          cur, struct:{title,items:[{t,hl?}]}|null, table:{title,cols,rows,hl?}|null, path:[ids]|null }
 */
(function (root) {
  'use strict';
  const L = (text, label) => [text, label || ''];
  const MAX_NODES = 12, MAX_EDGES = 30;
  const INF = Infinity;

  // ------------------------------------------------------------------ parsing
  /** "A-B, A-C:4" (undirected) or "A->B:3" (directed). Returns { graph } or { error }. */
  function parseGraph(text, positions) {
    const toks = String(text).split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean);
    if (!toks.length) return { error: 'Type some edges, for example  A-B, A-C, B-D  (use A->B for directed, A-B:5 for a weight).' };
    const ids = [], seen = new Set(), edges = [];
    let directed = null, weighted = false;
    const add = (id) => { if (!seen.has(id)) { if (ids.length >= MAX_NODES) return false; seen.add(id); ids.push(id); } return true; };
    for (const t of toks) {
      const m = /^([A-Za-z0-9_]{1,4})\s*(->|-|–|—)\s*([A-Za-z0-9_]{1,4})(?:\s*[:@]\s*(\d{1,3}))?$/.exec(t);
      if (!m) {
        if (/^[A-Za-z0-9_]{1,4}$/.test(t)) { if (!add(t)) return { error: `At most ${MAX_NODES} nodes are supported.` }; continue; }
        if (/-\s*[-+]?\d/.test(t) && /:\s*-/.test(t)) return { error: `"${t}": weights cannot be negative here.` };
        return { error: `Could not read "${t}". Write an edge like A-B, A->B or A-B:5 (names are 1 to 4 letters or digits).` };
      }
      const dir = m[2] === '->';
      if (directed === null) directed = dir; else if (directed !== dir) return { error: 'Use either - (undirected) or -> (directed) for all edges, not both.' };
      if (m[1] === m[3]) return { error: `"${t}" connects a node to itself, which is not supported.` };
      if (!add(m[1]) || !add(m[3])) return { error: `At most ${MAX_NODES} nodes are supported.` };
      const w = m[4] === undefined ? null : parseInt(m[4], 10); if (w !== null) weighted = true;
      const dup = edges.some((e) => (e.u === m[1] && e.v === m[3]) || (!dir && e.u === m[3] && e.v === m[1]));
      if (dup) return { error: `The edge ${m[1]}${dir ? '->' : '-'}${m[3]} appears twice.` };
      edges.push({ u: m[1], v: m[3], w });
      if (edges.length > MAX_EDGES) return { error: `At most ${MAX_EDGES} edges are supported.` };
    }
    edges.forEach((e) => { if (e.w === null) e.w = 1; });
    const g = { nodes: ids.map((id) => ({ id, x: 0.5, y: 0.5 })), edges, directed: !!directed, weighted };
    if (positions) g.nodes.forEach((n) => { if (positions[n.id]) { n.x = positions[n.id][0]; n.y = positions[n.id][1]; } });
    else layout(g);
    return { graph: g };
  }

  /** Deterministic spring layout, normalised into [0.08, 0.92]. */
  function layout(g) {
    const n = g.nodes.length;
    if (n === 1) { g.nodes[0].x = 0.5; g.nodes[0].y = 0.5; return g; }
    const P = g.nodes.map((_, i) => [0.5 + 0.35 * Math.cos((2 * Math.PI * i) / n), 0.5 + 0.35 * Math.sin((2 * Math.PI * i) / n)]);
    const ix = new Map(g.nodes.map((nd, i) => [nd.id, i])), k = Math.sqrt(1 / n);
    let temp = 0.12;
    for (let it = 0; it < 250; it++) {
      const D = P.map(() => [0, 0]);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1]; const d = Math.max(1e-3, Math.hypot(dx, dy)); const f = (k * k) / d;
        dx /= d; dy /= d; D[i][0] += dx * f; D[i][1] += dy * f; D[j][0] -= dx * f; D[j][1] -= dy * f;
      }
      g.edges.forEach((e) => {
        const a = ix.get(e.u), b = ix.get(e.v); let dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1]; const d = Math.max(1e-3, Math.hypot(dx, dy)); const f = (d * d) / k;
        dx /= d; dy /= d; D[a][0] -= dx * f; D[a][1] -= dy * f; D[b][0] += dx * f; D[b][1] += dy * f;
      });
      for (let i = 0; i < n; i++) { const d = Math.max(1e-6, Math.hypot(D[i][0], D[i][1])); const s = Math.min(d, temp) / d; P[i][0] += D[i][0] * s; P[i][1] += D[i][1] * s; }
      temp *= 0.985;
    }
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    g.nodes.forEach((nd, i) => { nd.x = 0.08 + 0.84 * ((P[i][0] - x0) / (x1 - x0 || 1)); nd.y = 0.1 + 0.8 * ((P[i][1] - y0) / (y1 - y0 || 1)); });
    return g;
  }

  const PRESETS = {
    small: { name: 'Small graph (undirected)', text: 'A-B, A-C, B-D, B-E, C-E, D-F, E-F', pos: { A: [0.08, 0.5], B: [0.32, 0.18], C: [0.32, 0.82], D: [0.66, 0.18], E: [0.66, 0.82], F: [0.92, 0.5] } },
    roads: { name: 'Road map (weighted)', text: 'A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:3', pos: { A: [0.07, 0.5], B: [0.3, 0.14], C: [0.3, 0.86], D: [0.58, 0.28], E: [0.64, 0.86], F: [0.93, 0.5] } },
    directed: { name: 'Directed graph with a cycle', text: 'A->B, A->C, B->D, C->D, D->E, E->B, C->F', pos: { A: [0.07, 0.5], B: [0.33, 0.15], C: [0.33, 0.85], D: [0.6, 0.4], E: [0.6, 0.08], F: [0.9, 0.85] } },
    disconnected: { name: 'Disconnected (two islands)', text: 'A-B, B-C, A-C, D-E, F', pos: { A: [0.12, 0.3], B: [0.36, 0.14], C: [0.36, 0.7], D: [0.66, 0.3], E: [0.9, 0.5], F: [0.66, 0.82] } },
    grid: { name: 'Grid (3 × 3)', text: '1-2, 2-3, 4-5, 5-6, 7-8, 8-9, 1-4, 4-7, 2-5, 5-8, 3-6, 6-9', pos: { 1: [0.15, 0.15], 2: [0.5, 0.15], 3: [0.85, 0.15], 4: [0.15, 0.5], 5: [0.5, 0.5], 6: [0.85, 0.5], 7: [0.15, 0.85], 8: [0.5, 0.85], 9: [0.85, 0.85] } },
    tree: { name: 'Tree-shaped graph', text: 'A-B, A-C, B-D, B-E, C-F, C-G', pos: { A: [0.5, 0.1], B: [0.27, 0.45], C: [0.73, 0.45], D: [0.14, 0.88], E: [0.4, 0.88], F: [0.6, 0.88], G: [0.86, 0.88] } },
  };
  const PRESET_ORDER = ['small', 'roads', 'directed', 'disconnected', 'grid', 'tree'];
  const preset = (id) => parseGraph(PRESETS[id].text, PRESETS[id].pos).graph;

  /** adjacency: id -> [{to, w, ei}] in node order (deterministic). */
  function adjacency(g) {
    const ix = new Map(g.nodes.map((n, i) => [n.id, i])), A = {};
    g.nodes.forEach((n) => { A[n.id] = []; });
    g.edges.forEach((e, ei) => { A[e.u].push({ to: e.v, w: e.w, ei }); if (!g.directed) A[e.v].push({ to: e.u, w: e.w, ei }); });
    Object.keys(A).forEach((k) => A[k].sort((a, b) => ix.get(a.to) - ix.get(b.to)));
    return A;
  }
  const edgeText = (g, ei) => { const e = g.edges[ei]; return `${e.u}${g.directed ? '→' : '–'}${e.v}`; };

  // ------------------------------------------------------------------ frame recorder
  class R {
    constructor(g) {
      this.g = g; this.A = adjacency(g); this.F = []; this.node = {}; this.edge = {}; this.cur = null; this.path = null; this.struct = null; this.table = null;
      g.nodes.forEach((n) => { this.node[n.id] = 'unseen'; });
    }
    snap(label, msg, o) {
      this.F.push(Object.assign({
        kind: 'graph', label, msg, error: false, node: Object.assign({}, this.node), edge: Object.assign({}, this.edge), cur: this.cur,
        struct: this.struct ? JSON.parse(JSON.stringify(this.struct)) : null, table: this.table ? JSON.parse(JSON.stringify(this.table)) : null, path: this.path ? this.path.slice() : null,
      }, o || {}));
    }
    markPath(path) { this.path = path; for (let i = 0; i + 1 < path.length; i++) { const e = this.A[path[i]].find((x) => x.to === path[i + 1]); if (e) this.edge[e.ei] = 'path'; } }
  }
  const pathTo = (parent, t) => { const p = []; for (let v = t; v !== undefined && v !== null; v = parent[v]) { p.unshift(v); if (p.length > 100) break; } return p; };
  const fmt = (x) => (x === INF || x === undefined || x === null ? '∞' : String(x));

  // ------------------------------------------------------------------ BFS
  function bfs(g, { start, target }) {
    const r = new R(g), level = {}, parent = {}, q = [], order = [];
    const table = (hl) => ({ title: 'BFS table', cols: ['node', 'level', 'parent'], rows: g.nodes.map((n) => [n.id, level[n.id] === undefined ? '–' : level[n.id], parent[n.id] === undefined ? '–' : parent[n.id]]), hl });
    const upd = () => { r.struct = { title: 'Queue (front → back)', items: q.map((id) => ({ t: id })) }; r.table = table(r.cur); };
    level[start] = 0; r.node[start] = 'queued'; q.push(start); upd();
    r.snap('init', `Start at ${start}: mark it discovered (level 0) and put it in the queue.`);
    let found = false;
    while (q.length && !found) {
      const u = q.shift(); r.node[u] = 'cur'; r.cur = u; upd(); r.snap('pop', `Take ${u} from the front of the queue.`);
      order.push(u); r.snap('visit', `Visit ${u} (level ${level[u]}). Look at each neighbour.`);
      for (const e of r.A[u]) {
        const v = e.to;
        if (level[v] === undefined) {
          level[v] = level[u] + 1; parent[v] = u; r.node[v] = 'queued'; q.push(v); r.edge[e.ei] = 'tree'; upd();
          r.snap('push', `${v} is new: discovered at level ${level[v]}, so add it to the back of the queue.`);
          if (v === target) { found = true; break; }
        } else { r.edge[e.ei] = r.edge[e.ei] || 'skip'; const had = r.edge[e.ei]; r.snap('skip', `${v} was already discovered: skip it.`); if (had === 'skip') delete r.edge[e.ei]; }
      }
      r.node[u] = 'done'; r.cur = null; upd();
    }
    const unreached = g.nodes.filter((n) => level[n.id] === undefined).map((n) => n.id);
    if (found) { const p = pathTo(parent, target); r.markPath(p); r.cur = target; upd(); r.snap('found', `Found ${target}! Fewest edges from ${start}: ${level[target]}. Path: ${p.join(' → ')}.`); }
    else {
      if (target !== undefined && target !== '') r.snap('done', `${target} was never reached: there is no path from ${start}.`, { error: true });
      else r.snap('done', `BFS finished. Visit order: ${order.join(', ')}.${unreached.length ? ` Not reached from ${start}: ${unreached.join(', ')}.` : ''}`);
    }
    return { frames: r.F, result: { order, level, parent, unreached } };
  }

  // ------------------------------------------------------------------ DFS (recursive)
  function dfs(g, { start, target }) {
    const r = new R(g), disc = {}, fin = {}, parent = {}, order = [], stack = []; let t = 0, found = false;
    const table = () => ({ title: 'DFS table', cols: ['node', 'found / finished', 'parent'], rows: g.nodes.map((n) => [n.id, disc[n.id] === undefined ? '–' : `${disc[n.id]} / ${fin[n.id] === undefined ? '…' : fin[n.id]}`, parent[n.id] === undefined ? '–' : parent[n.id]]), hl: r.cur });
    const upd = () => { r.struct = { title: 'Call stack (top first)', items: stack.slice().reverse().map((id, i) => ({ t: `dfs(${id})`, hl: i === 0 })) }; r.table = table(); };
    const rec = (u) => {
      disc[u] = ++t; r.node[u] = 'cur'; r.cur = u; order.push(u); stack.push(u); upd();
      r.snap('enter', `dfs(${u}): visit ${u} (discovered at time ${disc[u]}).`);
      if (u === target) { found = true; return; }
      for (const e of r.A[u]) {
        const v = e.to;
        if (disc[v] === undefined) {
          parent[v] = u; r.edge[e.ei] = 'tree'; r.cur = u; upd(); r.snap('recurse', `${v} is unvisited: go deeper into ${v}.`);
          rec(v); if (found) return;
          r.node[u] = 'cur'; r.cur = u; upd(); r.snap('back', `Back at ${u}: continue with its next neighbour.`);
        } else {
          const cyc = g.directed ? (fin[v] === undefined ? `${v} is still being explored: this edge closes a cycle (a back edge).` : `${v} is already finished (a forward or cross edge).`) : (v === parent[u] ? `${v} is where we came from.` : `${v} is already visited.`);
          const had = r.edge[e.ei]; if (!had) r.edge[e.ei] = 'skip'; r.snap('skip', `${cyc} Skip it.`); if (!had) delete r.edge[e.ei];
        }
      }
      fin[u] = ++t; r.node[u] = 'done'; stack.pop(); r.cur = stack.length ? stack[stack.length - 1] : null; upd();
      r.snap('finish', `${u} has no more unvisited neighbours: finished at time ${fin[u]}. Return to the caller.`);
    };
    rec(start);
    const unreached = g.nodes.filter((n) => disc[n.id] === undefined).map((n) => n.id);
    if (found) { const p = pathTo(parent, target); r.markPath(p); r.cur = target; upd(); r.snap('found', `Found ${target}! A path DFS found: ${p.join(' → ')} (not necessarily the shortest).`); }
    else if (target !== undefined && target !== '') r.snap('done', `${target} was never reached: there is no path from ${start}.`, { error: true });
    else { r.cur = null; upd(); r.snap('done', `DFS finished. Visit order: ${order.join(', ')}.${unreached.length ? ` Not reached from ${start}: ${unreached.join(', ')}.` : ''}`); }
    return { frames: r.F, result: { order, disc, fin, parent, unreached } };
  }

  // ------------------------------------------------------------------ Dijkstra
  function dijkstra(g, { start, target }) {
    const r = new R(g), ix = new Map(g.nodes.map((n, i) => [n.id, i])), dist = {}, parent = {}, done = new Set(); let pq = [];
    g.nodes.forEach((n) => { dist[n.id] = INF; });
    const sortPq = () => pq.sort((a, b) => a.d - b.d || ix.get(a.u) - ix.get(b.u));
    const table = () => ({ title: 'Shortest distances from ' + start, cols: ['node', 'dist', 'via'], rows: g.nodes.map((n) => [n.id, fmt(dist[n.id]), parent[n.id] === undefined ? '–' : parent[n.id]]), hl: r.cur });
    const upd = () => { sortPq(); r.struct = { title: 'Priority queue (smallest first)', items: pq.map((x, i) => ({ t: `${x.u}:${x.d}`, hl: i === 0, stale: x.d > dist[x.u] })) }; r.table = table(); };
    dist[start] = 0; pq.push({ d: 0, u: start }); r.node[start] = 'queued'; upd();
    r.snap('init', `All distances start at ∞, except ${start} = 0. Put (${start}, 0) in the priority queue.`);
    let found = false;
    while (pq.length) {
      sortPq(); const { d, u } = pq.shift(); r.cur = u; upd();
      if (d > dist[u]) { r.snap('stale', `Take (${u}, ${d}) from the queue, but ${u} already has a shorter distance (${dist[u]}): an outdated entry, skip it.`); continue; }
      done.add(u); r.node[u] = 'cur'; r.snap('pop', `Take the smallest entry: ${u} at distance ${d}. This distance is now final.`);
      if (u === target) { found = true; break; }
      for (const e of r.A[u]) {
        const v = e.to;
        if (done.has(v)) { continue; }
        const nd = d + e.w, old = dist[v];
        if (nd < old) {
          dist[v] = nd; parent[v] = u; pq.push({ d: nd, u: v }); r.node[v] = 'queued'; const had = r.edge[e.ei]; r.edge[e.ei] = 'relax'; upd();
          r.snap('relax', `${u} → ${v} costs ${d} + ${e.w} = ${nd}, which is shorter than ${fmt(old)}: update dist[${v}] and queue it.`);
          if (had) r.edge[e.ei] = had; else delete r.edge[e.ei];
        } else {
          const had = r.edge[e.ei]; r.edge[e.ei] = 'skip'; r.snap('keep', `${u} → ${v} costs ${d} + ${e.w} = ${nd}, not shorter than ${fmt(old)}: keep the old distance.`);
          if (had) r.edge[e.ei] = had; else delete r.edge[e.ei];
        }
      }
      r.node[u] = 'done'; r.cur = null; upd();
    }
    // shortest-path tree
    Object.keys(parent).forEach((v) => { const e = r.A[parent[v]].find((x) => x.to === v); if (e) r.edge[e.ei] = 'tree'; });
    const unreached = g.nodes.filter((n) => dist[n.id] === INF).map((n) => n.id);
    if (found) { const p = pathTo(parent, target); r.markPath(p); r.cur = target; upd(); r.snap('found', `Shortest distance ${start} → ${target} is ${dist[target]}. Path: ${p.join(' → ')}.`); }
    else if (target !== undefined && target !== '') { r.cur = null; upd(); r.snap('done', `${target} was never reached: there is no path from ${start}.`, { error: true }); }
    else { r.cur = null; upd(); r.snap('done', `Dijkstra finished: the highlighted edges are the shortest-path tree.${unreached.length ? ` Not reachable from ${start}: ${unreached.join(', ')}.` : ''}`); }
    return { frames: r.F, result: { dist, parent, unreached } };
  }

  // ------------------------------------------------------------------ algorithms table + listings
  const ADJ_CPP = L('vector<vector<int>> adj;   // adj[u] = neighbours of u (sorted)'), ADJ_PY = L('adj = {}   # adj[u] = list of neighbours of u (sorted)');
  const ALGOS = {
    bfs: {
      id: 'bfs', name: 'Breadth-first search (BFS)', run: bfs, cost: { time: 'O(V + E)', space: 'O(V)' },
      desc: 'Explore level by level: everything 1 edge away, then 2 edges away, and so on, using a queue (first in, first out). Because it spreads evenly, the first time it reaches a node is along a path with the fewest edges. Pick a target to see that shortest path.',
      code: {
        cpp: [ADJ_CPP, L('void bfs(int s) {'), L('  vector<bool> seen(n, false);'), L('  queue<int> q;'), L('  seen[s] = true; q.push(s);', 'init'), L('  while (!q.empty()) {'), L('    int u = q.front(); q.pop();', 'pop'), L('    visit(u);', 'visit'),
          L('    for (int v : adj[u]) {', 'skip'), L('      if (!seen[v]) {', 'skip'), L('        seen[v] = true;', 'push'), L('        q.push(v);', 'push found'), L('      }'), L('    }'), L('  }'), L('}', 'done')],
        py: [ADJ_PY, L('from collections import deque'), L('def bfs(s):'), L('    seen = {s}'), L('    q = deque([s])', 'init'), L('    while q:'), L('        u = q.popleft()', 'pop'), L('        visit(u)', 'visit'), L('        for v in adj[u]:', 'skip'), L('            if v not in seen:', 'skip'),
          L('                seen.add(v)', 'push'), L('                q.append(v)', 'push found')],
      },
    },
    dfs: {
      id: 'dfs', name: 'Depth-first search (DFS)', run: dfs, cost: { time: 'O(V + E)', space: 'O(V) call stack' },
      desc: 'Go as deep as possible before backing up, using recursion (the call stack). Each node gets a discovery time and a finish time. In a directed graph, an edge to a node that is still being explored closes a cycle. DFS finds a path, not necessarily the shortest one.',
      code: {
        cpp: [ADJ_CPP, L('vector<bool> seen;'), L('void dfs(int u) {', 'enter'), L('  seen[u] = true;'), L('  visit(u);'), L('  for (int v : adj[u]) {', 'skip'), L('    if (!seen[v]) {', 'skip'), L('      dfs(v);', 'recurse back'), L('    }'), L('  }'), L('  // u is finished', 'finish'), L('}', 'done found')],
        py: [ADJ_PY, L('seen = set()'), L('def dfs(u):', 'enter'), L('    seen.add(u)'), L('    visit(u)'), L('    for v in adj[u]:', 'skip'), L('        if v not in seen:', 'skip'), L('            dfs(v)', 'recurse back'), L('    # u is finished', 'finish done found')],
      },
    },
    dijkstra: {
      id: 'dijkstra', name: "Dijkstra's shortest path", run: dijkstra, cost: { time: 'O((V + E) log V)', space: 'O(V)' },
      desc: 'Shortest paths in a graph with non-negative weights. Keep the best known distance to every node and a priority queue; repeatedly take the closest unfinished node, whose distance is now final, and "relax" its edges: if going through it is shorter, update the neighbour. Unweighted edges count as 1.',
      code: {
        cpp: [L('struct Edge { int to, w; };'), L('vector<vector<Edge>> adj;'), L('vector<int> dijkstra(int s) {'), L('  vector<int> dist(n, INF);'), L('  priority_queue<pii, vector<pii>, greater<pii>> pq;   // (dist, node)'), L('  dist[s] = 0; pq.push({0, s});', 'init'), L('  while (!pq.empty()) {'),
          L('    auto [d, u] = pq.top(); pq.pop();', 'pop'), L('    if (d > dist[u]) continue;   // outdated entry', 'stale'), L('    for (auto [v, w] : adj[u]) {'), L('      if (d + w < dist[v]) {', 'relax keep'), L('        dist[v] = d + w;', 'relax'), L('        pq.push({dist[v], v});', 'relax'), L('      }'), L('    }'), L('  }'), L('  return dist;', 'done found'), L('}')],
        py: [L('import heapq'), L('def dijkstra(s):'), L('    dist = {u: float("inf") for u in adj}'), L('    dist[s] = 0'), L('    pq = [(0, s)]   # (dist, node)', 'init'), L('    while pq:'), L('        d, u = heapq.heappop(pq)', 'pop'), L('        if d > dist[u]:   # outdated entry', 'stale'), L('            continue', 'stale'),
          L('        for v, w in adj[u]:'), L('            if d + w < dist[v]:', 'relax keep'), L('                dist[v] = d + w', 'relax'), L('                heapq.heappush(pq, (dist[v], v))', 'relax'), L('    return dist', 'done found')],
      },
    },
  };
  const ORDER = ['bfs', 'dfs', 'dijkstra'];

  /** { frames, result } or { error } */
  function run(id, g, opts) {
    const a = ALGOS[id];
    if (!a) return { error: 'Unknown algorithm.' };
    const ids = new Set(g.nodes.map((n) => n.id));
    if (!opts.start || !ids.has(opts.start)) return { error: `The start node "${opts.start || ''}" is not in the graph.` };
    if (opts.target && !ids.has(opts.target)) return { error: `The target node "${opts.target}" is not in the graph.` };
    if (opts.target && opts.target === opts.start) return { error: 'The target is the same as the start: pick a different target (or none).' };
    return a.run(g, { start: opts.start, target: opts.target || undefined });
  }

  const api = { parseGraph, layout, preset, PRESETS, PRESET_ORDER, adjacency, ALGOS, ORDER, run, edgeText, MAX_NODES, MAX_EDGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Graphs = api;
})(typeof window !== 'undefined' ? window : globalThis);
