'use strict';
/* Calls one Python function and records its call tree. Pure Node. Never throws. */
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findPython } = require('./pyrun');

function run(cmd, args, { cwd, env, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = cp.spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, signal }); } catch (e) { reject(e); return; }
    let out = '', err = '', settled = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { if (out.length < 8000) out += d; });
    child.stderr.on('data', (d) => { if (err.length < 8000) err += d; });
    child.on('error', (e) => { if (settled) return; settled = true; clearTimeout(timer); if (e && e.name === 'AbortError') resolve({ aborted: true }); else reject(e); });
    child.on('close', (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, out, err, timedOut }); });
    child.stdin.on('error', () => {});
    child.stdin.end('');
  });
}

/** o: { text, fn, argsText, docDir, origPath, extensionPath, signal, config: { pythonPath, maxCalls, timeoutSeconds } } */
async function traceRecursion(o) {
  const fail = (message, detail) => ({ status: 'error', message, detail });
  const py = findPython(o.config.pythonPath);
  if (!py) return fail('Python was not found. Install Python 3.8+ or set "algoVisualizer.pythonPath". The built-in demos still work.');
  if (py.tooOld) return fail(`Python ${py.tooOld} was found but 3.8+ is needed. Set "algoVisualizer.pythonPath".`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algorec-'));
  try {
    const src = path.join(dir, 'target.py'), out = path.join(dir, 'trace.json');
    fs.writeFileSync(src, o.text, 'utf8');
    const cwd = o.docDir && fs.existsSync(o.docDir) ? o.docDir : dir;
    const args = [...py.prefix, path.join(o.extensionPath, 'src', 'rec_harness.py'), src, out, o.fn, o.argsText, String(o.config.maxCalls), cwd, String(o.config.timeoutSeconds), o.origPath || ''];
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
    let r;
    try { r = await run(py.cmd, args, { cwd, env, timeoutMs: (o.config.timeoutSeconds + 3) * 1000, signal: o.signal }); }
    catch (e) { return fail(`Could not start Python: ${e.message}`); }
    if (r.aborted) return { status: 'cancelled' };
    let data = null;
    if (fs.existsSync(out)) { try { data = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { data = null; } }
    if (!data) {
      if (r.timedOut) return fail(`Your function did not finish within ${o.config.timeoutSeconds}s and was stopped before anything could be recorded.`);
      return fail('The Python helper stopped unexpectedly.', (r.err || '').slice(0, 1500));
    }
    const e = data.error;
    if (e && e.fatal) {
      if (e.type === 'SyntaxError') return fail(`Python cannot run this file: SyntaxError${e.line ? ` on line ${e.line}` : ''}: ${e.message}`);
      if (e.type === 'ArgsError') return fail(`Problem with the arguments: ${e.message}. Type Python values separated by commas, for example  5   or   [3, 1, 2], 0   or   "abc".`);
      if (e.while === 'loading') return fail(`The file raised ${e.type} while loading: ${e.message}. Code outside functions runs when the file loads; put it under if __name__ == "__main__":.`);
      return fail(e.message);
    }
    const notes = [];
    const calls = data.events.filter((x) => x.k === 'call').length;
    if (data.truncated) notes.push(`Recording stopped after ${calls} calls (limit: "algoVisualizer.maxCalls"). If your function should have finished, it probably never reaches its base case: infinite recursion.`);
    if (data.timedOut) notes.push(`Your function was stopped after ${o.config.timeoutSeconds}s. The calls recorded so far are shown.`);
    if (e) {
      if (e.type === 'RecursionError') notes.push('RecursionError: the recursion went too deep. Check that every call moves closer to the base case, and that the base case is correct.');
      else notes.push(`Your function raised ${e.type}${e.message ? ': ' + e.message : ''}${e.line ? ` (line ${e.line})` : ''}. Calls that raised are shown in red.`);
    }
    if (calls === 1 && !e && !data.truncated) notes.push(`${o.fn}() never called itself with these arguments, so the tree has a single node. Try a bigger input.`);
    if (calls === 0 && !e) notes.push('The function was never called (is it decorated in a way that replaces it?).');
    return { status: 'ok', events: data.events, truncated: !!data.truncated, timedOut: !!data.timedOut, returned: data.returned, params: data.params || [], runtimeError: e || null, notes };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

module.exports = { traceRecursion };
