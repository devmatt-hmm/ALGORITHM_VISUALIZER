/*
 * Data-structure engine. Works in the webview (window.Structs) and in Node (module.exports).
 * Each operation turns the current structure into a list of animation "frames" plus the new state.
 *
 * Frame kinds:
 *   list : { nodes:[{id,v,next,col,row?,float?,fade?}], head, tail, names, ptrs:{name:id}, hl:{cmp,found,del}, ... }
 *   stack: { items, cap, hl:{top|pop}, ... }
 *   slots: { cells, front, rear, size, cap, hl:{idx}, ... }
 * Every frame also has { label (code line tag), msg, error }.
 */
(function (root) {
  'use strict';
  const L = (text, label) => [text, label || ''];

  // =============================================================== linked list builder
  class ListB {
    constructor(st, names, useTail) {
      this.nodes = new Map(); this.nextId = st.nextId;
      st.items.forEach((it, i) => this.nodes.set(it.id, { id: it.id, v: it.v, next: i + 1 < st.items.length ? st.items[i + 1].id : null }));
      this.head = st.items.length ? st.items[0].id : null;
      this.tail = st.items.length ? st.items[st.items.length - 1].id : null;
      this.pos = new Map(); st.items.forEach((it, i) => this.pos.set(it.id, i));
      this.ptrs = {}; this.hl = {}; this.float = new Set(); this.fade = new Set();
      this.names = names; this.useTail = !!useTail; this.frames = [];
    }
    len() { let n = 0; const seen = new Set(); for (let id = this.head; id !== null && !seen.has(id); id = this.nodes.get(id).next) { seen.add(id); n++; } return n; }
    create(v, col) { const id = this.nextId++; this.nodes.set(id, { id, v, next: null }); this.pos.set(id, col); this.float.add(id); return id; }
    next(id) { return this.nodes.get(id).next; }
    val(id) { return this.nodes.get(id).v; }
    setNext(id, to) { this.nodes.get(id).next = to; }
    remove(id) { this.nodes.delete(id); this.fade.delete(id); this.pos.delete(id); }
    renumber() { let i = 0; const seen = new Set(); for (let id = this.head; id !== null && !seen.has(id); id = this.next(id)) { seen.add(id); this.pos.set(id, i++); } }
    snap(label, msg, extra) {
      this.frames.push(Object.assign({
        kind: 'list', label, msg, error: false,
        nodes: [...this.nodes.values()].map((n) => ({ id: n.id, v: n.v, next: n.next, col: this.pos.get(n.id), row: 0, float: this.float.has(n.id), fade: this.fade.has(n.id) })),
        head: this.head, tail: this.useTail ? this.tail : undefined, names: this.names,
        ptrs: Object.assign({}, this.ptrs), hl: JSON.parse(JSON.stringify(this.hl)),
      }, extra || {}));
    }
    done(msg) { this.ptrs = {}; this.hl = {}; this.float.clear(); this.fade.clear(); this.renumber(); this.snap('done', msg); }
    state() {
      const items = []; const seen = new Set();
      for (let id = this.head; id !== null && !seen.has(id); id = this.next(id)) { seen.add(id); items.push({ id, v: this.val(id) }); }
      return { items, nextId: this.nextId };
    }
  }

  // ---------------------------------------------------------------- list operations
  const walkTo = (b, stopWhen, what) => { // generic "move cur forward" loop; returns cur
    let cur = b.ptrs.cur;
    while (!stopWhen(cur)) { cur = b.next(cur); b.ptrs.cur = cur; b.snap('walk', what); }
    return cur;
  };

  const LIST_OPS = {
    insertHead: {
      name: 'Insert at head', args: ['value'], cost: 'O(1)',
      run(b, { value }) {
        const n = b.create(value, 0);
        b.snap('new', `Create a new node holding ${value}.`);
        b.setNext(n, b.head);
        b.snap('link', b.head === null ? 'The list is empty, so the new node points to NULL.' : 'Point the new node at the current head.');
        b.head = n; b.float.delete(n); b.renumber();
        b.snap('head', 'Move head to the new node.');
      },
    },
    insertTail: {
      name: 'Insert at tail', args: ['value'], cost: 'O(n)',
      run(b, { value }) {
        const n = b.create(value, b.len());
        b.snap('new', `Create a new node holding ${value}.`);
        if (b.head === null) { b.head = n; b.float.delete(n); b.renumber(); b.snap('empty', 'The list was empty, so the new node becomes the head.'); return; }
        b.ptrs.cur = b.head; b.snap('start', 'Start at the head.');
        while (b.next(b.ptrs.cur) !== null) { b.ptrs.cur = b.next(b.ptrs.cur); b.snap('walk', 'cur.next is not NULL, so move cur forward.'); }
        b.snap('check', 'cur.next is NULL: cur is the last node.');
        b.setNext(b.ptrs.cur, n); b.float.delete(n); b.renumber();
        b.snap('link', 'Point the last node at the new node.');
      },
    },
    insertAt: {
      name: 'Insert at index', args: ['index', 'value'], cost: 'O(n)',
      validate: (a, n) => (a.index < 0 || a.index > n ? `The index must be between 0 and ${n} for a list with ${n} node${n === 1 ? '' : 's'}.` : null),
      run(b, { index, value }) {
        const n = b.create(value, index);
        b.snap('new', `Create a new node holding ${value}.`);
        if (index === 0) {
          b.setNext(n, b.head); b.snap('headcase', 'Index 0 is the head: point the new node at the old head…');
          b.head = n; b.float.delete(n); b.renumber(); b.snap('headcase', '…and make it the new head.'); return;
        }
        b.ptrs.cur = b.head; b.snap('start', `Walk to the node just before index ${index}.`);
        for (let k = 0; k < index - 1; k++) { b.ptrs.cur = b.next(b.ptrs.cur); b.snap('walk', 'Move cur forward.'); }
        b.setNext(n, b.next(b.ptrs.cur)); b.snap('link1', 'Point the new node at what cur points to.');
        b.setNext(b.ptrs.cur, n); b.float.delete(n); b.renumber(); b.snap('link2', 'Point cur at the new node.');
      },
    },
    deleteHead: {
      name: 'Delete head', args: [], cost: 'O(1)',
      run(b) {
        if (b.head === null) { b.snap('empty', 'The list is empty: there is nothing to delete.', { error: true }); return; }
        b.ptrs.tmp = b.head; b.snap('tmp', 'Remember the head node in tmp.');
        b.head = b.next(b.head); b.fade.add(b.ptrs.tmp); b.snap('head', 'Move head to the next node.');
        b.remove(b.ptrs.tmp); delete b.ptrs.tmp; b.renumber(); b.snap('delete', 'Free the old head node.');
      },
    },
    deleteTail: {
      name: 'Delete tail', args: [], cost: 'O(n)',
      run(b) {
        if (b.head === null) { b.snap('empty', 'The list is empty: there is nothing to delete.', { error: true }); return; }
        if (b.next(b.head) === null) {
          b.fade.add(b.head); b.snap('single', 'Only one node: delete it and the list becomes empty.');
          b.remove(b.head); b.head = null; b.done('The list is now empty.'); return;
        }
        b.ptrs.cur = b.head; b.snap('start', 'Start at the head, with prev behind cur.');
        while (b.next(b.ptrs.cur) !== null) { b.ptrs.prev = b.ptrs.cur; b.ptrs.cur = b.next(b.ptrs.cur); b.snap('walk', 'cur.next is not NULL: move prev and cur forward.'); }
        b.snap('check', 'cur.next is NULL: cur is the last node.');
        b.setNext(b.ptrs.prev, null); b.fade.add(b.ptrs.cur); b.snap('unlink', 'Make prev the new end of the list.');
        b.remove(b.ptrs.cur); b.done('Free the old last node.');
      },
    },
    deleteValue: {
      name: 'Delete by value', args: ['value'], cost: 'O(n)',
      run(b, { value }) {
        b.ptrs.cur = b.head; b.snap('start', `Look for ${value}, starting at the head.`);
        while (b.ptrs.cur !== null && b.val(b.ptrs.cur) !== value) {
          b.hl = { cmp: [b.ptrs.cur] }; b.snap('check', `${b.val(b.ptrs.cur)} is not ${value}: move on.`);
          b.hl = {}; b.ptrs.prev = b.ptrs.cur; b.ptrs.cur = b.next(b.ptrs.cur); b.snap('walk', 'Advance prev and cur.');
        }
        if (b.ptrs.cur === null) { b.snap('notfound', `${value} is not in the list: nothing was deleted.`, { error: true }); return; }
        b.hl = { found: [b.ptrs.cur] }; b.snap('check', `Found ${value}.`);
        if (b.ptrs.prev === undefined) { b.head = b.next(b.ptrs.cur); b.fade.add(b.ptrs.cur); b.snap('unlinkhead', 'It is the head: move head to the next node.'); }
        else { b.setNext(b.ptrs.prev, b.next(b.ptrs.cur)); b.fade.add(b.ptrs.cur); b.snap('unlink', 'Make prev skip over the node.'); }
        b.remove(b.ptrs.cur); b.done('Free the node.');
      },
    },
    search: {
      name: 'Search', args: ['value'], cost: 'O(n)', readonly: true,
      run(b, { value }) {
        b.ptrs.cur = b.head; b.snap('start', `Look for ${value}, starting at the head.`);
        while (b.ptrs.cur !== null) {
          const v = b.val(b.ptrs.cur);
          if (v === value) { b.hl = { found: [b.ptrs.cur] }; b.snap('found', `Found ${value}!`); return; }
          b.hl = { cmp: [b.ptrs.cur] }; b.snap('check', `${v} is not ${value}.`); b.hl = {};
          b.ptrs.cur = b.next(b.ptrs.cur); b.snap('walk', 'Move to the next node.');
        }
        b.snap('notfound', `Reached NULL: ${value} is not in the list.`, { error: true });
      },
    },
    reverse: {
      name: 'Reverse', args: [], cost: 'O(n)',
      run(b) {
        b.ptrs.cur = b.head; b.snap('start', 'prev starts as NULL and cur at the head. Each step turns one arrow around.');
        while (b.ptrs.cur !== null) {
          b.ptrs.nxt = b.next(b.ptrs.cur); b.snap('save', 'Save cur.next in nxt so we do not lose the rest of the list.');
          b.setNext(b.ptrs.cur, b.ptrs.prev === undefined ? null : b.ptrs.prev); b.snap('flip', 'Turn the arrow around: cur now points back at prev.');
          b.ptrs.prev = b.ptrs.cur; b.snap('advprev', 'Move prev to cur.');
          b.ptrs.cur = b.ptrs.nxt; delete b.ptrs.nxt; b.snap('advcur', 'Move cur to nxt.');
        }
        b.head = b.ptrs.prev === undefined ? null : b.ptrs.prev; b.snap('head', 'cur is NULL: prev is the new head.');
        b.done('Reversed!');
      },
    },
  };

  const QUEUE_OPS = {
    enqueue: {
      name: 'Enqueue (add at rear)', args: ['value'], cost: 'O(1)',
      run(b, { value }) {
        const n = b.create(value, b.len());
        b.snap('new', `Create a new node holding ${value}.`);
        if (b.head === null) { b.head = n; b.tail = n; b.float.delete(n); b.renumber(); b.snap('empty', 'The queue was empty: front and rear both become the new node.'); return; }
        b.setNext(b.tail, n); b.float.delete(n); b.renumber(); b.snap('link', 'Point the current rear at the new node.');
        b.tail = n; b.snap('rear', 'Move rear to the new node.');
      },
    },
    dequeue: {
      name: 'Dequeue (remove from front)', args: [], cost: 'O(1)',
      run(b) {
        if (b.head === null) { b.snap('empty', 'The queue is empty: nothing to remove (underflow).', { error: true }); return; }
        b.ptrs.tmp = b.head; b.snap('tmp', `Remember the front node (${b.val(b.head)}) in tmp.`);
        b.head = b.next(b.head); b.fade.add(b.ptrs.tmp); if (b.head === null) b.tail = null;
        b.snap('front', 'Move front to the next node.');
        b.remove(b.ptrs.tmp); delete b.ptrs.tmp; b.renumber(); b.snap('delete', 'Free the old front node.');
      },
    },
    peek: {
      name: 'Peek (look at front)', args: [], cost: 'O(1)', readonly: true,
      run(b) {
        if (b.head === null) { b.snap('empty', 'The queue is empty: there is no front value.', { error: true }); return; }
        b.hl = { found: [b.head] }; b.snap('peek', `The front value is ${b.val(b.head)}. Nothing is removed.`);
      },
    },
  };

  // =============================================================== stack (array)
  const STACK_CAP = 8;
  const stackFrame = (items, label, msg, hl, error) => ({ kind: 'stack', items: items.slice(), cap: STACK_CAP, label, msg, hl: hl || {}, error: !!error });
  const STACK_OPS = {
    push: {
      name: 'Push', args: ['value'], cost: 'O(1)',
      run(st, { value }, F) {
        if (st.items.length >= STACK_CAP) { F.push(stackFrame(st.items, 'full', `Stack overflow: the stack is full (capacity ${STACK_CAP}), so ${value} cannot be pushed.`, {}, true)); return; }
        F.push(stackFrame(st.items, 'check', `There is room (${st.items.length} of ${STACK_CAP} used).`));
        st.items.push(value);
        F.push(stackFrame(st.items, 'push', `top moves up and ${value} is stored there.`, { top: st.items.length - 1 }));
      },
    },
    pop: {
      name: 'Pop', args: [], cost: 'O(1)',
      run(st, a, F) {
        if (!st.items.length) { F.push(stackFrame(st.items, 'empty', 'Stack underflow: the stack is empty, so there is nothing to pop.', {}, true)); return; }
        F.push(stackFrame(st.items, 'check', 'The stack is not empty.'));
        const v = st.items[st.items.length - 1];
        F.push(stackFrame(st.items, 'pop', `Read the top value (${v}).`, { pop: st.items.length - 1 }));
        st.items.pop();
        F.push(stackFrame(st.items, 'dec', `top moves down. ${v} is returned.`));
      },
    },
    peek: {
      name: 'Peek (look at top)', args: [], cost: 'O(1)',
      run(st, a, F) {
        if (!st.items.length) { F.push(stackFrame(st.items, 'empty', 'The stack is empty: there is no top value.', {}, true)); return; }
        F.push(stackFrame(st.items, 'peek', `The top value is ${st.items[st.items.length - 1]}. Nothing is removed.`, { top: st.items.length - 1 }));
      },
    },
  };

  // =============================================================== circular queue (array)
  const CQ_CAP = 6;
  const cqFrame = (st, label, msg, hl, error) => ({ kind: 'slots', cells: st.cells.slice(), front: st.front, rear: st.rear, size: st.size, cap: CQ_CAP, label, msg, hl: hl || {}, error: !!error });
  const CQ_OPS = {
    enqueue: {
      name: 'Enqueue', args: ['value'], cost: 'O(1)',
      run(st, { value }, F) {
        if (st.size === CQ_CAP) { F.push(cqFrame(st, 'full', `The queue is full (${CQ_CAP} of ${CQ_CAP} cells used), so ${value} cannot be added.`, {}, true)); return; }
        F.push(cqFrame(st, 'check', `There is room: size ${st.size} < capacity ${CQ_CAP}.`));
        const old = st.rear; st.rear = (st.rear + 1) % CQ_CAP;
        F.push(cqFrame(st, 'advance', st.rear === 0 && old === CQ_CAP - 1 ? `rear wraps around from ${old} back to 0.` : `rear moves to ${st.rear}.`, { idx: st.rear }));
        st.cells[st.rear] = value; st.size++;
        F.push(cqFrame(st, 'store', `Store ${value} in cell ${st.rear}.`, { idx: st.rear }));
      },
    },
    dequeue: {
      name: 'Dequeue', args: [], cost: 'O(1)',
      run(st, a, F) {
        if (st.size === 0) { F.push(cqFrame(st, 'empty', 'The queue is empty: nothing to remove (underflow).', {}, true)); return; }
        F.push(cqFrame(st, 'check', 'The queue is not empty.'));
        const v = st.cells[st.front];
        F.push(cqFrame(st, 'read', `Read the front value (${v}) from cell ${st.front}.`, { idx: st.front }));
        const f = st.front; st.cells[f] = null; st.size--;
        F.push(cqFrame(st, 'clear', `Cell ${f} is now free.`, { idx: f }));
        st.front = (st.front + 1) % CQ_CAP;
        F.push(cqFrame(st, 'advance', st.front === 0 && f === CQ_CAP - 1 ? 'front wraps around to 0.' : `front moves to ${st.front}.`, { idx: st.front }));
      },
    },
    peek: {
      name: 'Peek', args: [], cost: 'O(1)',
      run(st, a, F) {
        if (st.size === 0) { F.push(cqFrame(st, 'empty', 'The queue is empty: there is no front value.', {}, true)); return; }
        F.push(cqFrame(st, 'peek', `The front value is ${st.cells[st.front]}.`, { idx: st.front }));
      },
    },
  };

  // =============================================================== code listings (C++ / Python)
  const NODE = {
    cpp: [L('struct Node {'), L('  int data;'), L('  Node* next;'), L('};'), L('')],
    py: [L('class Node:'), L('    def __init__(self, data):'), L('        self.data = data'), L('        self.next = None'), L('')],
  };
  const CODE = {
    list: {
      prelude: NODE,
      insertHead: {
        cpp: [L('void insertHead(Node*& head, int v) {'), L('  Node* n = new Node{v, nullptr};', 'new'), L('  n->next = head;', 'link'), L('  head = n;', 'head'), L('}')],
        py: [L('def insert_head(head, v):'), L('    n = Node(v)', 'new'), L('    n.next = head', 'link'), L('    return n   # the new head', 'head')],
      },
      insertTail: {
        cpp: [L('void insertTail(Node*& head, int v) {'), L('  Node* n = new Node{v, nullptr};', 'new'), L('  if (head == nullptr) { head = n; return; }', 'empty'),
          L('  Node* cur = head;', 'start'), L('  while (cur->next != nullptr)', 'check'), L('    cur = cur->next;', 'walk'), L('  cur->next = n;', 'link'), L('}')],
        py: [L('def insert_tail(head, v):'), L('    n = Node(v)', 'new'), L('    if head is None:', 'empty'), L('        return n', 'empty'), L('    cur = head', 'start'),
          L('    while cur.next is not None:', 'check'), L('        cur = cur.next', 'walk'), L('    cur.next = n', 'link'), L('    return head')],
      },
      insertAt: {
        cpp: [L('void insertAt(Node*& head, int i, int v) {'), L('  Node* n = new Node{v, nullptr};', 'new'), L('  if (i == 0) { n->next = head; head = n; return; }', 'headcase'),
          L('  Node* cur = head;', 'start'), L('  for (int k = 0; k < i - 1; k++)'), L('    cur = cur->next;', 'walk'), L('  n->next = cur->next;', 'link1'), L('  cur->next = n;', 'link2'), L('}')],
        py: [L('def insert_at(head, i, v):'), L('    n = Node(v)', 'new'), L('    if i == 0:', 'headcase'), L('        n.next = head', 'headcase'), L('        return n', 'headcase'), L('    cur = head', 'start'),
          L('    for _ in range(i - 1):'), L('        cur = cur.next', 'walk'), L('    n.next = cur.next', 'link1'), L('    cur.next = n', 'link2'), L('    return head')],
      },
      deleteHead: {
        cpp: [L('void deleteHead(Node*& head) {'), L('  if (head == nullptr) return;', 'empty'), L('  Node* tmp = head;', 'tmp'), L('  head = head->next;', 'head'), L('  delete tmp;', 'delete'), L('}')],
        py: [L('def delete_head(head):'), L('    if head is None:', 'empty'), L('        return None', 'empty'), L('    tmp = head', 'tmp'), L('    head = head.next', 'head'), L('    return head   # tmp is garbage collected', 'delete')],
      },
      deleteTail: {
        cpp: [L('void deleteTail(Node*& head) {'), L('  if (head == nullptr) return;', 'empty'), L('  if (head->next == nullptr) { delete head; head = nullptr; return; }', 'single'),
          L('  Node* prev = nullptr; Node* cur = head;', 'start'), L('  while (cur->next != nullptr) {', 'check'), L('    prev = cur; cur = cur->next;', 'walk'), L('  }'),
          L('  prev->next = nullptr;', 'unlink'), L('  delete cur;', 'done'), L('}')],
        py: [L('def delete_tail(head):'), L('    if head is None:', 'empty'), L('        return None', 'empty'), L('    if head.next is None:', 'single'), L('        return None', 'single'),
          L('    prev, cur = None, head', 'start'), L('    while cur.next is not None:', 'check'), L('        prev, cur = cur, cur.next', 'walk'), L('    prev.next = None', 'unlink'), L('    return head', 'done')],
      },
      deleteValue: {
        cpp: [L('void deleteValue(Node*& head, int v) {'), L('  Node* prev = nullptr; Node* cur = head;', 'start'), L('  while (cur != nullptr && cur->data != v) {', 'check'),
          L('    prev = cur; cur = cur->next;', 'walk'), L('  }'), L('  if (cur == nullptr) return;', 'notfound'), L('  if (prev == nullptr) head = cur->next;', 'unlinkhead'),
          L('  else prev->next = cur->next;', 'unlink'), L('  delete cur;', 'done'), L('}')],
        py: [L('def delete_value(head, v):'), L('    prev, cur = None, head', 'start'), L('    while cur is not None and cur.data != v:', 'check'), L('        prev, cur = cur, cur.next', 'walk'),
          L('    if cur is None:', 'notfound'), L('        return head', 'notfound'), L('    if prev is None:', 'unlinkhead'), L('        return cur.next', 'unlinkhead'), L('    prev.next = cur.next', 'unlink'), L('    return head', 'done')],
      },
      search: {
        cpp: [L('Node* search(Node* head, int v) {'), L('  Node* cur = head;', 'start'), L('  while (cur != nullptr) {', 'check'), L('    if (cur->data == v) return cur;', 'found'),
          L('    cur = cur->next;', 'walk'), L('  }'), L('  return nullptr;', 'notfound'), L('}')],
        py: [L('def search(head, v):'), L('    cur = head', 'start'), L('    while cur is not None:', 'check'), L('        if cur.data == v:', 'found'), L('            return cur', 'found'),
          L('        cur = cur.next', 'walk'), L('    return None', 'notfound')],
      },
      reverse: {
        cpp: [L('void reverse(Node*& head) {'), L('  Node* prev = nullptr; Node* cur = head;', 'start'), L('  while (cur != nullptr) {'), L('    Node* nxt = cur->next;', 'save'), L('    cur->next = prev;', 'flip'),
          L('    prev = cur;', 'advprev'), L('    cur = nxt;', 'advcur'), L('  }'), L('  head = prev;', 'head'), L('}', 'done')],
        py: [L('def reverse(head):'), L('    prev, cur = None, head', 'start'), L('    while cur is not None:'), L('        nxt = cur.next', 'save'), L('        cur.next = prev', 'flip'),
          L('        prev = cur', 'advprev'), L('        cur = nxt', 'advcur'), L('    return prev   # the new head', 'head')],
      },
    },
    queue: {
      prelude: {
        cpp: [...NODE.cpp, L('Node* front = nullptr;'), L('Node* rear = nullptr;'), L('')],
        py: [...NODE.py, L('front = None'), L('rear = None'), L('')],
      },
      enqueue: {
        cpp: [L('void enqueue(int v) {'), L('  Node* n = new Node{v, nullptr};', 'new'), L('  if (front == nullptr) { front = rear = n; return; }', 'empty'), L('  rear->next = n;', 'link'), L('  rear = n;', 'rear'), L('}')],
        py: [L('def enqueue(v):'), L('    global front, rear'), L('    n = Node(v)', 'new'), L('    if front is None:', 'empty'), L('        front = rear = n', 'empty'), L('        return'), L('    rear.next = n', 'link'), L('    rear = n', 'rear')],
      },
      dequeue: {
        cpp: [L('int dequeue() {'), L('  if (front == nullptr) return -1;   // underflow', 'empty'), L('  Node* tmp = front;', 'tmp'), L('  int v = tmp->data;'), L('  front = front->next;', 'front'),
          L('  if (front == nullptr) rear = nullptr;'), L('  delete tmp;', 'delete'), L('  return v;'), L('}')],
        py: [L('def dequeue():'), L('    global front, rear'), L('    if front is None:', 'empty'), L('        return None   # underflow', 'empty'), L('    tmp = front', 'tmp'), L('    front = front.next', 'front'),
          L('    if front is None:'), L('        rear = None'), L('    return tmp.data', 'delete')],
      },
      peek: {
        cpp: [L('int peek() {'), L('  if (front == nullptr) return -1;', 'empty'), L('  return front->data;', 'peek'), L('}')],
        py: [L('def peek():'), L('    if front is None:', 'empty'), L('        return None', 'empty'), L('    return front.data', 'peek')],
      },
    },
    stack: {
      prelude: { cpp: [L('const int CAP = 8;'), L('int items[CAP];'), L('int top = -1;'), L('')], py: [L('CAP = 8'), L('items = []   # top is the last element'), L('')] },
      push: {
        cpp: [L('void push(int v) {'), L('  if (top == CAP - 1) return;   // overflow', 'full'), L('  top++;', 'check'), L('  items[top] = v;', 'push'), L('}')],
        py: [L('def push(v):'), L('    if len(items) == CAP:', 'full'), L('        return   # overflow', 'full'), L('    items.append(v)', 'push')],
      },
      pop: {
        cpp: [L('int pop() {'), L('  if (top == -1) return -1;   // underflow', 'empty'), L('  int v = items[top];', 'pop'), L('  top--;', 'dec'), L('  return v;'), L('}')],
        py: [L('def pop():'), L('    if not items:', 'empty'), L('        return None   # underflow', 'empty'), L('    v = items[-1]', 'pop'), L('    items.pop()', 'dec'), L('    return v')],
      },
      peek: {
        cpp: [L('int peek() {'), L('  if (top == -1) return -1;', 'empty'), L('  return items[top];', 'peek'), L('}')],
        py: [L('def peek():'), L('    if not items:', 'empty'), L('        return None', 'empty'), L('    return items[-1]', 'peek')],
      },
    },
    cqueue: {
      prelude: {
        cpp: [L('const int CAP = 6;'), L('int cells[CAP];'), L('int front = 0, rear = -1, size = 0;'), L('')],
        py: [L('CAP = 6'), L('cells = [None] * CAP'), L('front, rear, size = 0, -1, 0'), L('')],
      },
      enqueue: {
        cpp: [L('void enqueue(int v) {'), L('  if (size == CAP) return;   // full', 'full'), L('  // there is room', 'check'), L('  rear = (rear + 1) % CAP;', 'advance'), L('  cells[rear] = v;', 'store'), L('  size++;'), L('}')],
        py: [L('def enqueue(v):'), L('    global rear, size'), L('    if size == CAP:', 'full'), L('        return   # full', 'full'), L('    rear = (rear + 1) % CAP', 'advance'), L('    cells[rear] = v', 'store'), L('    size += 1')],
      },
      dequeue: {
        cpp: [L('int dequeue() {'), L('  if (size == 0) return -1;   // empty', 'empty'), L('  int v = cells[front];', 'read'), L('  cells[front] = 0;', 'clear'), L('  front = (front + 1) % CAP;', 'advance'), L('  size--;'), L('  return v;'), L('}')],
        py: [L('def dequeue():'), L('    global front, size'), L('    if size == 0:', 'empty'), L('        return None   # empty', 'empty'), L('    v = cells[front]', 'read'), L('    cells[front] = None', 'clear'), L('    front = (front + 1) % CAP', 'advance'), L('    size -= 1'), L('    return v')],
      },
      peek: {
        cpp: [L('int peek() {'), L('  if (size == 0) return -1;', 'empty'), L('  return cells[front];', 'peek'), L('}')],
        py: [L('def peek():'), L('    if size == 0:', 'empty'), L('        return None', 'empty'), L('    return cells[front]', 'peek')],
      },
    },
  };

  const STRUCTS = {
    list: { name: 'Singly linked list', ops: LIST_OPS, opOrder: Object.keys(LIST_OPS), names: { head: 'head' }, useTail: false },
    stack: { name: 'Stack (array)', ops: STACK_OPS, opOrder: ['push', 'pop', 'peek'] },
    queue: { name: 'Queue (linked list)', ops: QUEUE_OPS, opOrder: ['enqueue', 'dequeue', 'peek'], names: { head: 'front', tail: 'rear' }, useTail: true },
    cqueue: { name: 'Circular queue (array)', ops: CQ_OPS, opOrder: ['enqueue', 'dequeue', 'peek'] },
  };

  // =============================================================== state + running an operation
  function emptyState(kind) {
    if (kind === 'stack') return { items: [] };
    if (kind === 'cqueue') return { cells: new Array(CQ_CAP).fill(null), front: 0, rear: -1, size: 0 };
    return { items: [], nextId: 1 };
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /** The static frame that shows a state with no operation running. */
  function stateFrame(kind, st) {
    if (kind === 'stack') return stackFrame(st.items, 'idle', 'The stack is empty. Pick an operation and press Run.', {});
    if (kind === 'cqueue') return cqFrame(st, 'idle', 'The queue is empty. Pick an operation and press Run.');
    const S = STRUCTS[kind];
    const b = new ListB(st, S.names, S.useTail);
    b.snap('idle', st.items.length ? 'Pick an operation and press Run.' : 'The list is empty (head is NULL). Pick an operation and press Run.');
    return b.frames[0];
  }

  /** Returns { frames, state } or { error }. args: { value?, index? } */
  function runOp(kind, opId, state, args) {
    const S = STRUCTS[kind], op = S && S.ops[opId];
    if (!op) return { error: 'Unknown operation.' };
    for (const a of op.args) {
      if (args[a] === undefined || args[a] === null || !Number.isInteger(args[a])) return { error: a === 'value' ? 'The value must be a whole number.' : 'The index must be a whole number.' };
      if (Math.abs(args[a]) > 99999) return { error: 'Keep numbers between -99999 and 99999.' };
    }
    if (op.validate) { const e = op.validate(args, state.items ? state.items.length : 0); if (e) return { error: e }; }
    if (kind === 'stack') {
      const st = clone(state), items = st.items.slice(), F = [];
      F.push(stackFrame(items, 'idle', `Running ${op.name}…`));
      const w = { items }; op.run(w, args, F);
      return { frames: F, state: { items: w.items } };
    }
    if (kind === 'cqueue') {
      const st = clone(state), F = [];
      F.push(cqFrame(st, 'idle', `Running ${op.name}…`));
      op.run(st, args, F);
      return { frames: F, state: st };
    }
    const b = new ListB(clone(state), S.names, S.useTail);
    b.snap('idle', `Running ${op.name}…`);
    op.run(b, args);
    const last = b.frames[b.frames.length - 1];
    if (!op.readonly && last.label !== 'done' && !last.error) b.done('Done.');
    return { frames: b.frames, state: b.state() };
  }

  /** Items of a state, as plain values (for tests and the "contents" line). */
  function contents(kind, st) {
    if (kind === 'cqueue') { const out = []; for (let i = 0; i < st.size; i++) out.push(st.cells[(st.front + i) % CQ_CAP]); return out; }
    return st.items.map((x) => (typeof x === 'object' ? x.v : x));
  }

  // =============================================================== graph layout (user traces)
  /** nodes:[{id,v,next,prev}] -> same nodes with row/col; chains become rows. */
  function layoutChains(nodes, maxRows) {
    const byId = new Map(nodes.map((n) => [n.id, Object.assign({}, n)]));
    const indeg = new Map(nodes.map((n) => [n.id, 0]));
    nodes.forEach((n) => { if (n.next != null && indeg.has(n.next)) indeg.set(n.next, indeg.get(n.next) + 1); });
    const order = nodes.map((n) => n.id);
    const heads = order.filter((id) => indeg.get(id) === 0);
    const seen = new Set(); let row = 0; const out = [];
    const walk = (start) => {
      let col = 0, id = start;
      while (id != null && byId.has(id) && !seen.has(id)) { seen.add(id); const n = byId.get(id); n.row = row; n.col = col++; out.push(n); id = n.next; }
      if (id != null && byId.has(id) && seen.has(id)) { const t = byId.get(id); const last = out[out.length - 1]; if (last) last.loopTo = { row: t.row, col: t.col }; }
      row++;
    };
    heads.forEach(walk);
    order.forEach((id) => { if (!seen.has(id)) walk(id); });
    const rows = row;
    return { nodes: out.filter((n) => n.row < (maxRows || 8)), rows, hidden: out.filter((n) => n.row >= (maxRows || 8)).length };
  }

  const api = { STRUCTS, CODE, runOp, stateFrame, emptyState, contents, layoutChains, CQ_CAP, STACK_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Structs = api;
})(typeof window !== 'undefined' ? window : globalThis);
