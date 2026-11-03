/*
 * Step recorder + built-in algorithms. Works in the webview (window.Algos) and in Node (module.exports).
 * Every algorithm runs against a Rec, which records one "frame" per interesting step:
 *   { a, kind, label, msg, hi:{cmp,swap,set,mid,found}, done, range, pivot, hold, c:{cmp,swap,set}, ln }
 */
(function (root) {
  'use strict';

  class Rec {
    constructor(arr, target) {
      this.a = arr.slice(); this.n = arr.length; this.target = target;
      this.frames = []; this.c = { cmp: 0, swap: 0, set: 0 };
      this.doneSet = new Set(); this.range = null; this.pivot = null; this.hold = null; this.ln = null;
    }
    push(kind, label, msg, hi) {
      this.frames.push({
        a: this.a.slice(), kind, label: label || '', msg, hi: hi || {}, done: [...this.doneSet],
        range: this.range ? this.range.slice() : null, pivot: this.pivot, hold: this.hold,
        c: Object.assign({}, this.c), ln: this.ln,
      });
    }
    note(label, msg, hi) { this.push('note', label, msg, hi); }
    compare(x, y, op, idx, label, yName) {
      this.c.cmp++;
      const r = op === '>' ? x > y : op === '<' ? x < y : op === '<=' ? x <= y : op === '>=' ? x >= y : x === y;
      this.push('cmp', label, `Is ${x} ${op} ${yName !== undefined ? yName : y}? ${r ? 'Yes' : 'No'}.`, { cmp: idx });
      return r;
    }
    gt(i, j, label) { return this.compare(this.a[i], this.a[j], '>', [i, j], label); }
    lt(i, j, label) { return this.compare(this.a[i], this.a[j], '<', [i, j], label); }
    swap(i, j, label) {
      if (i === j) return;
      const x = this.a[i], y = this.a[j];
      this.a[i] = y; this.a[j] = x; this.c.swap++;
      this.push('swap', label, `Swap ${x} and ${y}.`, { swap: [i, j] });
    }
    set(i, v, label, msg) {
      this.a[i] = v; this.c.set++;
      this.push('set', label, msg || `Write ${v} into position ${i}.`, { set: [i] });
    }
    mark(...idx) { idx.forEach((i) => this.doneSet.add(i)); }
    markAll() { for (let i = 0; i < this.n; i++) this.doneSet.add(i); }
  }

  const L = (text, label) => [text, label || ''];

  const ALGOS = {
    bubble: {
      id: 'bubble', name: 'Bubble sort', group: 'sort',
      info: { best: 'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: 'Yes' },
      desc: 'Compare neighbours and swap them if they are out of order. After each pass the largest remaining value has "bubbled" to the end. Stops early if a pass makes no swaps.',
      run(T) {
        const n = T.n;
        for (let i = 0; i < n - 1; i++) {
          let swapped = false;
          for (let j = 0; j < n - 1 - i; j++) {
            if (T.gt(j, j + 1, 'cmp')) { T.swap(j, j + 1, 'swap'); swapped = true; }
          }
          T.mark(n - 1 - i);
          if (!swapped) { T.markAll(); T.note('early', 'No swaps in this pass, so the array is already sorted.'); break; }
        }
        T.markAll(); T.note('done', 'Sorted!');
      },
      code: {
        cpp: [L('void bubbleSort(int a[], int n) {'), L('  for (int i = 0; i < n - 1; i++) {'), L('    bool swapped = false;'),
          L('    for (int j = 0; j < n - 1 - i; j++) {'), L('      if (a[j] > a[j + 1]) {', 'cmp'), L('        swap(a[j], a[j + 1]);', 'swap'),
          L('        swapped = true;'), L('      }'), L('    }'), L('    if (!swapped) break;', 'early'), L('  }'), L('}', 'done')],
        py: [L('def bubble_sort(a):'), L('    n = len(a)'), L('    for i in range(n - 1):'), L('        swapped = False'),
          L('        for j in range(n - 1 - i):'), L('            if a[j] > a[j + 1]:', 'cmp'), L('                a[j], a[j + 1] = a[j + 1], a[j]', 'swap'),
          L('                swapped = True'), L('        if not swapped:', 'early'), L('            break', 'early')],
      },
    },

    selection: {
      id: 'selection', name: 'Selection sort', group: 'sort',
      info: { best: 'O(n²)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: 'No' },
      desc: 'Find the smallest value in the unsorted part (shown in blue) and swap it into the next sorted position. Always does about n²/2 comparisons, but at most n swaps.',
      run(T) {
        const n = T.n;
        for (let i = 0; i < n - 1; i++) {
          let min = i; T.pivot = min;
          for (let j = i + 1; j < n; j++) {
            if (T.lt(j, min, 'cmp')) { min = j; T.pivot = min; }
          }
          T.swap(i, min, 'swap'); T.pivot = null; T.mark(i);
        }
        T.mark(n - 1); T.pivot = null; T.note('done', 'Sorted!');
      },
      code: {
        cpp: [L('void selectionSort(int a[], int n) {'), L('  for (int i = 0; i < n - 1; i++) {'), L('    int min = i;'),
          L('    for (int j = i + 1; j < n; j++)'), L('      if (a[j] < a[min]) min = j;', 'cmp'), L('    swap(a[i], a[min]);', 'swap'), L('  }'), L('}', 'done')],
        py: [L('def selection_sort(a):'), L('    n = len(a)'), L('    for i in range(n - 1):'), L('        m = i'),
          L('        for j in range(i + 1, n):'), L('            if a[j] < a[m]:', 'cmp'), L('                m = j'), L('        a[i], a[m] = a[m], a[i]', 'swap')],
      },
    },

    insertion: {
      id: 'insertion', name: 'Insertion sort', group: 'sort',
      info: { best: 'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: 'Yes' },
      desc: 'Take the next value (the key), slide larger values on its left one step right, and drop the key into the gap. Like sorting a hand of cards. Very fast on nearly-sorted data.',
      run(T) {
        const n = T.n; T.mark(0);
        for (let i = 1; i < n; i++) {
          const key = T.a[i]; T.hold = key;
          T.note('key', `Pick up ${key} as the key.`, { cmp: [i] });
          let j = i - 1;
          while (j >= 0 && T.compare(T.a[j], key, '>', [j], 'cmp', `key (${key})`)) { T.set(j + 1, T.a[j], 'shift', `Shift ${T.a[j]} one step right.`); j--; }
          T.set(j + 1, key, 'place', `Drop the key ${key} into position ${j + 1}.`); T.hold = null;
          for (let k = 0; k <= i; k++) T.mark(k);
        }
        T.markAll(); T.note('done', 'Sorted!');
      },
      code: {
        cpp: [L('void insertionSort(int a[], int n) {'), L('  for (int i = 1; i < n; i++) {'), L('    int key = a[i];', 'key'), L('    int j = i - 1;'),
          L('    while (j >= 0 && a[j] > key) {', 'cmp'), L('      a[j + 1] = a[j];', 'shift'), L('      j--;'), L('    }'),
          L('    a[j + 1] = key;', 'place'), L('  }'), L('}', 'done')],
        py: [L('def insertion_sort(a):'), L('    for i in range(1, len(a)):'), L('        key = a[i]', 'key'), L('        j = i - 1'),
          L('        while j >= 0 and a[j] > key:', 'cmp'), L('            a[j + 1] = a[j]', 'shift'), L('            j -= 1'), L('        a[j + 1] = key', 'place')],
      },
    },

    merge: {
      id: 'merge', name: 'Merge sort', group: 'sort',
      info: { best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: 'Yes' },
      desc: 'Split the array in half, sort each half recursively, then merge the two sorted halves by repeatedly taking the smaller front value. The highlighted range is the part being merged.',
      run(T) {
        const merge = (lo, mid, hi) => {
          const t = T.a.slice(lo, hi + 1);
          let i = 0, j = mid - lo + 1, k = lo;
          const lenL = mid - lo + 1;
          T.range = [lo, hi];
          while (i < lenL && j < t.length) {
            if (T.compare(t[i], t[j], '<=', [lo + i, lo + j], 'cmp')) T.set(k++, t[i++], 'setL', `Take ${t[i - 1]} from the left half.`);
            else T.set(k++, t[j++], 'setR', `Take ${t[j - 1]} from the right half.`);
          }
          while (i < lenL) T.set(k++, t[i++], 'rest', `Copy the leftover ${t[i - 1]} from the left half.`);
          while (j < t.length) T.set(k++, t[j++], 'rest', `Copy the leftover ${t[j - 1]} from the right half.`);
        };
        const sort = (lo, hi) => {
          if (lo >= hi) return;
          const mid = (lo + hi) >> 1;
          sort(lo, mid); sort(mid + 1, hi); merge(lo, mid, hi);
        };
        sort(0, T.n - 1);
        T.range = null; T.markAll(); T.note('done', 'Sorted!');
      },
      code: {
        cpp: [L('void mergeSort(int a[], int lo, int hi) {'), L('  if (lo >= hi) return;'), L('  int mid = (lo + hi) / 2;'), L('  mergeSort(a, lo, mid);'),
          L('  mergeSort(a, mid + 1, hi);'), L('  merge(a, lo, mid, hi);'), L('}'), L('void merge(int a[], int lo, int mid, int hi) {'),
          L('  vector<int> t(a + lo, a + hi + 1);'), L('  int i = 0, j = mid - lo + 1, k = lo;'), L('  while (i <= mid - lo && j < t.size()) {'),
          L('    if (t[i] <= t[j])', 'cmp'), L('      a[k++] = t[i++];', 'setL'), L('    else'), L('      a[k++] = t[j++];', 'setR'), L('  }'),
          L('  while (i <= mid - lo) a[k++] = t[i++];', 'rest'), L('  while (j < (int)t.size()) a[k++] = t[j++];', 'rest'), L('}', 'done')],
        py: [L('def merge_sort(a, lo, hi):'), L('    if lo >= hi:'), L('        return'), L('    mid = (lo + hi) // 2'), L('    merge_sort(a, lo, mid)'),
          L('    merge_sort(a, mid + 1, hi)'), L('    merge(a, lo, mid, hi)'), L(''), L('def merge(a, lo, mid, hi):'), L('    t = a[lo:hi + 1]'),
          L('    i, j, k = 0, mid - lo + 1, lo'), L('    while i <= mid - lo and j < len(t):'), L('        if t[i] <= t[j]:', 'cmp'), L('            a[k] = t[i]; i += 1', 'setL'),
          L('        else:'), L('            a[k] = t[j]; j += 1', 'setR'), L('        k += 1'), L('    while i <= mid - lo:', 'rest'), L('        a[k] = t[i]; i += 1; k += 1', 'rest'),
          L('    while j < len(t):', 'rest'), L('        a[k] = t[j]; j += 1; k += 1', 'rest')],
      },
    },

    quick: {
      id: 'quick', name: 'Quick sort', group: 'sort',
      info: { best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)', stable: 'No' },
      desc: 'Pick the last value of the range as the pivot (blue). Move everything smaller than the pivot to its left, then put the pivot in its final place and sort each side the same way.',
      run(T) {
        const partition = (lo, hi) => {
          T.range = [lo, hi]; T.pivot = hi;
          T.note('pivot', `Partition positions ${lo}–${hi} around the pivot ${T.a[hi]}.`);
          let i = lo - 1;
          for (let j = lo; j < hi; j++) {
            if (T.compare(T.a[j], T.a[hi], '<', [j], 'cmp', `pivot (${T.a[hi]})`)) { i++; T.swap(i, j, 'swap'); }
          }
          T.swap(i + 1, hi, 'place'); T.pivot = null; T.mark(i + 1);
          return i + 1;
        };
        const sort = (lo, hi) => {
          if (lo > hi) return;
          if (lo === hi) { T.mark(lo); return; }
          const p = partition(lo, hi);
          sort(lo, p - 1); sort(p + 1, hi);
        };
        sort(0, T.n - 1);
        T.range = null; T.markAll(); T.note('done', 'Sorted!');
      },
      code: {
        cpp: [L('int partition(int a[], int lo, int hi) {'), L('  int pivot = a[hi];', 'pivot'), L('  int i = lo - 1;'), L('  for (int j = lo; j < hi; j++) {'),
          L('    if (a[j] < pivot) {', 'cmp'), L('      i++;'), L('      swap(a[i], a[j]);', 'swap'), L('    }'), L('  }'),
          L('  swap(a[i + 1], a[hi]);', 'place'), L('  return i + 1;'), L('}'), L('void quickSort(int a[], int lo, int hi) {'),
          L('  if (lo >= hi) return;'), L('  int p = partition(a, lo, hi);'), L('  quickSort(a, lo, p - 1);'), L('  quickSort(a, p + 1, hi);'), L('}', 'done')],
        py: [L('def partition(a, lo, hi):'), L('    pivot = a[hi]', 'pivot'), L('    i = lo - 1'), L('    for j in range(lo, hi):'), L('        if a[j] < pivot:', 'cmp'),
          L('            i += 1'), L('            a[i], a[j] = a[j], a[i]', 'swap'), L('    a[i + 1], a[hi] = a[hi], a[i + 1]', 'place'), L('    return i + 1'), L(''),
          L('def quick_sort(a, lo, hi):'), L('    if lo < hi:'), L('        p = partition(a, lo, hi)'), L('        quick_sort(a, lo, p - 1)'), L('        quick_sort(a, p + 1, hi)')],
      },
    },

    heap: {
      id: 'heap', name: 'Heap sort', group: 'sort',
      info: { best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)', stable: 'No' },
      desc: 'First rearrange the array into a max-heap (every parent ≥ its children, where the children of i are 2i+1 and 2i+2). Then repeatedly swap the biggest value (position 0) to the end and repair the heap.',
      run(T) {
        const sift = (i, n) => {
          for (;;) {
            const l = 2 * i + 1, r = l + 1; let big = i;
            if (l < n && T.gt(l, big, 'cmp')) big = l;
            if (r < n && T.gt(r, big, 'cmp')) big = r;
            if (big === i) return;
            T.swap(i, big, 'swap'); i = big;
          }
        };
        T.note('build', 'Phase 1: build a max-heap.');
        for (let i = (T.n >> 1) - 1; i >= 0; i--) sift(i, T.n);
        T.note('build', 'The array is now a max-heap. Phase 2: move the biggest value to the end, again and again.');
        for (let end = T.n - 1; end > 0; end--) { T.swap(0, end, 'extract'); T.mark(end); sift(0, end); }
        T.markAll(); T.note('done', 'Sorted!');
      },
      code: {
        cpp: [L('void siftDown(int a[], int i, int n) {'), L('  while (true) {'), L('    int l = 2 * i + 1, r = l + 1, big = i;'),
          L('    if (l < n && a[l] > a[big]) big = l;', 'cmp'), L('    if (r < n && a[r] > a[big]) big = r;', 'cmp'), L('    if (big == i) return;'),
          L('    swap(a[i], a[big]);', 'swap'), L('    i = big;'), L('  }'), L('}'), L('void heapSort(int a[], int n) {'),
          L('  for (int i = n / 2 - 1; i >= 0; i--)', 'build'), L('    siftDown(a, i, n);'), L('  for (int end = n - 1; end > 0; end--) {'),
          L('    swap(a[0], a[end]);', 'extract'), L('    siftDown(a, 0, end);'), L('  }'), L('}', 'done')],
        py: [L('def sift_down(a, i, n):'), L('    while True:'), L('        l, r, big = 2 * i + 1, 2 * i + 2, i'), L('        if l < n and a[l] > a[big]:', 'cmp'),
          L('            big = l'), L('        if r < n and a[r] > a[big]:', 'cmp'), L('            big = r'), L('        if big == i:'), L('            return'),
          L('        a[i], a[big] = a[big], a[i]', 'swap'), L('        i = big'), L(''), L('def heap_sort(a):'), L('    n = len(a)'),
          L('    for i in range(n // 2 - 1, -1, -1):', 'build'), L('        sift_down(a, i, n)'), L('    for end in range(n - 1, 0, -1):'),
          L('        a[0], a[end] = a[end], a[0]', 'extract'), L('        sift_down(a, 0, end)')],
      },
    },

    linear: {
      id: 'linear', name: 'Linear search', group: 'search',
      info: { best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(1)', stable: '–' },
      desc: 'Look at each value from left to right until the target is found or the array ends. Works on any array, sorted or not.',
      run(T) {
        for (let i = 0; i < T.n; i++) {
          if (T.compare(T.a[i], T.target, '==', [i], 'cmp')) {
            T.push('found', 'cmp', `Found ${T.target} at position ${i}.`, { found: [i] }); return;
          }
        }
        T.push('notfound', 'notfound', `${T.target} is not in the array.`);
      },
      code: {
        cpp: [L('int linearSearch(int a[], int n, int target) {'), L('  for (int i = 0; i < n; i++)'), L('    if (a[i] == target) return i;', 'cmp'), L('  return -1;', 'notfound'), L('}')],
        py: [L('def linear_search(a, target):'), L('    for i in range(len(a)):'), L('        if a[i] == target:', 'cmp'), L('            return i'), L('    return -1', 'notfound')],
      },
    },

    binary: {
      id: 'binary', name: 'Binary search', group: 'search', needsSorted: true,
      info: { best: 'O(1)', avg: 'O(log n)', worst: 'O(log n)', space: 'O(1)', stable: '–' },
      desc: 'Needs a sorted array. Look at the middle value: if it is too small the target must be in the right half, if too big in the left half. Each step throws away half of what is left (the dimmed bars).',
      run(T) {
        let lo = 0, hi = T.n - 1;
        while (lo <= hi) {
          T.range = [lo, hi];
          const mid = (lo + hi) >> 1;
          T.push('mid', 'mid', `Search range ${lo}–${hi}. The middle is position ${mid} (value ${T.a[mid]}).`, { mid: [mid] });
          if (T.compare(T.a[mid], T.target, '==', [mid], 'cmp')) { T.push('found', 'cmp', `Found ${T.target} at position ${mid}.`, { found: [mid] }); return; }
          if (T.a[mid] < T.target) { lo = mid + 1; T.range = [lo, hi]; T.push('note', 'right', `${T.a[mid]} < ${T.target}, so the target can only be to the right.`, { mid: [mid] }); }
          else { hi = mid - 1; T.range = lo <= hi ? [lo, hi] : [0, -1]; T.push('note', 'left', `${T.a[mid]} > ${T.target}, so the target can only be to the left.`, { mid: [mid] }); }
        }
        T.range = [0, -1];
        T.push('notfound', 'notfound', `The range is empty: ${T.target} is not in the array.`);
      },
      code: {
        cpp: [L('int binarySearch(int a[], int n, int target) {'), L('  int lo = 0, hi = n - 1;'), L('  while (lo <= hi) {'), L('    int mid = (lo + hi) / 2;', 'mid'),
          L('    if (a[mid] == target) return mid;', 'cmp'), L('    if (a[mid] < target) lo = mid + 1;', 'right'), L('    else hi = mid - 1;', 'left'), L('  }'),
          L('  return -1;', 'notfound'), L('}')],
        py: [L('def binary_search(a, target):'), L('    lo, hi = 0, len(a) - 1'), L('    while lo <= hi:'), L('        mid = (lo + hi) // 2', 'mid'),
          L('        if a[mid] == target:', 'cmp'), L('            return mid'), L('        if a[mid] < target:', 'right'), L('            lo = mid + 1', 'right'),
          L('        else:', 'left'), L('            hi = mid - 1', 'left'), L('    return -1', 'notfound')],
      },
    },
  };

  const ORDER = ['bubble', 'selection', 'insertion', 'merge', 'quick', 'heap', 'linear', 'binary'];

  const isSorted = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);

  /** Frames for a built-in algorithm. */
  function build(id, arr, target) {
    const algo = ALGOS[id];
    const T = new Rec(arr, target);
    T.push('start', 'start', algo.group === 'search'
      ? `Looking for ${target}. Press play or step forward.` : 'The unsorted array. Press play or step forward.');
    algo.run(T);
    return T.frames;
  }

  /**
   * Frames from events recorded while the user's own function ran.
   * events: {k:'cmp',i,j,op,ln} | {k:'set',i,v,ln};  o: {mode, final, retInt, returned, truncated, maxEvents}
   */
  function fromEvents(initial, events, o) {
    const T = new Rec(initial);
    T.push('start', '', o.mode === 'search' ? 'The array before your function runs.' : 'The array before your function runs.');
    // A side is "on the chart" only if that slot still holds the value that was compared;
    // otherwise it came from a variable (like insertion sort's key) and is shown as a plain value.
    const side = (idx, val) => {
      const onChart = idx !== null && idx !== undefined && idx >= 0 && idx < T.n && (val === undefined || val === null || T.a[idx] === val);
      const v = val !== undefined && val !== null ? val : (onChart ? T.a[idx] : null);
      return { onChart, idx, text: onChart ? `a[${idx}] (${v})` : (v === null ? 'a value' : `${v}`) };
    };
    for (let k = 0; k < events.length; k++) {
      const e = events[k];
      T.ln = e.ln === undefined ? null : e.ln;
      if (e.k === 'cmp') {
        T.c.cmp++;
        const l = side(e.i, e.x), r = side(e.j, e.y);
        const idx = [l, r].filter((s) => s.onChart).map((s) => s.idx);
        T.push('cmp', '', `Compared ${l.text} ${e.op} ${r.text}.`, { cmp: idx });
      } else if (e.k === 'set' && e.i >= 0 && e.i < T.n) {
        const nx = events[k + 1];
        if (nx && nx.k === 'set' && nx.i !== e.i && nx.i >= 0 && nx.i < T.n && T.a[nx.i] === e.v && nx.v === T.a[e.i]) {
          T.swap(e.i, nx.i, ''); k++;
        } else T.set(e.i, e.v, '', `Wrote ${e.v} into a[${e.i}].`);
      }
    }
    T.ln = null;
    if (o.final && o.final.length === T.n && o.final.some((v, i) => v !== T.a[i])) {
      T.a = o.final.slice();
      T.push('note', '', 'Some changes (for example arr.sort() or slice assignment) cannot be followed step by step. This is the array after them.');
    }
    if (o.truncated) { T.push('end', '', `Recording stopped after ${o.maxEvents} steps. The function may loop forever.`); return T.frames; }
    if (o.mode === 'search') {
      if (Number.isInteger(o.retInt) && o.retInt >= 0 && o.retInt < T.n) T.push('found', '', `Your function returned ${o.retInt}: a[${o.retInt}] is ${T.a[o.retInt]}.`, { found: [o.retInt] });
      else T.push('notfound', '', `Your function returned ${o.returned}.`);
    } else if (isSorted(T.a)) {
      T.markAll(); T.push('end', '', 'Done. The array is sorted ✓');
    } else {
      T.push('end', '', 'Done, but the array is NOT sorted at the end. Step back through the frames to find where it goes wrong.');
    }
    return T.frames;
  }

  /** Test arrays. kind: random | nearly | reversed | few */
  function makeArray(n, kind) {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    if (kind === 'reversed') return a.reverse();
    if (kind === 'nearly') { const swaps = Math.max(1, Math.round(n / 8)); for (let s = 0; s < swaps; s++) { const i = Math.floor(Math.random() * n), j = Math.min(n - 1, i + 1 + Math.floor(Math.random() * 3)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    if (kind === 'few') return Array.from({ length: n }, () => [20, 50, 80][Math.floor(Math.random() * 3)]);
    return shuffle(a);
  }

  const api = { Rec, ALGOS, ORDER, build, fromEvents, makeArray, isSorted };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Algos = api;
})(typeof window !== 'undefined' ? window : globalThis);
