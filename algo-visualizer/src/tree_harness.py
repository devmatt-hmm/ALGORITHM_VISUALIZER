"""Tree harness: runs the user's whole script and snapshots binary-tree structures as they change.

usage: ds_harness.py SRC OUT MAX_SNAPS MAX_LINES DOC_DIR TIMEOUT_SEC ORIG_PATH
"""
import builtins
import collections
import json
import os
import sys
import threading
import types

src_path, out_path, max_snaps, max_lines, doc_dir, timeout_s, orig_path = sys.argv[1:8]
max_snaps = int(max_snaps)
max_lines = int(max_lines)
timeout_s = float(timeout_s)

LEFT = ("left", "lchild", "left_child", "leftchild", "left_node", "leftnode")
RIGHT = ("right", "rchild", "right_child", "rightchild", "right_node", "rightnode")
VAL = ("data", "val", "value", "key", "item", "info", "element", "x", "name", "num", "number", "v")
PRIM = (int, float, str, bool, type(None))
MAX_NODES = 63

result = {"frames": [], "truncated": False, "timedOut": False, "error": None, "sawNodes": False, "sawArrays": False, "lines": 0}
st = {"lines": 0, "last_sig": None}
idmap = {}
keep = []
seen_ptrs = set()
last_line = {}


class _Stop(BaseException):
    pass


def write_result():
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f)
    except Exception:
        pass


def attrs(o):
    if isinstance(o, (type, types.ModuleType, types.FunctionType, types.BuiltinFunctionType, types.MethodType)) or isinstance(o, PRIM):
        return None
    d = getattr(o, "__dict__", None)
    if isinstance(d, dict):
        return d
    slots = getattr(type(o), "__slots__", None)
    if slots:
        if isinstance(slots, str):
            slots = (slots,)
        out = {}
        for s in slots:
            if hasattr(o, s):
                out[s] = getattr(o, s)
        return out
    return None


def pick(d, names):
    for n in names:
        if n in d:
            return d[n]
    return None


def is_node(o):
    d = attrs(o)
    return d is not None and any(k in d for k in LEFT + RIGHT)


def short(v):
    try:
        r = repr(v)
    except Exception:
        r = "?"
    return r if len(r) <= 12 else r[:11] + "…"


def node_value(d):
    for n in VAL:
        if n in d and isinstance(d[n], PRIM):
            return short(d[n])
    for k, v in d.items():
        if k not in LEFT and k not in RIGHT and isinstance(v, PRIM):
            return short(v)
    return "•"


def ident(o):
    k = id(o)
    if k not in idmap:
        idmap[k] = len(idmap) + 1
        keep.append(o)
    return idmap[k]


def prim_list(v):
    return len(v) <= 16 and all(isinstance(x, PRIM) for x in v)


def snapshot(frame):
    nodes = {}
    ptrs = {}
    arrays = []

    def add(o):
        stack = [o]
        while stack:
            cur = stack.pop()
            nid = ident(cur)
            if nid in nodes or len(nodes) >= MAX_NODES:
                continue
            d = attrs(cur)
            n = {"id": nid, "v": node_value(d), "l": None, "r": None}
            nodes[nid] = n
            lc = pick(d, LEFT)
            if lc is not None and is_node(lc):
                n["l"] = ident(lc)
                stack.append(lc)
            rc = pick(d, RIGHT)
            if rc is not None and is_node(rc):
                n["r"] = ident(rc)
                stack.append(rc)

    def point(label, o):
        if is_node(o):
            add(o)
            val = ident(o)
            seen_ptrs.add(label)
        elif o is None and label in seen_ptrs:
            val = None
        else:
            return
        lab = label
        while lab in ptrs and ptrs[lab] != val:
            lab += "\u2191"   # same name in a caller's frame: show it as name↑
        ptrs.setdefault(lab, val)

    chain = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == src_path:
            chain.append(f)
        f = f.f_back
    for fr in chain:
        for name, v in list(fr.f_locals.items()):
            if name.startswith("__") or name.startswith("_"):
                continue
            if isinstance(v, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)):
                continue
            if is_node(v) or v is None:
                point(name, v)
            elif isinstance(v, (list, collections.deque)):
                if prim_list(v) and not any(a["name"] == name for a in arrays):
                    arrays.append({"name": name, "items": [short(x) for x in v], "deque": isinstance(v, collections.deque)})
            else:
                d = attrs(v)
                if d:
                    for k, a in list(d.items())[:12]:
                        label = k if name == "self" else "%s.%s" % (name, k)
                        if is_node(a) or a is None:
                            point(label, a)
                        elif isinstance(a, (list, collections.deque)) and prim_list(a) and not any(x["name"] == label for x in arrays):
                            arrays.append({"name": label, "items": [short(x) for x in a], "deque": isinstance(a, collections.deque)})
    # drop "obj.head" when "head" already points at the same node
    for label in list(ptrs):
        if "." in label:
            attr = label.split(".", 1)[1]
            if attr in ptrs and ptrs[attr] == ptrs[label]:
                del ptrs[label]
    return {"nodes": sorted(nodes.values(), key=lambda n: n["id"]), "ptrs": ptrs, "arrays": arrays}


def take(frame, ln):
    snap = snapshot(frame)
    sig = json.dumps(snap, sort_keys=True)
    if sig == st["last_sig"]:
        return
    st["last_sig"] = sig
    if not result["frames"] and not (snap["nodes"] or snap["arrays"]):
        return
    if snap["nodes"]:
        result["sawNodes"] = True
    if snap["arrays"]:
        result["sawArrays"] = True
    if len(result["frames"]) >= max_snaps:
        result["truncated"] = True
        raise _Stop()
    name = frame.f_code.co_name
    snap["ln"] = ln
    snap["fn"] = "main" if name == "<module>" else name
    result["frames"].append(snap)


def global_trace(frame, event, arg):
    if frame.f_code.co_filename != src_path:
        return None
    return local_trace


def local_trace(frame, event, arg):
    st["lines"] += 1
    if st["lines"] > max_lines:
        result["truncated"] = True
        raise _Stop()
    if event == "line":
        take(frame, last_line.get(id(frame)))
        last_line[id(frame)] = frame.f_lineno
    elif event == "return":
        take(frame, last_line.pop(id(frame), None))
    return local_trace


def on_timeout():
    result["timedOut"] = True
    result["lines"] = st["lines"]
    write_result()
    os._exit(0)


def main():
    with open(src_path, encoding="utf-8") as f:
        source = f.read()
    try:
        code = compile(source, src_path, "exec")
    except SyntaxError as e:
        result["error"] = {"type": "SyntaxError", "message": e.msg, "line": e.lineno, "fatal": True}
        write_result()
        return
    g = {"__name__": "__main__", "__file__": orig_path or src_path, "__builtins__": builtins}
    sys.argv = [orig_path or src_path]
    if doc_dir:
        sys.path.insert(0, doc_dir)
    timer = threading.Timer(max(1.0, timeout_s * 0.85), on_timeout)
    timer.daemon = True
    timer.start()
    sys.settrace(global_trace)
    try:
        exec(code, g)
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
        sys.settrace(None)
        timer.cancel()
    result["lines"] = st["lines"]
    write_result()


main()
