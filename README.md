Algorithm Visualizer
Watch sorting, searching, linked lists, stacks, queues, recursion, trees and graphs run one step at a time, or trace your own Python code.

Run Algorithm Visualizer: Open (algorithms) Open Data Structures, Open Recursion, Open Trees or Open Graphs from the Command Palette (Ctrl/Cmd+Shift+P). The panel has five tabs.

Built-in demos
Bubble, selection, insertion, merge, quick and heap sort; linear and binary search.

Bars show the array. Yellow = comparing, orange = swapped, purple = written, blue = pivot / middle, green = sorted / found.
Play, pause, step forward and back, scrub, and a speed slider (← → and space also work).
The code pane shows the algorithm in C++ or Python with the current line highlighted.
Counters for comparisons, swaps and writes, and a best / average / worst / space / stable table.
Pick array size (5 to 50), type (random, nearly sorted, reversed, few unique) or type your own numbers. Searches take a target.
Trace your own Python function
Put the cursor in a function and press Ctrl+Alt+A (Cmd+Alt+A on Mac), or right-click → Visualize My Python Function. You are asked for the list (and a target for searches). Your function runs once on a list that records every comparison and every write; the panel replays them and highlights your line for each step.

How arguments are filled in: the first parameter gets the list. Parameters named n/size/length get the list length; lo/low/left get 0; hi/high/right get length-1; any other required parameter is asked for as the search target.

Works best for algorithms that change the list in place (bubble, selection, insertion, quick, heap, binary/linear search). If the list is not sorted at the end, the panel says so: step back to find where it goes wrong.

Data structures tab
Pick a structure, pick an operation, press Run: the operation plays as an animation of boxes and arrows, one pointer change per step, with the matching line of C++ or Python highlighted.

Structure	Operations
Singly linked list	insert at head / tail / index, delete head / tail / by value, search, reverse (watch each arrow turn around)
Stack (array, capacity 8)	push, pop, peek, with overflow and underflow shown
Queue (linked list)	enqueue, dequeue, peek, with front and rear pointers
Circular queue (array of 6)	enqueue, dequeue, peek, with front / rear wrapping around with % capacity
Value left empty means a random one. Random fill, Undo and Reset keep experiments quick. Each structure remembers its own contents. Wrong input (letters, an index past the end, deleting from an empty list) gets a clear message instead of a crash.

Trace your own linked list / stack / queue (Python)
Open a Python file and press Ctrl+Alt+D (Cmd+Alt+D on Mac), or right-click → Visualize My Linked List / Stack / Queue Code. The whole file runs once. Whenever a linked structure changes, that is a step, drawn as boxes and arrows, with the line that caused it highlighted.

Any objects with a .next attribute are nodes (nxt, next_node and link also work; .prev draws a doubly-linked back arrow; circular lists are handled).
Your variables (head, cur, prev, self.head, ll.head…) show as ▲ labels; variables that become None are listed as NULL.
Short lists and deques of simple values are shown as rows of cells (toggle Show lists and deques), which covers stacks and queues built from list.append/pop or deque.
Put test code under if __name__ == "__main__": as usual; it runs.
Checks: Python missing or too old, syntax errors, runtime errors (steps before the error are kept), input(), infinite loops (stops at maxSnapshots steps or timeoutSeconds), a file with no linked structures (explained), untrusted workspaces (off).

Recursion tab
Pick a function and its input; the call tree grows one call at a time. Yellow = running now, blue = waiting for a call it made, green = returned (the value is shown in the box), purple = answered from a cache, red = raised an error. A call stack panel, the matching C++ / Python line, and counters (calls, depth, repeated calls) sit beside it.

Function	What to notice
Factorial	A straight chain: depth grows with n, answers multiply back up
Fibonacci (plain)	The tree explodes and the same boxes repeat, so watch repeated calls
Fibonacci (memoized)	Purple boxes: cache hits shrink the tree from exponential to linear, with a live memo table
Tower of Hanoi (1 to 4 disks)	Real pegs and disks move as the calls run; 2ⁿ − 1 moves
GCD (Euclid)	One call per level: tail recursion
Fast power	The exponent halves each call: only about log₂(e) calls
Inputs are validated (whole numbers within a range that keeps the tree readable).

Trace your own recursive function (Python)
Put the cursor in a function and press Ctrl+Alt+R (Cmd+Alt+R on Mac), or right-click → Visualize My Recursive Python Function. You type the arguments as Python values, for example 5, [3, 1, 4], 0 or 3, "A", "C", "B" (a sensible guess is pre-filled from the parameter names). The function is called once; every call (and its arguments) becomes a box and every return fills in its value. The highlighted line is where the call started or returned.

Missing base case: the tree stops at maxCalls calls and the panel tells you it is probably infinite recursion (try countdown(3) in samples/recursion.py).
Errors inside recursion: every call that raised turns red.
functools.lru_cache works (cached calls never enter the function, so they are not boxes).
Also checked: wrong number or kind of arguments, syntax errors, a function that never calls itself, input(), very slow code (timeout), untrusted workspaces (off).
Trees tab
Structure	Operations
Binary search tree	insert, search, delete (leaf, one child, two children with the in-order successor), find min / max, and the four traversals: in-order, pre-order, post-order, level-order
AVL tree	insert with automatic rotations (Left-Left, Right-Right, Left-Right, Right-Left); the number beside each node is its balance factor; search and the traversals too
Min-heap / Max-heap	insert (sift up), extract the root (sift down), peek; shown as a tree and as the array underneath, with the same cells highlighted
Traversals build their output as chips (level-order also shows its queue), and visited nodes get order badges 1, 2, 3… Try inserting 1 to 31 in order into the BST and then the AVL tree: the BST becomes a chain (height 31), the AVL tree stays at height 5. Demo limits: 31 nodes, 15 heap items, values -999 to 999 (a duplicate is reported, not inserted).

Trace your own tree code (Python)
Press Ctrl+Alt+T (Cmd+Alt+T on Mac) in a Python file, or right-click → Visualize My Tree Code. The whole file runs once; every change to a binary tree is a step, with the line that caused it highlighted.

Nodes are objects with .left / .right (also left_child, lchild, …). Your variables (root, node, self.root, tree.root…) are shown as ▲ labels. In recursion a name used by both the current call and its caller shows the caller's as root↑, so you can watch recursion walk down the tree.
Short lists (for example the result list a traversal fills) are shown as cells (toggle Show lists).
Same checks as the other tabs: Python missing, syntax errors, crashes (earlier steps kept), input(), infinite loops (maxSnapshots, timeoutSeconds), no tree found (explained), untrusted workspaces.
Graphs tab
Algorithm	What you see
Breadth-first search	A queue beside the graph, a level for every node, and (with a target) the path with the fewest edges
Depth-first search (recursive)	The call stack, discovery / finish times, and in a directed graph the edge that closes a cycle
Dijkstra	A priority queue (outdated entries struck through), the distance table filling in, "relax" and "keep" decisions edge by edge, the shortest-path tree, and with a target the cheapest path
Pick a ready-made graph (small, weighted road map, directed with a cycle, two disconnected islands, 3 × 3 grid, tree) or choose Type my own edges…: A-B, A-C:4, B-D for undirected (the number is a weight), A->B for directed. Names are 1 to 4 letters or digits; up to 12 nodes and 30 edges. Mistakes (mixed - and ->, a node joined to itself, a duplicate edge, a negative weight, an unknown start or target) get a clear message. The layout is computed for you. If the target cannot be reached, the panel says there is no path.

Trace your own graph function (Python)
Put the cursor in a function like def bfs(graph, start): (an optional third parameter receives a target) and press Ctrl+Alt+G (Cmd+Alt+G on Mac), or right-click → Visualize My Graph Function. You pick a graph, a start node, and how your function expects the graph:

Format	Passed as
dict of lists	{"A": ["B", "C"]}
dict of dicts	{"A": {"B": 4, "C": 2}}
dict of (neighbour, weight) tuples	{"A": [("B", 4), ("C", 2)]}
The function runs once. Whenever one of its variables changes, the nodes it refers to are marked on the graph: a variable holding a node is yellow with a ▲ label (node, u, v…), a set or bool list called visited / seen / done turns nodes green, a list or deque of nodes (queue, stack) or a heap of (dist, node) tuples shows as chips and turns nodes blue, and a dict keyed by node (dist, parent) becomes a table. Recursion shows a caller's variable as node↑. If your function reads the graph in a different format than you picked, you get a hint instead of a crash.

Checks: Python missing or too old, syntax errors, runtime errors (steps before the error are kept), input(), infinite loops (maxSnapshots, timeoutSeconds), a function that keeps no node variables (explained), untrusted workspaces (off).

What it checks for you
Situation	What happens
No editor / not a Python file / empty or huge file	Clear message (C++ files point you to the demos)
No def in the file, or the function takes no parameters	Explains what to change
Several functions and the cursor is in none	You pick from a list
Array typed wrongly (letters, decimals, too few / many)	Live message while typing
Python not installed or older than 3.8	Message with the setting to change; demos still work
Syntax error in your file	Shown with the line number
Code outside functions that crashes or asks for input()	Explained (it runs when the file loads; use if __name__ == "__main__":)
Your function raises an error	Reported with the line; steps before the error are kept
Infinite loop	Stops at maxEvents steps or timeoutSeconds
Function returns a new list instead of changing the input	Explained (use an in-place version, or the built-in merge sort)
arr.sort(), slicing or other changes that cannot be followed	Explained; the final array is shown
Untrusted workspace	Own-function tracing is off (it runs your code); demos work
Settings
algoVisualizer.pythonPath, .defaultArray, .maxEvents, .maxSnapshots, .maxCalls, .timeoutSeconds.

Limits
Tracing your own code supports Python only (C++ tracing is planned). Algorithm tracing needs whole-number lists. Only the list you receive is traced, not copies made with slices.

Develop
Open the folder in VS Code and press F5. npm test runs the checks (needs Python 3).
