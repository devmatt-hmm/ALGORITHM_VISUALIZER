'use strict';
const assert = require('assert');
const R = require('../media/recur.js');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const build = (id, p) => { const v = R.validate(id, p); ok(!v.error, `${id} ${v.error}`); return R.build(id, v.params); };
const last = (b) => b.frames[b.frames.length - 1];

// results + call counts
let b = build('fact', { n: 5 }); ok(b.result === 120 && last(b).calls === 5 && last(b).maxDepth === 5, 'fact(5)');
b = build('fact', { n: 0 }); ok(b.result === 1 && last(b).calls === 1, 'fact(0)');
b = build('fib', { n: 6 }); ok(b.result === 8 && last(b).calls === 25, 'fib(6) has 25 calls: ' + last(b).calls);
ok(last(b).repeated === 25 - 7, 'fib(6) repeated calls: ' + last(b).repeated);
b = build('fib', { n: 8 }); ok(b.result === 21 && last(b).calls === 67, 'fib(8)');
b = build('fibMemo', { n: 6 }); ok(b.result === 8 && last(b).calls === 11, 'fibMemo(6) has 11 calls: ' + last(b).calls);
ok(b.frames.some((f) => f.st.includes(4)), 'memo hits marked'); ok(last(b).extra && last(b).extra.type === 'table' && last(b).extra.rows.length === 5, 'memo table');
b = build('fibMemo', { n: 12 }); ok(b.result === 144, 'fibMemo(12)');
b = build('hanoi', { n: 3 }); ok(b.result === 7 && last(b).calls === 7, 'hanoi(3): 7 moves, 7 calls');
const lp = last(b).extra.pegs; ok(lp.A.length === 0 && lp.B.length === 0 && lp.C.join() === '3,2,1', 'hanoi ends with all disks on C: ' + JSON.stringify(lp));
for (const f of b.frames) { if (f.extra && f.extra.pegs) for (const p of Object.values(f.extra.pegs)) ok(p.every((d, i) => i === 0 || p[i - 1] > d), 'no big disk on a small one'); }
b = build('hanoi', { n: 4 }); ok(b.result === 15 && last(b).calls === 15, 'hanoi(4): 15 moves, 15 calls');
b = build('gcd', { a: 48, b: 18 }); ok(b.result === 6 && last(b).calls === 4, 'gcd(48,18)');
b = build('gcd', { a: 7, b: 0 }); ok(b.result === 7 && last(b).calls === 1, 'gcd(7,0)');
b = build('power', { base: 2, exp: 10 }); ok(b.result === 1024, 'power(2,10)');
b = build('power', { base: 3, exp: 0 }); ok(b.result === 1, 'power(3,0)');

// frames are consistent
for (const id of R.ORDER) {
  const v = R.ALGOS[id].params.reduce((o, d) => ({ ...o, [d.name]: d.def }), {});
  const bb = build(id, v);
  const labels = new Set(R.ALGOS[id].code.cpp.concat(R.ALGOS[id].code.py).flatMap((l) => l[1].split(' ')));
  let prev = 0;
  for (const f of bb.frames) {
    ok(f.created >= prev, `${id}: created never shrinks`); prev = f.created;
    ok(f.stack.every((s) => s < f.created) && (f.cur === null || f.cur < f.created), `${id}: ids valid`);
    ok(!f.label || f.label === 'done' || labels.has(f.label) || f.label === 'enter' || f.label === 'ret', `${id}: label ${f.label} missing in listing`);
    ok(f.stack.length === 0 || f.st[f.stack[f.stack.length - 1]] === 1 || f.st[f.stack[f.stack.length - 1]] === 3, `${id}: top of stack running`);
  }
  ok(last(bb).stack.length === 0 && last(bb).st.every((s) => s === 3 || s === 4), `${id}: everything returned`);
}

// validation
ok(R.validate('fib', { n: 'x' }).error && R.validate('fib', { n: '99' }).error && R.validate('fib', { n: '-1' }).error && R.validate('fib', { n: '2.5' }).error, 'bad params rejected');
ok(R.validate('gcd', { a: '0', b: '0' }).error, 'gcd(0,0) rejected'); ok(R.validate('hanoi', { n: '5' }).error, 'hanoi too large rejected');

// layout: parents centred over children, leaves spaced
b = build('fib', { n: 4 }); const lay = R.layoutTree(last(b).st.map((_, i) => ({ id: i, parent: b.events.find((e) => e.k === 'call' && e.id === i).parent })));
ok(lay.width === 5 && lay.height === 4 && lay.x[0] === (lay.x[1] + lay.x[6]) / 2, 'tree layout');
const deep = R.layoutTree(Array.from({ length: 5000 }, (_, i) => ({ id: i, parent: i ? i - 1 : null }))); ok(deep.height === 5000 && deep.width === 1, 'deep chain does not overflow the stack');

// unfinished (truncated) user-style events
const fr = R.framesFromEvents([{ k: 'call', id: 0, parent: null, text: 'f(1)' }, { k: 'call', id: 1, parent: 0, text: 'f(2)' }]);
ok(/stopped/.test(fr[fr.length - 1].msg) && fr[fr.length - 1].stack.length === 2, 'unfinished recursion explained');
console.log(`recur: all ${pass} checks passed`);
