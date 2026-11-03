"""Graph harness: calls ONE user function on a graph and records which graph nodes their variables refer to.

usage: graph_harness.py SRC OUT FN_NAME CONFIG_JSON MAX_SNAPS MAX_LINES DOC_DIR TIMEOUT_SEC ORIG_PATH

CONFIG_JSON: {"nodes":[..], "edges":[{"u","v","w"}], "directed":bool, "format":"lists|dicts|tuples",
              "plan":["graph","start","target"], "start":..., "target":...}
"""
import builtins
import collections
import json
import os
import sys
import threading
import types

(src_path, out_path, fn_name, config_json, max_snaps, max_lines, doc_dir, timeout_s, orig_path) = sys.argv[1:10]
cfg = json.loads(config_json)
max_snaps = int(max_snaps)
max_lines = int(max_lines)
timeout_s = float(timeout_s)

result = {"frames": [], "returned": None, "truncated": False, "timedOut": False, "error": None, "lines": 0}
st = {"lines": 0, "sig": None}
last_line = {}
NODE_NAMES = {"u", "v", "node", "cur", "current", "curr", "n", "neighbor", "neighbour", "nbr", "nxt", "next_node", "x", "y", "start", "s", "src", "source", "target", "t", "goal", "end", "dest", "parent", "par", "p", "w", "a", "b", "i", "j", "k", "vertex"}
DONE_NAMES = ("vis", "seen", "done", "closed", "explored", "discovered", "processed", "finalized", "settled", "marked", "reached")


class _Stop(BaseException):
    pass


def write_result():
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f)
    except Exception:
        pass


def conv(x):
    return int(x) if isinstance(x, str) and x.isdigit() else x


def build_graph():
    nodes = [conv(n) for n in cfg["nodes"]]
    fmt = cfg["format"]
    adj = {u: [] for u in nodes}
    for e in cfg["edges"]:
        pairs = [(conv(e["u"]), conv(e["v"]), e["w"])]
        if not cfg["directed"]:
            pairs.append((conv(e["v"]), conv(e["u"]), e["w"]))
        for u, v, w in pairs:
            adj[u].append((v, w))
    order = {n: i for i, n in enumerate(nodes)}
    for u in adj:
        adj[u].sort(key=lambda p: order[p[0]])
    if fmt == "dicts":
        return nodes, {u: {v: w for v, w in adj[u]} for u in nodes}
    if fmt == "tuples":
        return nodes, {u: [(v, w) for v, w in adj[u]] for u in nodes}
    return nodes, {u: [v for v, _ in adj[u]] for u in nodes}


def show(v):
    if isinstance(v, float) and v in (float("inf"), float("-inf")):
        return "\u221e" if v > 0 else "-\u221e"
    try:
        r = repr(v)
    except Exception:
        r = "?"
    return r if len(r) <= 18 else r[:17] + "\u2026"


def main():
    with open(src_path, encoding="utf-8") as f:
        source = f.read()
    try:
        code_obj = compile(source, src_path, "exec")
    except SyntaxError as e:
        result["error"] = {"type": "SyntaxError", "message": e.msg, "line": e.lineno, "fatal": True}
        write_result()
        return
    g = {"__name__": "__graph__", "__file__": orig_path or src_path, "__builtins__": builtins}
    sys.argv = [orig_path or src_path]
    if doc_dir:
        sys.path.insert(0, doc_dir)
    sys.setrecursionlimit(3000)
    timer = threading.Timer(max(1.0, timeout_s * 0.85), on_timeout)
    timer.daemon = True
    timer.start()
    try:
        try:
            exec(code_obj, g)
        except BaseException as e:
            result["error"] = {"type": type(e).__name__, "message": str(e), "line": None, "fatal": True, "while": "loading"}
            write_result()
            return
        fn = g.get(fn_name)
        if not callable(fn):
            result["error"] = {"type": "NameError", "message": "function %s was not found" % fn_name, "fatal": True}
            write_result()
            return
        nodes, graph = build_graph()
        nodeset = set(nodes)
        int_nodes = all(isinstance(n, int) for n in nodes)
        index_nodes = int_nodes and sorted(nodes) == list(range(len(nodes)))

        def is_node(v, name=None):
            if isinstance(v, bool) or not isinstance(v, (str, int)):
                return False
            if v not in nodeset:
                return False
            if isinstance(v, int) and name is not None and name.split("\u2191")[0] not in NODE_NAMES:
                return False
            return True

        def classify(frames_vars):
            ptrs, sets, seqs, maps = {}, [], [], []
            used = set()

            def uniq(name):
                while name in used:
                    name += "\u2191"
                used.add(name)
                return name

            for name, v in frames_vars:
                if name.startswith("_") or v is graph:
                    continue
                if isinstance(v, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)):
                    continue
                if is_node(v, name):
                    ptrs[uniq(name)] = str(v)
                elif isinstance(v, (set, frozenset)) and v and all(is_node(x) for x in v):
                    sets.append({"name": uniq(name), "nodes": sorted(str(x) for x in v)})
                elif isinstance(v, (list, tuple, collections.deque)) and 0 < len(v) <= 20:
                    items = list(v)
                    if all(is_node(x) for x in items):
                        seqs.append({"name": uniq(name), "items": [str(x) for x in items], "nodes": [str(x) for x in items]})
                    elif all(isinstance(x, tuple) and any(is_node(y) and isinstance(y, str) for y in x) for x in items):
                        seqs.append({"name": uniq(name), "items": [show(x) for x in items], "nodes": [str(y) for x in items for y in x if is_node(y) and isinstance(y, str)]})
                    elif index_nodes and isinstance(v, list) and len(v) == len(nodes) and all(isinstance(x, bool) for x in v):
                        sets.append({"name": uniq(name), "nodes": [str(i) for i, x in enumerate(v) if x]})
                    elif index_nodes and isinstance(v, list) and len(v) == len(nodes) and all(isinstance(x, (int, float)) and not isinstance(x, bool) or x is None for x in v):
                        maps.append({"name": uniq(name), "rows": [[str(i), show(x)] for i, x in enumerate(v)]})
                elif isinstance(v, dict) and v and len(v) <= 20 and all(is_node(k) for k in v):
                    vals = list(v.values())
                    if all(isinstance(x, (list, dict, tuple, set)) for x in vals):
                        continue  # looks like an adjacency structure
                    if all(isinstance(x, (int, float, str)) or x is None for x in vals):
                        if all(isinstance(x, bool) for x in vals):
                            sets.append({"name": uniq(name), "nodes": [str(k) for k, x in v.items() if x]})
                        else:
                            maps.append({"name": uniq(name), "rows": [[str(k), show(x)] for k, x in v.items()]})
            return ptrs, sets, seqs, maps

        def take(frame, ln):
            chain, f = [], frame
            while f is not None:
                if f.f_code.co_filename == src_path:
                    chain.append(f)
                f = f.f_back
            pairs = []
            for fr in chain:
                pairs.extend(list(fr.f_locals.items()))
            ptrs, sets, seqs, maps = classify(pairs)
            snap = {"ptrs": ptrs, "sets": sets, "seqs": seqs, "maps": maps}
            sig = json.dumps(snap, sort_keys=True)
            if sig == st["sig"]:
                return
            st["sig"] = sig
            if not (ptrs or sets or seqs or maps) and not result["frames"]:
                return
            if len(result["frames"]) >= max_snaps:
                result["truncated"] = True
                raise _Stop()
            snap["ln"] = ln
            snap["fn"] = frame.f_code.co_name
            result["frames"].append(snap)

        def gtrace(frame, event, arg):
            if frame.f_code.co_filename != src_path:
                return None
            return ltrace

        def ltrace(frame, event, arg):
            st["lines"] += 1
            if st["lines"] > max_lines:
                result["truncated"] = True
                raise _Stop()
            if event == "line":
                take(frame, last_line.get(id(frame)))
                last_line[id(frame)] = frame.f_lineno
            elif event == "return":
                take(frame, last_line.pop(id(frame), None))
            return ltrace

        args = []
        for kind in cfg["plan"]:
            if kind == "graph":
                args.append(graph)
            elif kind == "start":
                args.append(conv(cfg["start"]))
            elif kind == "target":
                args.append(conv(cfg["target"]) if cfg.get("target") not in (None, "") else None)
        sys.settrace(gtrace)
        try:
            ret = fn(*args)
            result["returned"] = show(ret) if not isinstance(ret, (dict, list, set, tuple)) else (repr(ret) if len(repr(ret)) <= 80 else repr(ret)[:77] + "...")
        finally:
            sys.settrace(None)
    except _Stop:
        pass
    except SystemExit:
        pass
    except BaseException as e:
        line = None
        tb = e.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == src_path:
                line = tb.tb_lineno
            tb = tb.tb_next
        result["error"] = {"type": type(e).__name__, "message": str(e), "line": line, "fatal": False}
    finally:
        timer.cancel()
    result["lines"] = st["lines"]
    write_result()


def on_timeout():
    result["timedOut"] = True
    result["lines"] = st["lines"]
    write_result()
    os._exit(0)


main()
