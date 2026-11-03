"""Recursion harness: calls ONE user function and records every (recursive) call and return.

usage: rec_harness.py SRC OUT FN_NAME ARGS_TEXT MAX_CALLS DOC_DIR TIMEOUT_SEC ORIG_PATH
"""
import ast
import builtins
import inspect
import json
import os
import sys
import threading

(src_path, out_path, fn_name, args_text, max_calls, doc_dir, timeout_s, orig_path) = sys.argv[1:9]
max_calls = int(max_calls)
timeout_s = float(timeout_s)

result = {"events": [], "truncated": False, "timedOut": False, "error": None, "returned": None, "params": []}


class _Stop(BaseException):
    pass


def write_result():
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f)
    except Exception:
        pass


def fatal(kind, message, line=None):
    result["error"] = {"type": kind, "message": message, "line": line, "fatal": True}
    write_result()


def short(v, n=22):
    try:
        r = repr(v)
    except Exception:
        r = "?"
    return r if len(r) <= n else r[: n - 1] + "…"


def on_timeout():
    result["timedOut"] = True
    write_result()
    os._exit(0)


def main():
    with open(src_path, encoding="utf-8") as f:
        source = f.read()
    try:
        code_obj = compile(source, src_path, "exec")
    except SyntaxError as e:
        return fatal("SyntaxError", e.msg, e.lineno)
    g = {"__name__": "__rec__", "__file__": orig_path or src_path, "__builtins__": builtins}
    sys.argv = [orig_path or src_path]
    if doc_dir:
        sys.path.insert(0, doc_dir)
    sys.setrecursionlimit(max(1000, max_calls * 2 + 200))
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
            return fatal("NameError", "function %s was not found" % fn_name)
        target = getattr(fn, "__wrapped__", fn)
        code = getattr(target, "__code__", None)
        if code is None:
            return fatal("TypeError", "%s is not a plain Python function" % fn_name)
        try:
            args = ast.literal_eval("(" + args_text + ",)") if args_text.strip() else ()
        except Exception as e:
            return fatal("ArgsError", "could not read the arguments (%s)" % e)
        try:
            sig = inspect.signature(target)
            result["params"] = list(sig.parameters)
            sig.bind(*args)
        except TypeError as e:
            return fatal("ArgsError", "the arguments do not fit %s%s: %s" % (fn_name, str(sig), e))
        except Exception:
            pass
        argnames = code.co_varnames[: code.co_argcount]
        ids = {}
        exc = {}
        stack = []
        count = [0]

        def gtrace(frame, event, arg):
            if frame.f_code is not code:
                return None
            if count[0] >= max_calls:
                result["truncated"] = True
                raise _Stop()
            cid = count[0]
            count[0] += 1
            parent = stack[-1] if stack else None
            vals = []
            for a in argnames:
                if a in frame.f_locals:
                    vals.append(short(frame.f_locals[a]))
            text = "%s(%s)" % (fn_name, ", ".join(vals))
            result["events"].append({"k": "call", "id": cid, "parent": parent, "text": text, "ln": code.co_firstlineno})
            ids[id(frame)] = cid
            stack.append(cid)
            return ltrace

        def ltrace(frame, event, arg):
            if event == "exception":
                exc[id(frame)] = arg[0].__name__
            elif event == "return":
                cid = ids.pop(id(frame), None)
                if cid is None:
                    return ltrace
                if stack and stack[-1] == cid:
                    stack.pop()
                name = exc.pop(id(frame), None)
                if name is not None and arg is None:
                    result["events"].append({"k": "ret", "id": cid, "value": name, "err": True, "ln": frame.f_lineno})
                else:
                    result["events"].append({"k": "ret", "id": cid, "value": short(arg), "ln": frame.f_lineno})
            return ltrace

        sys.settrace(gtrace)
        try:
            ret = fn(*args)
            result["returned"] = short(ret, 60)
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
    write_result()


main()
