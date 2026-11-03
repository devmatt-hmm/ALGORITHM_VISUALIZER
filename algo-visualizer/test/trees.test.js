'use strict';
const assert = require('assert');
const T = require('../media/trees.js');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
const run = (k, op, st, a) => { const r = T.runOp(k, op, st, a || {}); ok(!r.error, `${k}.${op} ${r.error}`); ok(r.frames.length >= 1, 'frames'); return r; };
const last = (r) => r.frames[r.frames.length - 1];
const mk = (k, vals) => { let st = T.emptyState(k); const op = 'insert'; for (const v of vals) st = run(k, op, st, { value: v }).state; return st; };
const outOf = (r) => (last(r).extra && last(r).extra.items) || [];
const height = (st) => { const m = new Map(st.nodes.map((n) => [n.id, n])); const h = (id) => (id === null ? 0 : 1 + Math.max(h(m.get(id).l), h(m.get(id).r))); return h(st.root); };
function bstValid(st) { const m = new Map(st.nodes.map((n) => [n.id, n])); const chk = (id, lo, hi) => { if (id === null) return true; const n = m.get(id); return n.v > lo && n.v < hi && chk(n.l, lo, n.v) && chk(n.r, n.v, hi); }; return chk(st.root, -Infinity, Infinity); }
function avlValid(st) { const m = new Map(st.nodes.map((n) => [n.id, n])); const h = (id) => (id === null ? 0 : 1 + Math.max(h(m.get(id).l), h(m.get(id).r))); return st.nodes.every((n) => Math.abs(h(n.l) - h(n.r)) <= 1); }
let seed = 7; const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };

// ---- BST against a sorted-set model, random ops
let st = T.emptyState('bst'); const model = new Set();
for (let i = 0; i < 400; i++) {
  const v = rnd(60), pick = rnd(3);
  if (pick < 2) {
    if (model.size >= T.MAX_NODES && !model.has(v)) { const r = run('bst', 'insert', st, { value: v }); ok(last(r).error, 'full tree flagged'); continue; }
    const r = run('bst', 'insert', st, { value: v }); st = r.state; model.add(v);
    if (model.size && last(r).error) ok(model.has(v), 'dup flagged only for existing');
  } else { const r = run('bst', 'delete', st, { value: v }); st = r.state; ok(model.has(v) === !last(r).error, `delete ${v} error flag`); model.delete(v); }
  eq(T.contents('bst', st), [...model].sort((a, b) => a - b), `BST contents after step ${i}`); ok(bstValid(st), 'BST property');
}
// every delete case
const base = [50, 30, 70, 20, 40, 60, 80, 35, 45];
let r = run('bst', 'delete', mk('bst', base), { value: 20 }); eq(T.contents('bst', r.state), [30, 35, 40, 45, 50, 60, 70, 80], 'delete leaf'); ok(r.frames.some((f) => f.label === 'leaf'), 'leaf label');
r = run('bst', 'delete', mk('bst', [50, 30, 70, 20]), { value: 30 }); ok(r.frames.some((f) => f.label === 'child'), 'one child (left) label'); eq(T.contents('bst', r.state), [20, 50, 70], 'delete one-child');
r = run('bst', 'delete', mk('bst', [50, 30, 70, 80]), { value: 70 }); eq(T.contents('bst', r.state), [30, 50, 80], 'delete right-only child');
r = run('bst', 'delete', mk('bst', base), { value: 30 }); ok(r.frames.some((f) => f.label === 'copy') && r.frames.some((f) => f.label === 'remove2'), 'two-children frames'); eq(T.contents('bst', r.state), [20, 35, 40, 45, 50, 60, 70, 80], 'delete two children');
r = run('bst', 'delete', mk('bst', base), { value: 50 }); eq(T.contents('bst', r.state), [20, 30, 35, 40, 45, 60, 70, 80], 'delete root'); ok(r.state.nodes.find((n) => n.id === r.state.root).v === 60, 'successor 60 became the root');
r = run('bst', 'delete', mk('bst', [5]), { value: 5 }); eq(T.contents('bst', r.state), [], 'delete only node'); ok(r.state.root === null, 'root cleared');
r = run('bst', 'delete', T.emptyState('bst'), { value: 5 }); ok(last(r).error, 'delete from empty flagged');
r = run('bst', 'delete', mk('bst', base), { value: 99 }); ok(last(r).error, 'delete missing flagged'); eq(T.contents('bst', r.state), [20, 30, 35, 40, 45, 50, 60, 70, 80], 'unchanged');

// ---- search / min / max
r = run('bst', 'search', mk('bst', base), { value: 45 }); ok(last(r).hl.found.length === 1, 'search found');
r = run('bst', 'search', mk('bst', base), { value: 46 }); ok(last(r).error, 'search missing');
r = run('bst', 'findMin', mk('bst', base), {}); ok(T.contents('bst', mk('bst', base))[0] === 20 && /20/.test(last(r).msg), 'min');
r = run('bst', 'findMax', mk('bst', base), {}); ok(/80/.test(last(r).msg), 'max');
ok(last(run('bst', 'findMin', T.emptyState('bst'), {})).error && last(run('bst', 'inorder', T.emptyState('bst'), {})).error, 'empty tree errors');

// ---- traversals vs reference
const ref = { inorder: [20, 30, 35, 40, 45, 50, 60, 70, 80], preorder: [50, 30, 20, 40, 35, 45, 70, 60, 80], postorder: [20, 35, 45, 40, 30, 60, 80, 70, 50], levelorder: [50, 30, 70, 20, 40, 60, 80, 35, 45] };
for (const k of Object.keys(ref)) { r = run('bst', k, mk('bst', base), {}); eq(outOf(r), ref[k], k); ok(last(r).hl.visited.length === 9, k + ' visited all'); }
ok(run('bst', 'levelorder', mk('bst', base), {}).frames.some((f) => f.extra && f.extra.queue && f.extra.queue.length), 'level-order shows the queue');

// ---- AVL: balanced after every insert, all four rotation cases, sorted
let av = T.emptyState('avl'); const seen = new Set();
for (let i = 0; i < 300; i++) { const v = rnd(500) - 250; if (seen.size >= T.MAX_NODES && !seen.has(v)) continue; r = run('avl', 'insert', av, { value: v }); av = r.state; seen.add(v); ok(avlValid(av) && bstValid(av), 'AVL valid after insert ' + i); }
eq(T.contents('avl', av), [...seen].sort((a, b) => a - b), 'AVL contents');
const cases = { LL: [30, 20, 10], RR: [10, 20, 30], LR: [30, 10, 20], RL: [10, 30, 20] };
for (const [c, vals] of Object.entries(cases)) {
  let s = T.emptyState('avl'); let seenCase = false;
  for (const v of vals) { r = run('avl', 'insert', s, { value: v }); s = r.state; if (r.frames.some((f) => f.label === c)) seenCase = true; }
  ok(seenCase && height(s) === 2 && s.nodes.find((n) => n.id === s.root).v === 20, `${c} rotation gives root 20`);
}
let asc = T.emptyState('avl'); for (let v = 1; v <= 31; v++) asc = run('avl', 'insert', asc, { value: v }).state; ok(height(asc) === 5 && avlValid(asc), 'sorted inserts stay height 5 (a plain BST would be 31)');
let plain = mk('bst', Array.from({ length: 31 }, (_, i) => i + 1)); ok(height(plain) === 31, 'plain BST degenerates');
r = run('avl', 'insert', mk('avl', [3, 2, 1]), { value: 2 }); ok(last(r).error, 'AVL duplicate flagged'); ok(T.contents('avl', r.state).length === 3, 'dup keeps tree');
ok(run('avl', 'insert', mk('avl', [30, 20, 10]), { value: 5 }).frames.every((f) => f.bf !== null), 'AVL frames carry balance factors');
ok(last(run('bst', 'insert', asc2(), { value: 99 })).error, 'full BST flagged'); function asc2() { let s = T.emptyState('bst'); for (let v = 1; v <= 31; v++) s = run('bst', 'insert', s, { value: v }).state; return s; }

// ---- heaps
for (const kind of ['minheap', 'maxheap']) {
  const max = kind === 'maxheap'; let h = T.emptyState(kind); const vals = [];
  const valid = (a) => a.every((x, i) => i === 0 || (max ? a[(i - 1) >> 1] >= x : a[(i - 1) >> 1] <= x));
  for (let i = 0; i < 15; i++) { const v = rnd(90) + 1; vals.push(v); r = run(kind, 'insert', h, { value: v }); h = r.state; ok(valid(h.items), `${kind} heap property`); ok(r.frames.every((f) => f.items.length <= 15), 'sizes'); }
  ok(last(run(kind, 'insert', h, { value: 5 })).error, `${kind} full flagged`);
  const out = []; while (h.items.length) { r = run(kind, 'extract', h, {}); out.push(h.items[0]); h = r.state; ok(valid(h.items), 'valid after extract'); }
  eq(out, vals.slice().sort((a, b) => (max ? b - a : a - b)), `${kind} extract order`);
  ok(last(run(kind, 'extract', h, {})).error && last(run(kind, 'peek', h, {})).error, `${kind} empty errors`);
}
r = run('minheap', 'insert', mk2('minheap', [5, 9, 7]), { value: 1 }); ok(r.frames.filter((f) => f.label === 'swap').length === 2 && r.state.items[0] === 1, 'sift-up swaps'); function mk2(k, v) { let s = T.emptyState(k); for (const x of v) s = run(k, 'insert', s, { value: x }).state; return s; }

// ---- validation, labels, layout
ok(T.runOp('bst', 'insert', T.emptyState('bst'), {}).error && T.runOp('bst', 'insert', T.emptyState('bst'), { value: 1.5 }).error && T.runOp('bst', 'insert', T.emptyState('bst'), { value: 5000 }).error && T.runOp('bst', 'nope', T.emptyState('bst'), {}).error, 'bad input rejected');
for (const kind of Object.keys(T.STRUCTS)) {
  const S = T.STRUCTS[kind];
  for (const opId of S.order) {
    ok(T.CODE[kind][opId] && T.CODE[kind][opId].cpp.length && T.CODE[kind][opId].py.length, `${kind}.${opId} has listings`);
    const labels = new Set(T.CODE[kind][opId].cpp.concat(T.CODE[kind][opId].py).flatMap((l) => l[1].split(' ')));
    const start = S.type === 'heap' ? mk2(kind, [8, 3, 9, 1, 6]) : mk(kind, [50, 30, 70, 20, 40, 60, 80]);
    for (const f of run(kind, opId, start, { value: 45 }).frames) ok(!f.label || ['idle', 'done'].includes(f.label) || labels.has(f.label), `${kind}.${opId}: label "${f.label}" not in listing`);
  }
}
for (const f of run('bst', 'delete', mk('bst', base), { value: 50 }).frames) { const ids = new Set(f.nodes.map((n) => n.id)); ok(f.nodes.every((n) => (n.l === null || ids.has(n.l)) && (n.r === null || ids.has(n.r))), 'no dangling child ids'); }
const lay = T.layoutBinary(mk('bst', base).nodes, [mk('bst', base).root]); ok(lay.width === 9 && lay.height === 4, 'layout size');
const sortedX = Object.entries(lay.pos).map(([id, p]) => [mk('bst', base).nodes.find((n) => n.id === +id).v, p.x]).sort((a, b) => a[1] - b[1]).map((e) => e[0]); eq(sortedX, [20, 30, 35, 40, 45, 50, 60, 70, 80], 'x order is sorted order');
ok(T.layoutBinary(Array.from({ length: 3000 }, (_, i) => ({ id: i, l: i + 1 < 3000 ? i + 1 : null, r: null })), [0]).height === 3000, 'deep chains do not overflow the stack');
console.log(`trees: all ${pass} checks passed`);
