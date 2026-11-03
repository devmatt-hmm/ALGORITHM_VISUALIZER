"""Algorithm Visualizer harness: runs ONE of the user's functions on a traced list.

usage: harness.py SRC OUT FN_NAME PLAN_JSON ARRAY_JSON TARGET_JSON MAX_EVENTS DOC_DIR TIMEOUT_SEC ORIG_PATH

PLAN is the argument list to build, e.g. ["arr","lo","hi"] or ["arr","target"].
Writes {events, initial, final, returned, retInt, truncated, timedOut, error} to OUT.
"""
import ast
import builtins
import json
import os
import sys
import threading

(src_path, out_path, fn_name, plan_json, array_json, target_json,
 max_events, doc_dir, timeout_s, orig_path) = sys.argv[1:11]
plan = json.loads(plan_json)
initial = json.loads(array_json)
target = json.loads(target_json)
max_events = int(max_events)
timeout_s = float(timeout_s)

result = {"events": [], "initial": initial, "final": None, "returned": None, "retInt": None,
          "truncated": False, "timedOut": False, "error": None}


class _Stop(BaseException):
    pass


def write_result():
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f)
    except Exception:
        pass


def user_line():
    f = sys._getframe(1)
    while f is not None:
        if f.f_code.co_filename == src_path:
            return f.f_lineno
        f = f.f_back
    return None


def record(ev):
    if len(result["events"]) >= max_events:
        result["truncated"] = True
        raise _Stop()
    ev["ln"] = user_line()
    result["events"].append(ev)


class Item(int):
    """An int that remembers which list position it was read from."""

    def _c(self, other, op):
        record({"k": "cmp", "i": getattr(self, "src", None), "j": getattr(other, "src", None), "op": op,
                "x": int(self), "y": int(other) if isinstance(other, int) and not isinstance(other, bool) else None})

    def __lt__(self, o): self._c(o, "<"); return int.__lt__(self, o)
    def __le__(self, o): self._c(o, "<="); return int.__le__(self, o)
    def __gt__(self, o): self._c(o, ">"); return int.__gt__(self, o)
    def __ge__(self, o): self._c(o, ">="); return int.__ge__(self, o)
    def __eq__(self, o): self._c(o, "=="); return int.__eq__(self, o)
    def __ne__(self, o): self._c(o, "!="); return int.__ne__(self, o)
    __hash__ = int.__hash__


class TracedList(list):
    def _idx(self, i):
        return i + len(self) if i < 0 else i

    def __getitem__(self, i):
        if isinstance(i, slice):
            return list.__getitem__(self, i)
        v = list.__getitem__(self, i)
        if isinstance(v, bool) or not isinstance(v, int):
            return v
        it = Item(v)
        it.src = self._idx(i)
        return it

    def __setitem__(self, i, v):
        if isinstance(i, slice):
            return list.__setitem__(self, i, v)
        plain = int(v) if isinstance(v, int) and not isinstance(v, bool) else v
        list.__setitem__(self, i, plain)
        record({"k": "set", "i": self._idx(i), "v": plain if isinstance(plain, int) else None})

    def __iter__(self):
        for i in range(len(self)):
            yield self[i]


def on_timeout():
    result["timedOut"] = True
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
    g = {"__name__": "__algo__", "__file__": orig_path or src_path, "__builtins__": builtins}
    sys.argv = [orig_path or src_path]
    if doc_dir:
        sys.path.insert(0, doc_dir)
    timer = threading.Timer(max(1.0, timeout_s * 0.85), on_timeout)
    timer.daemon = True
    timer.start()
    arr = TracedList(initial)
    try:
        try:
            exec(code, g)
        except BaseException as e:
            result["error"] = {"type": type(e).__name__, "message": str(e), "line": None, "fatal": True, "while": "loading"}
            raise _Stop()
        fn = g.get(fn_name)
        if not callable(fn):
            result["error"] = {"type": "NameError", "message": "function %s was not found" % fn_name, "fatal": True}
            raise _Stop()
        args = []
        for kind in plan:
            if kind == "arr": args.append(arr)
            elif kind == "size": args.append(len(initial))
            elif kind == "lo": args.append(0)
            elif kind == "hi": args.append(len(initial) - 1)
            elif kind == "target": args.append(target)
        ret = fn(*args)
        try:
            r = repr(ret)
        except Exception:
            r = "<value>"
        result["returned"] = r if len(r) <= 120 else r[:117] + "..."
        if isinstance(ret, int) and not isinstance(ret, bool):
            result["retInt"] = int(ret)
        if isinstance(ret, list) and not any(ret is x for x in (arr,)):
            result["returnedNewList"] = True
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
    result["final"] = [int(x) if isinstance(x, int) else None for x in list.__iter__(arr)]
    write_result()


main()
