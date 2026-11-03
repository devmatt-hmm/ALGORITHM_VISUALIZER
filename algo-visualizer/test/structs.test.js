'use strict';
const assert = require('assert');
const S = require('../media/structs.js');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

function apply(kind, st, op, args) { const r = S.runOp(kind, op, st, args); ok(!r.error, `${kind}.${op} ${r.error}`); ok(r.frames.length >= 1, 'has frames'); return r; }
function build(kind, values) { let st = S.emptyState(kind); for (const v of values) st = apply(kind, st, kind === 'list' ? 'insertTail' : kind === 'stack' ? 'push' : 'enqueue', { value: v }).state; return st; }

// ---- linked list vs a plain array model
let st = build('list', [3, 5, 7]);
eq(S.contents('list', st), [3, 5, 7], 'insertTail x3');
let r = apply('list', st, 'insertHead', { value: 1 }); eq(S.contents('list', r.state), [1, 3, 5, 7], 'insertHead'); st = r.state;
r = apply('list', st, 'insertAt', { index: 2, value: 4 }); eq(S.contents('list', r.state), [1, 3, 4, 5, 7], 'insertAt middle'); st = r.state;
r = apply('list', st, 'insertAt', { index: 0, value: 0 }); eq(S.contents('list', r.state), [0, 1, 3, 4, 5, 7], 'insertAt 0'); st = r.state;
r = apply('list', st, 'insertAt', { index: 6, value: 9 }); eq(S.contents('list', r.state), [0, 1, 3, 4, 5, 7, 9], 'insertAt end'); st = r.state;
ok(S.runOp('list', 'insertAt', st, { index: 9, value: 1 }).error, 'bad index rejected');
ok(S.runOp('list', 'insertHead', st, { value: 1.5 }).error, 'non-integer rejected');
ok(S.runOp('list', 'insertHead', st, {}).error, 'missing value rejected');
r = apply('list', st, 'deleteHead', {}); eq(S.contents('list', r.state), [1, 3, 4, 5, 7, 9], 'deleteHead'); st = r.state;
r = apply('list', st, 'deleteTail', {}); eq(S.contents('list', r.state), [1, 3, 4, 5, 7], 'deleteTail'); st = r.state;
r = apply('list', st, 'deleteValue', { value: 4 }); eq(S.contents('list', r.state), [1, 3, 5, 7], 'deleteValue middle'); st = r.state;
r = apply('list', st, 'deleteValue', { value: 1 }); eq(S.contents('list', r.state), [3, 5, 7], 'deleteValue head'); st = r.state;
r = apply('list', st, 'deleteValue', { value: 7 }); eq(S.contents('list', r.state), [3, 5], 'deleteValue last'); st = r.state;
r = apply('list', st, 'deleteValue', { value: 99 }); eq(S.contents('list', r.state), [3, 5], 'deleteValue missing'); ok(r.frames[r.frames.length - 1].error, 'missing flagged'); st = r.state;
r = apply('list', build('list', [1, 2, 3, 4]), 'reverse', {}); eq(S.contents('list', r.state), [4, 3, 2, 1], 'reverse');
ok(r.frames.some((f) => f.label === 'flip'), 'reverse frames'); 
r = apply('list', build('list', [8]), 'reverse', {}); eq(S.contents('list', r.state), [8], 'reverse single');
r = apply('list', S.emptyState('list'), 'reverse', {}); eq(S.contents('list', r.state), [], 'reverse empty');
r = apply('list', S.emptyState('list'), 'deleteHead', {}); ok(r.frames[r.frames.length - 1].error, 'deleteHead on empty flagged');
r = apply('list', S.emptyState('list'), 'deleteTail', {}); ok(r.frames[r.frames.length - 1].error, 'deleteTail on empty flagged');
r = apply('list', S.emptyState('list'), 'search', { value: 1 }); ok(r.frames[r.frames.length - 1].error, 'search on empty flagged');
r = apply('list', build('list', [4]), 'deleteTail', {}); eq(S.contents('list', r.state), [], 'deleteTail single');
r = apply('list', build('list', [4, 6]), 'search', { value: 6 }); ok(r.frames[r.frames.length - 1].hl.found.length === 1, 'search found');
r = apply('list', S.emptyState('list'), 'insertTail', { value: 5 }); eq(S.contents('list', r.state), [5], 'insertTail on empty');
r = apply('list', S.emptyState('list'), 'insertHead', { value: 5 }); eq(S.contents('list', r.state), [5], 'insertHead on empty');
r = apply('list', S.emptyState('list'), 'insertAt', { index: 0, value: 5 }); eq(S.contents('list', r.state), [5], 'insertAt on empty');

// every list frame is internally consistent: next ids exist, labels exist in the code listing
for (const op of S.STRUCTS.list.opOrder) {
  const args = { value: 4, index: 1 };
  const res = apply('list', build('list', [2, 4, 6]), op, args);
  const labels = new Set(S.CODE.list[op].cpp.map((l) => l[1]).concat(S.CODE.list[op].py.map((l) => l[1])));
  for (const f of res.frames) {
    const ids = new Set(f.nodes.map((n) => n.id));
    ok(f.nodes.every((n) => n.next === null || ids.has(n.next)), `${op}: dangling next`);
    ok(f.nodes.every((n) => Number.isInteger(n.col)), `${op}: node without column`);
    ok(f.label === 'idle' || f.label === 'done' || labels.has(f.label), `${op}: label ${f.label} not in listing`);
  }
}

// ---- queue (linked)
let q = build('queue', [1, 2, 3]); eq(S.contents('queue', q), [1, 2, 3], 'enqueue');
r = apply('queue', q, 'dequeue', {}); eq(S.contents('queue', r.state), [2, 3], 'dequeue'); q = r.state;
r = apply('queue', q, 'enqueue', { value: 9 }); eq(S.contents('queue', r.state), [2, 3, 9], 'enqueue after dequeue');
ok(r.frames.some((f) => f.tail !== undefined && f.names.tail === 'rear'), 'queue frames show rear');
let q1 = apply('queue', build('queue', [7]), 'dequeue', {}).state; eq(S.contents('queue', q1), [], 'queue emptied');
r = apply('queue', q1, 'enqueue', { value: 8 }); eq(S.contents('queue', r.state), [8], 'enqueue into emptied queue');
r = apply('queue', S.emptyState('queue'), 'dequeue', {}); ok(r.frames[r.frames.length - 1].error, 'queue underflow flagged');
r = apply('queue', build('queue', [5, 6]), 'peek', {}); eq(S.contents('queue', r.state), [5, 6], 'peek keeps queue');

// ---- stack
let s = build('stack', [1, 2, 3]); eq(S.contents('stack', s), [1, 2, 3], 'push');
r = apply('stack', s, 'pop', {}); eq(S.contents('stack', r.state), [1, 2], 'pop'); 
r = apply('stack', s, 'peek', {}); eq(S.contents('stack', r.state), [1, 2, 3], 'stack peek');
r = apply('stack', S.emptyState('stack'), 'pop', {}); ok(r.frames[r.frames.length - 1].error && /underflow/.test(r.frames[r.frames.length - 1].msg), 'stack underflow');
s = build('stack', [1, 2, 3, 4, 5, 6, 7, 8]); r = apply('stack', s, 'push', { value: 9 });
ok(r.frames[r.frames.length - 1].error && /overflow/.test(r.frames[r.frames.length - 1].msg) && S.contents('stack', r.state).length === 8, 'stack overflow');

// ---- circular queue: wrap-around
let c = S.emptyState('cqueue');
for (const v of [1, 2, 3, 4, 5, 6]) c = apply('cqueue', c, 'enqueue', { value: v }).state;
eq(S.contents('cqueue', c), [1, 2, 3, 4, 5, 6], 'cq full');
r = apply('cqueue', c, 'enqueue', { value: 7 }); ok(r.frames[r.frames.length - 1].error && /full/.test(r.frames[r.frames.length - 1].msg), 'cq full flagged');
c = apply('cqueue', c, 'dequeue', {}).state; c = apply('cqueue', c, 'dequeue', {}).state; eq(S.contents('cqueue', c), [3, 4, 5, 6], 'cq dequeue x2');
r = apply('cqueue', c, 'enqueue', { value: 7 }); ok(r.frames.some((f) => /wraps around/.test(f.msg)), 'cq rear wraps'); c = r.state;
eq(S.contents('cqueue', c), [3, 4, 5, 6, 7], 'cq after wrap'); ok(c.rear === 0 && c.front === 2, 'cq indexes');
for (let i = 0; i < 5; i++) c = apply('cqueue', c, 'dequeue', {}).state;
eq(S.contents('cqueue', c), [], 'cq drained'); r = apply('cqueue', c, 'dequeue', {}); ok(r.frames[r.frames.length - 1].error, 'cq underflow');
c = apply('cqueue', c, 'enqueue', { value: 1 }).state; eq(S.contents('cqueue', c), [1], 'cq reuse after drain');

// ---- layout
let lay = S.layoutChains([{ id: 1, v: 1, next: 2 }, { id: 2, v: 2, next: 3 }, { id: 3, v: 3, next: null }, { id: 9, v: 9, next: null }]);
ok(lay.rows === 2 && lay.nodes.find((n) => n.id === 3).col === 2 && lay.nodes.find((n) => n.id === 9).row === 1, 'chains become rows');
lay = S.layoutChains([{ id: 1, v: 1, next: 2 }, { id: 2, v: 2, next: 1 }]);
ok(lay.nodes.length === 2 && lay.nodes.some((n) => n.loopTo), 'circular list handled');

console.log(`structs: all ${pass} checks passed`);
