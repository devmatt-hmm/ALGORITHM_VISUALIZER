/*
 * Trees engine (window.Trees / module.exports).
 * Frames:
 *   tree: { kind:'tree', nodes:[{id,v,l,r}], root, ptrs:{name:id}, hl:{cmp,found,del,rot,visited}, float:[ids], fade:[ids], extra, bf:{id:balance}|null, label, msg, error }
 *   heap: { kind:'heap', items:[...], hl:{cmp,swap,new,del}, label, msg, error, max:boolean }
 */
(function (root) {
  'use strict';
  const L = (text, label) => [text, label || ''];
  const MAX_NODES = 31, MAX_HEAP = 15;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  class TreeB {
    constructor(st, avl) {
      this.nodes = new Map(); (st.nodes || []).forEach((n) => this.nodes.set(n.id, { id: n.id, v: n.v, l: n.l, r: n.r }));
      this.root = st.root === undefined ? null : st.root; this.nextId = st.nextId || 1;
      this.ptrs = {}; this.hl = {}; this.float = new Set(); this.fade = new Set(); this.extra = null; this.avl = !!avl; this.frames = []; this.dup = false;
    }
    get(id) { return this.nodes.get(id); }
    create(v) { const id = this.nextId++; this.nodes.set(id, { id, v, l: null, r: null }); this.float.add(id); return id; }
    remove(id) { this.nodes.delete(id); this.fade.delete(id); }
    height(id) { if (id === null) return 0; const n = this.get(id); return 1 + Math.max(this.height(n.l), this.height(n.r)); }
    bf(id) { const n = this.get(id); return this.height(n.l) - this.height(n.r); }
    size() { return this.nodes.size; }
    snap(label, msg, o) {
      let bf = null;
      if (this.avl) { bf = {}; const walk = (id) => { if (id === null) return; bf[id] = this.bf(id); walk(this.get(id).l); walk(this.get(id).r); }; walk(this.root); }
      this.frames.push(Object.assign({
        kind: 'tree', label, msg, error: false, root: this.root,
        nodes: [...this.nodes.values()].map((n) => ({ id: n.id, v: n.v, l: n.l, r: n.r })),
        ptrs: Object.assign({}, this.ptrs), hl: clone(this.hl), float: [...this.float], fade: [...this.fade], extra: this.extra ? clone(this.extra) : null, bf,
      }, o || {}));
    }
    done(msg) { this.ptrs = {}; this.hl = {}; this.float.clear(); this.fade.clear(); this.snap('done', msg); }
    state() { return { nodes: [...this.nodes.values()].map((n) => ({ id: n.id, v: n.v, l: n.l, r: n.r })), root: this.root, nextId: this.nextId }; }
    inorder() { const out = []; const w = (id) => { if (id === null) return; const n = this.get(id); w(n.l); out.push(n.v); w(n.r); }; w(this.root); return out; }
  }

  // ------------------------------------------------------------------ BST operations
  function search(b, { value }) {
    let cur = b.root;
    if (cur === null) { b.snap('null', 'The tree is empty, so there is nothing to find.', { error: true }); return; }
    b.ptrs.cur = cur; b.snap('start', `Look for ${value}, starting at the root.`);
    while (cur !== null) {
      const x = b.get(cur).v;
      if (value === x) { b.hl = { found: [cur] }; b.snap('found', `Found ${value}!`); return; }
      const left = value < x;
      b.hl = { cmp: [cur] }; b.snap(left ? 'left' : 'right', `${value} ${left ? '<' : '>'} ${x}: go ${left ? 'left' : 'right'}.`); b.hl = {};
      const nx = b.get(cur)[left ? 'l' : 'r'];
      if (nx === null) { delete b.ptrs.cur; b.snap('null', `That side is empty: ${value} is not in the tree.`, { error: true }); return; }
      cur = nx; b.ptrs.cur = cur;
    }
  }
  function extreme(dir) {
    const nm = dir === 'l' ? 'smallest' : 'largest';
    return (b) => {
      let cur = b.root;
      if (cur === null) { b.snap('null', 'The tree is empty.', { error: true }); return; }
      b.ptrs.cur = cur; b.snap('start', `The ${nm} value is at the far ${dir === 'l' ? 'left' : 'right'}. Start at the root.`);
      while (b.get(cur)[dir] !== null) { cur = b.get(cur)[dir]; b.ptrs.cur = cur; b.snap('walk', `Keep going ${dir === 'l' ? 'left' : 'right'}.`); }
      b.hl = { found: [cur] }; b.snap('found', `No ${dir === 'l' ? 'left' : 'right'} child: ${b.get(cur).v} is the ${nm} value.`);
    };
  }
  function bstInsert(b, { value }) {
    if (b.size() >= MAX_NODES) { b.snap('null', `This demo holds at most ${MAX_NODES} nodes.`, { error: true }); return; }
    if (b.root === null) {
      const n = b.create(value); b.snap('new', `Create a node holding ${value}.`);
      b.root = n; b.float.delete(n); b.snap('null', 'The tree was empty: the new node becomes the root.'); b.done('Inserted.'); return;
    }
    let cur = b.root; b.ptrs.cur = cur; b.snap('start', `Insert ${value}: start at the root.`);
    for (;;) {
      const n = b.get(cur);
      if (value === n.v) { b.hl = { found: [cur] }; b.snap('dup', `${value} is already in the tree. This tree keeps values unique, so nothing is inserted.`, { error: true }); return; }
      const left = value < n.v;
      b.hl = { cmp: [cur] }; b.snap(left ? 'left' : 'right', `${value} ${left ? '<' : '>'} ${n.v}: go ${left ? 'left' : 'right'}.`); b.hl = {};
      const nx = n[left ? 'l' : 'r'];
      if (nx === null) {
        const m = b.create(value); b.snap('new', `That side is empty. Create a node holding ${value}.`);
        n[left ? 'l' : 'r'] = m; b.float.delete(m); b.snap('null', `Attach it as the ${left ? 'left' : 'right'} child of ${n.v}.`); b.done('Inserted.'); return;
      }
      cur = nx; b.ptrs.cur = cur;
    }
  }
  function bstDelete(b, { value }) {
    let cur = b.root, parent = null, dir = null;
    if (cur === null) { b.snap('null', 'The tree is empty: nothing to delete.', { error: true }); return; }
    b.ptrs.cur = cur; b.snap('start', `Find ${value} first, starting at the root.`);
    while (cur !== null && b.get(cur).v !== value) {
      const left = value < b.get(cur).v;
      b.hl = { cmp: [cur] }; b.snap(left ? 'left' : 'right', `${value} ${left ? '<' : '>'} ${b.get(cur).v}: go ${left ? 'left' : 'right'}.`); b.hl = {};
      parent = cur; dir = left ? 'l' : 'r'; cur = b.get(cur)[dir];
      b.ptrs.parent = parent; if (cur === null) delete b.ptrs.cur; else b.ptrs.cur = cur;
    }
    if (cur === null) { b.snap('null', `${value} is not in the tree: nothing was deleted.`, { error: true }); return; }
    b.hl = { found: [cur] }; b.snap('found', `Found ${value}.`);
    const n = b.get(cur);
    const set = (id) => { if (parent === null) b.root = id; else b.get(parent)[dir] = id; };
    if (n.l === null && n.r === null) {
      b.hl = { del: [cur] }; b.fade.add(cur); set(null); b.snap('leaf', 'A leaf (no children): simply cut it off.');
      b.remove(cur); b.done('Deleted.'); return;
    }
    if (n.l === null || n.r === null) {
      const child = n.l === null ? n.r : n.l;
      b.hl = { del: [cur] }; b.fade.add(cur); set(child);
      b.snap(n.l === null ? 'leaf' : 'child', `Only one child: the child (${b.get(child).v}) takes its parent's place.`);
      b.remove(cur); b.done('Deleted.'); return;
    }
    let sp = cur, s = n.r; b.ptrs.succ = s; b.hl = { found: [cur] };
    b.snap('succ', 'Two children: replace the value with the in-order successor, the smallest value in the right subtree.');
    while (b.get(s).l !== null) { sp = s; s = b.get(s).l; b.ptrs.succ = s; b.snap('succ', 'Keep going left to find the smallest.'); }
    const sv = b.get(s).v;
    n.v = sv; b.hl = { found: [cur, s] }; b.snap('copy', `Copy ${sv} into the node being deleted (its old value ${value} is gone).`);
    if (sp === cur) n.r = b.get(s).r; else b.get(sp).l = b.get(s).r;
    b.hl = { del: [s] }; b.fade.add(s); b.snap('remove2', `Now remove the successor's old node (it has no left child, so its right child moves up).`);
    b.remove(s); b.done('Deleted.');
  }

  // ------------------------------------------------------------------ traversals
  function traversal(kind) {
    const title = { inorder: 'In-order', preorder: 'Pre-order', postorder: 'Post-order' }[kind];
    const hint = { inorder: 'left, visit, right', preorder: 'visit, left, right', postorder: 'left, right, visit' }[kind];
    return (b) => {
      if (b.root === null) { b.snap('null', 'The tree is empty: there is nothing to visit.', { error: true }); return; }
      const out = [], vis = [];
      const visit = (id) => {
        out.push(b.get(id).v); vis.push(id); b.ptrs.cur = id;
        b.hl = { visited: vis.slice(), cmp: [id] }; b.extra = { type: 'out', title: `${title} output`, items: out.slice() };
        b.snap('visit', `Visit ${b.get(id).v}. Output so far: ${out.join(', ')}.`);
      };
      const rec = (id) => {
        const n = b.get(id);
        b.ptrs.cur = id; b.hl = { visited: vis.slice() }; b.snap('enter', `${kind}(${n.v}): ${hint}.`);
        if (kind === 'preorder') visit(id);
        if (n.l !== null) { b.ptrs.cur = id; b.hl = { visited: vis.slice() }; b.snap('left', `Go left from ${n.v}.`); rec(n.l); }
        if (kind === 'inorder') visit(id);
        if (n.r !== null) { b.ptrs.cur = id; b.hl = { visited: vis.slice() }; b.snap('right', `Go right from ${n.v}.`); rec(n.r); }
        if (kind === 'postorder') visit(id);
      };
      b.extra = { type: 'out', title: `${title} output`, items: [] };
      rec(b.root);
      b.ptrs = {}; b.hl = { visited: vis.slice() }; b.snap('done', `${title} traversal complete: ${out.join(', ')}.`);
    };
  }
  function levelorder(b) {
    if (b.root === null) { b.snap('null', 'The tree is empty: there is nothing to visit.', { error: true }); return; }
    const out = [], vis = [], q = [b.root];
    const ex = () => { b.extra = { type: 'out', title: 'Level-order output', items: out.slice(), queue: q.map((id) => b.get(id).v) }; };
    ex(); b.snap('push', 'Level-order uses a queue. Start with the root in the queue.');
    while (q.length) {
      const id = q.shift(), n = b.get(id); b.ptrs.cur = id; ex(); b.hl = { visited: vis.slice(), cmp: [id] };
      b.snap('pop', `Take ${n.v} from the front of the queue.`);
      out.push(n.v); vis.push(id); ex(); b.hl = { visited: vis.slice(), cmp: [id] }; b.snap('visit', `Visit ${n.v}. Output so far: ${out.join(', ')}.`);
      [n.l, n.r].forEach((c) => { if (c !== null) q.push(c); });
      if (n.l !== null || n.r !== null) { ex(); b.hl = { visited: vis.slice() }; b.snap('push', `Add ${n.v}'s children to the back of the queue.`); }
    }
    b.ptrs = {}; ex(); b.hl = { visited: vis.slice() }; b.snap('done', `Level-order traversal complete: ${out.join(', ')}.`);
  }

  // ------------------------------------------------------------------ AVL insertion
  function avlInsert(b, { value }) {
    if (b.size() >= MAX_NODES) { b.snap('null', `This demo holds at most ${MAX_NODES} nodes.`, { error: true }); return; }
    const rotR = (id, set) => { const y = b.get(id).l; b.get(id).l = b.get(y).r; b.get(y).r = id; set(y); return y; };
    const rotL = (id, set) => { const y = b.get(id).r; b.get(id).r = b.get(y).l; b.get(y).l = id; set(y); return y; };
    const ins = (id, set) => {
      if (id === null) {
        const n = b.create(value); b.snap('new', `Create a node holding ${value}.`);
        set(n); b.float.delete(n); b.snap('null', 'Attach it at the empty spot.'); return;
      }
      const n = b.get(id); b.ptrs.cur = id;
      if (value === n.v) { b.dup = true; b.hl = { found: [id] }; b.snap('dup', `${value} is already in the tree, so nothing is inserted.`, { error: true }); return; }
      const left = value < n.v;
      b.hl = { cmp: [id] }; b.snap(left ? 'left' : 'right', `${value} ${left ? '<' : '>'} ${n.v}: go ${left ? 'left' : 'right'}.`); b.hl = {};
      ins(n[left ? 'l' : 'r'], (x) => { n[left ? 'l' : 'r'] = x; });
      if (b.dup) return;
      b.ptrs = { cur: id }; const f = b.bf(id); b.hl = { cmp: [id] };
      b.snap('balance', `Back at ${n.v}: balance = height(left) − height(right) = ${f}${Math.abs(f) > 1 ? ' → unbalanced!' : ' → fine.'}`); b.hl = {};
      if (Math.abs(f) <= 1) return;
      b.hl = { rot: [id] };
      if (f > 1) {
        const lc = n.l;
        if (b.bf(lc) >= 0) { b.snap('LL', `Left-Left case: the left side is too tall. Rotate right at ${n.v}.`); rotR(id, set); b.snap('rotate', 'Rotated right: the old left child is now the subtree root.'); }
        else {
          b.snap('LR', `Left-Right case: first rotate left at ${b.get(lc).v}, then right at ${n.v}.`);
          rotL(lc, (x) => { n.l = x; }); b.snap('rotate', `Rotated left at ${b.get(lc).v}: now it is a Left-Left case.`);
          rotR(id, set); b.snap('rotate', 'Rotated right: balanced.');
        }
      } else {
        const rc = n.r;
        if (b.bf(rc) <= 0) { b.snap('RR', `Right-Right case: the right side is too tall. Rotate left at ${n.v}.`); rotL(id, set); b.snap('rotate', 'Rotated left: the old right child is now the subtree root.'); }
        else {
          b.snap('RL', `Right-Left case: first rotate right at ${b.get(rc).v}, then left at ${n.v}.`);
          rotR(rc, (x) => { n.r = x; }); b.snap('rotate', `Rotated right at ${b.get(rc).v}: now it is a Right-Right case.`);
          rotL(id, set); b.snap('rotate', 'Rotated left: balanced.');
        }
      }
      b.hl = {};
    };
    ins(b.root, (x) => { b.root = x; });
    if (!b.dup) b.done('Inserted and balanced.');
  }

  // ------------------------------------------------------------------ heaps
  const heapFrame = (a, max, label, msg, hl, error) => ({ kind: 'heap', items: a.slice(), max, label, msg, hl: hl || {}, error: !!error });
  const heapOps = (max) => {
    const better = (x, y) => (max ? x > y : x < y), nm = max ? 'larger' : 'smaller', rel = max ? '>' : '<';
    return {
      insert: {
        name: 'Insert', args: ['value'], cost: 'O(log n)',
        run(a, { value }, F) {
          if (a.length >= MAX_HEAP) { F.push(heapFrame(a, max, 'add', `This demo holds at most ${MAX_HEAP} items.`, {}, true)); return; }
          a.push(value); let i = a.length - 1;
          F.push(heapFrame(a, max, 'add', `Put ${value} at the end of the array (the next free spot in the tree).`, { new: [i] }));
          while (i > 0) {
            const p = (i - 1) >> 1;
            const sw = better(a[i], a[p]);
            F.push(heapFrame(a, max, 'cmp', `Is ${a[i]} ${rel} its parent ${a[p]}? ${sw ? 'Yes: swap them.' : 'No: the heap property holds, stop.'}`, { cmp: [i, p] }));
            if (!sw) break;
            [a[i], a[p]] = [a[p], a[i]]; F.push(heapFrame(a, max, 'swap', `Swapped: ${a[p]} moves up.`, { swap: [i, p] })); i = p;
          }
        },
      },
      extract: {
        name: max ? 'Extract max' : 'Extract min', args: [], cost: 'O(log n)',
        run(a, o, F) {
          if (!a.length) { F.push(heapFrame(a, max, 'take', 'The heap is empty: nothing to extract.', {}, true)); return; }
          const top = a[0];
          F.push(heapFrame(a, max, 'take', `The ${max ? 'largest' : 'smallest'} value is always the root: ${top}. Take it out.`, { del: [0] }));
          const last = a.pop();
          if (!a.length) { F.push(heapFrame(a, max, 'move', `${top} was the only item: the heap is now empty.`)); return; }
          a[0] = last; F.push(heapFrame(a, max, 'move', `Move the last item (${last}) to the root to fill the gap.`, { new: [0] }));
          let i = 0; const n = a.length;
          for (;;) {
            const l = 2 * i + 1, r = l + 1; let m = i;
            if (l < n && better(a[l], a[m])) m = l;
            if (r < n && better(a[r], a[m])) m = r;
            F.push(heapFrame(a, max, 'cmp', m === i ? `${a[i]} is ${max ? 'at least as large as' : 'at most as large as'} its children: the heap property holds, stop.` : `Compare with the children: the ${nm} child is ${a[m]}, so swap with it.`, { cmp: [i, ...(l < n ? [l] : []), ...(r < n ? [r] : [])] }));
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; F.push(heapFrame(a, max, 'swap', `Swapped: ${a[i]} moves up.`, { swap: [i, m] })); i = m;
          }
        },
      },
      peek: {
        name: max ? 'Peek (max)' : 'Peek (min)', args: [], cost: 'O(1)', readonly: true,
        run(a, o, F) {
          if (!a.length) { F.push(heapFrame(a, max, 'peek', 'The heap is empty.', {}, true)); return; }
          F.push(heapFrame(a, max, 'peek', `The ${max ? 'largest' : 'smallest'} value is the root: ${a[0]}. Nothing is removed.`, { new: [0] }));
        },
      },
    };
  };

  // ------------------------------------------------------------------ structure table
  const TRAV = { inorder: { name: 'In-order traversal', args: [], cost: 'O(n)', readonly: true, run: traversal('inorder') },
    preorder: { name: 'Pre-order traversal', args: [], cost: 'O(n)', readonly: true, run: traversal('preorder') },
    postorder: { name: 'Post-order traversal', args: [], cost: 'O(n)', readonly: true, run: traversal('postorder') },
    levelorder: { name: 'Level-order traversal', args: [], cost: 'O(n)', readonly: true, run: levelorder } };
  const BST_OPS = Object.assign({
    insert: { name: 'Insert', args: ['value'], cost: 'O(h)', run: bstInsert },
    search: { name: 'Search', args: ['value'], cost: 'O(h)', readonly: true, run: search },
    delete: { name: 'Delete', args: ['value'], cost: 'O(h)', run: bstDelete },
    findMin: { name: 'Find minimum', args: [], cost: 'O(h)', readonly: true, run: extreme('l') },
    findMax: { name: 'Find maximum', args: [], cost: 'O(h)', readonly: true, run: extreme('r') },
  }, TRAV);
  const AVL_OPS = Object.assign({
    insert: { name: 'Insert (with rotations)', args: ['value'], cost: 'O(log n)', run: avlInsert },
    search: { name: 'Search', args: ['value'], cost: 'O(log n)', readonly: true, run: search },
  }, TRAV);

  const STRUCTS = {
    bst: { name: 'Binary search tree', type: 'tree', ops: BST_OPS, order: ['insert', 'search', 'delete', 'findMin', 'findMax', 'inorder', 'preorder', 'postorder', 'levelorder'] },
    avl: { name: 'AVL tree (self-balancing)', type: 'tree', avl: true, ops: AVL_OPS, order: ['insert', 'search', 'inorder', 'preorder', 'postorder', 'levelorder'] },
    minheap: { name: 'Min-heap', type: 'heap', max: false, ops: heapOps(false), order: ['insert', 'extract', 'peek'] },
    maxheap: { name: 'Max-heap', type: 'heap', max: true, ops: heapOps(true), order: ['insert', 'extract', 'peek'] },
  };

  // ------------------------------------------------------------------ code listings
  const NODE = { cpp: [L('struct Node {'), L('  int data;'), L('  Node *left = nullptr, *right = nullptr;'), L('};'), L('')],
    py: [L('class Node:'), L('    def __init__(self, data):'), L('        self.data = data'), L('        self.left = None'), L('        self.right = None'), L('')] };
  const travCode = (nm, order) => {
    const cpp = [L(`void ${nm}(Node* n) {`, 'enter'), L('  if (n == nullptr) return;')];
    const py = [L(`def ${nm}(n):`, 'enter'), L('    if n is None:'), L('        return')];
    const parts = { l: ['  ' + nm + '(n->left);', '    ' + nm + '(n.left)', 'left'], v: ['  cout << n->data << " ";', '    print(n.data, end=" ")', 'visit'], r: ['  ' + nm + '(n->right);', '    ' + nm + '(n.right)', 'right'] };
    order.forEach((k) => { cpp.push(L(parts[k][0], parts[k][2])); py.push(L(parts[k][1], parts[k][2])); });
    cpp.push(L('}', 'done')); return { cpp, py };
  };
  const heapCode = (max) => {
    const o = max ? '>' : '<';
    return {
      prelude: { cpp: [L('vector<int> h;   // h[i]: children at 2i+1 and 2i+2'), L('')], py: [L('h = []   # h[i]: children at 2*i+1 and 2*i+2'), L('')] },
      insert: {
        cpp: [L('void push(int v) {'), L('  h.push_back(v);', 'add'), L('  int i = h.size() - 1;'), L(`  while (i > 0 && h[i] ${o} h[(i - 1) / 2]) {`, 'cmp'), L('    swap(h[i], h[(i - 1) / 2]);', 'swap'), L('    i = (i - 1) / 2;'), L('  }'), L('}')],
        py: [L('def push(v):'), L('    h.append(v)', 'add'), L('    i = len(h) - 1'), L(`    while i > 0 and h[i] ${o} h[(i - 1) // 2]:`, 'cmp'), L('        h[i], h[(i - 1) // 2] = h[(i - 1) // 2], h[i]', 'swap'), L('        i = (i - 1) // 2')],
      },
      extract: {
        cpp: [L('int pop() {'), L('  int top = h[0];', 'take'), L('  h[0] = h.back(); h.pop_back();', 'move'), L('  int i = 0, n = h.size();'), L('  while (true) {'), L('    int l = 2 * i + 1, r = l + 1, m = i;'),
          L(`    if (l < n && h[l] ${o} h[m]) m = l;`, 'cmp'), L(`    if (r < n && h[r] ${o} h[m]) m = r;`, 'cmp'), L('    if (m == i) break;'), L('    swap(h[i], h[m]); i = m;', 'swap'), L('  }'), L('  return top;'), L('}')],
        py: [L('def pop():'), L('    top = h[0]', 'take'), L('    last = h.pop()'), L('    if h:'), L('        h[0] = last', 'move'), L('        i, n = 0, len(h)'), L('        while True:'), L('            l, r, m = 2 * i + 1, 2 * i + 2, i'),
          L(`            if l < n and h[l] ${o} h[m]: m = l`, 'cmp'), L(`            if r < n and h[r] ${o} h[m]: m = r`, 'cmp'), L('            if m == i: break'), L('            h[i], h[m] = h[m], h[i]; i = m', 'swap'), L('    return top')],
      },
      peek: { cpp: [L('int peek() {'), L('  return h[0];', 'peek'), L('}')], py: [L('def peek():'), L('    return h[0]', 'peek')] },
    };
  };
  const CODE = {
    bst: {
      prelude: NODE,
      insert: {
        cpp: [L('Node* insert(Node* n, int v) {', 'start'), L('  if (n == nullptr) return new Node{v};', 'null new'), L('  if (v < n->data) n->left = insert(n->left, v);', 'left'),
          L('  else if (v > n->data) n->right = insert(n->right, v);', 'right'), L('  return n;   // duplicates are ignored', 'dup'), L('}', 'done')],
        py: [L('def insert(n, v):', 'start'), L('    if n is None:', 'null new'), L('        return Node(v)', 'null new'), L('    if v < n.data:', 'left'), L('        n.left = insert(n.left, v)', 'left'), L('    elif v > n.data:', 'right'),
          L('        n.right = insert(n.right, v)', 'right'), L('    return n   # duplicates are ignored', 'dup done')],
      },
      search: {
        cpp: [L('Node* search(Node* n, int v) {'), L('  while (n != nullptr && n->data != v)', 'start'), L('    n = (v < n->data) ? n->left : n->right;', 'left right'), L('  return n;   // nullptr if not found', 'found null'), L('}')],
        py: [L('def search(n, v):'), L('    while n is not None and n.data != v:', 'start'), L('        n = n.left if v < n.data else n.right', 'left right'), L('    return n   # None if not found', 'found null')],
      },
      delete: {
        cpp: [L('Node* removeNode(Node* n, int v) {'), L('  if (n == nullptr) return n;', 'null'), L('  if (v < n->data) n->left = removeNode(n->left, v);', 'left start'), L('  else if (v > n->data) n->right = removeNode(n->right, v);', 'right'),
          L('  else {', 'found'), L('    if (n->left == nullptr) { Node* t = n->right; delete n; return t; }', 'leaf'), L('    if (n->right == nullptr) { Node* t = n->left; delete n; return t; }', 'child'),
          L('    Node* s = n->right;', 'succ'), L('    while (s->left) s = s->left;', 'succ'), L('    n->data = s->data;', 'copy'), L('    n->right = removeNode(n->right, s->data);', 'remove2'), L('  }'), L('  return n;', 'done'), L('}')],
        py: [L('def remove(n, v):'), L('    if n is None:', 'null'), L('        return n', 'null'), L('    if v < n.data:', 'left start'), L('        n.left = remove(n.left, v)', 'left'), L('    elif v > n.data:', 'right'), L('        n.right = remove(n.right, v)', 'right'),
          L('    else:', 'found'), L('        if n.left is None:', 'leaf'), L('            return n.right', 'leaf'), L('        if n.right is None:', 'child'), L('            return n.left', 'child'), L('        s = n.right', 'succ'), L('        while s.left:', 'succ'), L('            s = s.left', 'succ'),
          L('        n.data = s.data', 'copy'), L('        n.right = remove(n.right, s.data)', 'remove2'), L('    return n', 'done')],
      },
      findMin: { cpp: [L('Node* findMin(Node* n) {'), L('  while (n->left != nullptr)', 'start'), L('    n = n->left;', 'walk'), L('  return n;', 'found'), L('}')], py: [L('def find_min(n):'), L('    while n.left is not None:', 'start'), L('        n = n.left', 'walk'), L('    return n', 'found')] },
      findMax: { cpp: [L('Node* findMax(Node* n) {'), L('  while (n->right != nullptr)', 'start'), L('    n = n->right;', 'walk'), L('  return n;', 'found'), L('}')], py: [L('def find_max(n):'), L('    while n.right is not None:', 'start'), L('        n = n.right', 'walk'), L('    return n', 'found')] },
      inorder: travCode('inorder', ['l', 'v', 'r']), preorder: travCode('preorder', ['v', 'l', 'r']), postorder: travCode('postorder', ['l', 'r', 'v']),
      levelorder: {
        cpp: [L('void levelOrder(Node* root) {'), L('  queue<Node*> q;'), L('  q.push(root);', 'push'), L('  while (!q.empty()) {'), L('    Node* n = q.front(); q.pop();', 'pop'), L('    cout << n->data << " ";', 'visit'), L('    if (n->left)  q.push(n->left);', 'push'), L('    if (n->right) q.push(n->right);', 'push'), L('  }'), L('}', 'done')],
        py: [L('from collections import deque'), L('def level_order(root):'), L('    q = deque([root])', 'push'), L('    while q:'), L('        n = q.popleft()', 'pop'), L('        print(n.data, end=" ")', 'visit'), L('        if n.left:  q.append(n.left)', 'push'), L('        if n.right: q.append(n.right)', 'push'), L('', 'done')],
      },
    },
    avl: {
      prelude: { cpp: [L('struct Node {'), L('  int data, height = 1;'), L('  Node *left = nullptr, *right = nullptr;'), L('};'), L('')], py: [...NODE.py] },
      insert: {
        cpp: [L('Node* insert(Node* n, int v) {'), L('  if (!n) return new Node{v};', 'new null'), L('  if (v < n->data) n->left = insert(n->left, v);', 'left'), L('  else if (v > n->data) n->right = insert(n->right, v);', 'right'), L('  else return n;', 'dup'),
          L('  update(n);                         // recompute height', 'balance'), L('  int b = balance(n);   // height(left) - height(right)', 'balance'), L('  if (b > 1 && balance(n->left) >= 0) return rotateRight(n);', 'LL'), L('  if (b < -1 && balance(n->right) <= 0) return rotateLeft(n);', 'RR'),
          L('  if (b > 1) { n->left = rotateLeft(n->left); return rotateRight(n); }', 'LR'), L('  if (b < -1) { n->right = rotateRight(n->right); return rotateLeft(n); }', 'RL'), L('  return n;', 'rotate done'), L('}')],
        py: [L('def insert(n, v):'), L('    if n is None:', 'new null'), L('        return Node(v)', 'new null'), L('    if v < n.data:', 'left'), L('        n.left = insert(n.left, v)', 'left'), L('    elif v > n.data:', 'right'), L('        n.right = insert(n.right, v)', 'right'), L('    else:', 'dup'), L('        return n', 'dup'),
          L('    update(n)                       # recompute height', 'balance'), L('    b = balance(n)   # height(left) - height(right)', 'balance'), L('    if b > 1 and balance(n.left) >= 0: return rotate_right(n)', 'LL'), L('    if b < -1 and balance(n.right) <= 0: return rotate_left(n)', 'RR'),
          L('    if b > 1:', 'LR'), L('        n.left = rotate_left(n.left); return rotate_right(n)', 'LR'), L('    if b < -1:', 'RL'), L('        n.right = rotate_right(n.right); return rotate_left(n)', 'RL'), L('    return n', 'rotate done')],
      },
      search: null, inorder: null, preorder: null, postorder: null, levelorder: null,
    },
    minheap: heapCode(false),
    maxheap: heapCode(true),
  };
  ['search', 'inorder', 'preorder', 'postorder', 'levelorder'].forEach((k) => { CODE.avl[k] = CODE.bst[k]; });

  // ------------------------------------------------------------------ state + running
  function emptyState(kind) { return STRUCTS[kind].type === 'heap' ? { items: [] } : { nodes: [], root: null, nextId: 1 }; }

  function stateFrame(kind, st) {
    const S = STRUCTS[kind];
    if (S.type === 'heap') return heapFrame(st.items, S.max, 'idle', st.items.length ? 'Pick an operation and press Run.' : 'The heap is empty. Pick an operation and press Run.');
    const b = new TreeB(st, S.avl); b.snap('idle', st.nodes.length ? 'Pick an operation and press Run.' : 'The tree is empty (root is NULL). Pick an operation and press Run.');
    return b.frames[0];
  }

  /** -> { frames, state } or { error } */
  function runOp(kind, opId, state, args) {
    const S = STRUCTS[kind], op = S && S.ops[opId];
    if (!op) return { error: 'Unknown operation.' };
    for (const a of op.args) {
      if (!Number.isInteger(args[a])) return { error: 'The value must be a whole number.' };
      if (Math.abs(args[a]) > 999) return { error: 'Keep the value between -999 and 999 so it fits in a node.' };
    }
    if (S.type === 'heap') {
      const a = state.items.slice(), F = [heapFrame(a, S.max, 'idle', `Running ${op.name}…`)];
      op.run(a, args, F);
      return { frames: F, state: { items: a } };
    }
    const b = new TreeB(clone(state), S.avl);
    b.snap('idle', `Running ${op.name}…`);
    op.run(b, args);
    return { frames: b.frames, state: b.state() };
  }

  function contents(kind, st) {
    if (STRUCTS[kind].type === 'heap') return st.items.slice();
    const b = new TreeB(clone(st), false); return b.inorder();
  }

  // ------------------------------------------------------------------ layout
  /** nodes:[{id,l,r}] -> { pos:{id:{x,y}}, width, height }; x = in-order rank, y = depth. roots = list of root ids. */
  function layoutBinary(nodes, roots) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const pos = {}; let rank = 0, maxDepth = 0;
    const walk = (start) => {
      const st = [[start, 0, 0]]; // [id, depth, stage]
      while (st.length) {
        const top = st[st.length - 1], n = byId.get(top[0]);
        if (!n || (pos[n.id] && top[2] === 0)) { st.pop(); continue; }
        if (top[2] === 0) { top[2] = 1; if (n.l !== null && n.l !== undefined && byId.has(n.l) && !pos[n.l]) st.push([n.l, top[1] + 1, 0]); }
        else if (top[2] === 1) { top[2] = 2; pos[n.id] = { x: rank++, y: top[1] }; maxDepth = Math.max(maxDepth, top[1]); if (n.r !== null && n.r !== undefined && byId.has(n.r) && !pos[n.r]) st.push([n.r, top[1] + 1, 0]); }
        else st.pop();
      }
    };
    roots.forEach(walk);
    nodes.forEach((n) => { if (!pos[n.id]) walk(n.id); });
    return { pos, width: Math.max(1, rank), height: maxDepth + 1 };
  }

  const api = { STRUCTS, CODE, runOp, stateFrame, emptyState, contents, layoutBinary, MAX_NODES, MAX_HEAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trees = api;
})(typeof window !== 'undefined' ? window : globalThis);
