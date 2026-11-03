'use strict';
/* Runs the user's Python function on a traced list. Pure Node (no VS Code API). Never throws. */
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let cached = null;

function findPython(configured) {
  const key = configured || '';
  if (cached && cached.key === key) return cached.value;
  const cands = configured ? [{ cmd: configured, prefix: [] }]
    : process.platform === 'win32'
      ? [{ cmd: 'py', prefix: ['-3'] }, { cmd: 'python', prefix: [] }, { cmd: 'python3', prefix: [] }]
      : [{ cmd: 'python3', prefix: [] }, { cmd: 'python', prefix: [] }];
  let tooOld = null;
  for (const c of cands) {
    const r = cp.spawnSync(c.cmd, [...c.prefix, '-c', 'import sys;print(sys.version_info[0]*100+sys.version_info[1])'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    if (r.error || r.status !== 0) continue;
    const v = parseInt((r.stdout || '').trim(), 10);
    if (v >= 308) { cached = { key, value: c }; return c; }
    tooOld = v;
  }
  return tooOld ? { tooOld: `${Math.floor(tooOld / 100)}.${tooOld % 100}` } : null;
}

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

/**
 * o: { text, docDir, origPath, fn, plan, array, target, extensionPath, signal,
 *      config: { pythonPath, maxEvents, timeoutSeconds } }
 */
async function traceFunction(o) {
  const fail = (message, detail) => ({ status: 'error', message, detail });
  const py = findPython(o.config.pythonPath);
  if (!py) return fail('Python was not found. Install Python 3.8+ or set "algoVisualizer.pythonPath". The built-in demos still work.');
  if (py.tooOld) return fail(`Python ${py.tooOld} was found but 3.8+ is needed. Set "algoVisualizer.pythonPath".`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algoviz-'));
  try {
    const src = path.join(dir, 'target.py');
    const out = path.join(dir, 'trace.json');
    fs.writeFileSync(src, o.text, 'utf8');
    const cwd = o.docDir && fs.existsSync(o.docDir) ? o.docDir : dir;
    const args = [...py.prefix, path.join(o.extensionPath, 'src', 'harness.py'), src, out, o.fn, JSON.stringify(o.plan),
      JSON.stringify(o.array), JSON.stringify(o.target === undefined ? null : o.target), String(o.config.maxEvents), cwd,
      String(o.config.timeoutSeconds), o.origPath || ''];
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
    let r;
    try { r = await run(py.cmd, args, { cwd, env, timeoutMs: (o.config.timeoutSeconds + 3) * 1000, signal: o.signal }); }
    catch (e) { return fail(`Could not start Python: ${e.message}`); }
    if (r.aborted) return { status: 'cancelled' };
    let data = null;
    if (fs.existsSync(out)) { try { data = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { data = null; } }
    if (!data) {
      if (r.timedOut) return fail(`Your function did not finish within ${o.config.timeoutSeconds}s and was stopped.`);
      return fail('The Python helper stopped unexpectedly.', (r.err || '').slice(0, 1500));
    }
    const e = data.error;
    if (e && e.fatal) {
      if (e.type === 'SyntaxError') return fail(`Python cannot run this file: SyntaxError${e.line ? ` on line ${e.line}` : ''}: ${e.message}`);
      if (e.while === 'loading') return fail(`The file raised ${e.type} while loading: ${e.message}. Code outside functions runs when the file loads; put it under if __name__ == "__main__":.`);
      return fail(e.message);
    }
    const notes = [];
    if (data.timedOut) notes.push(`Your function was stopped after ${o.config.timeoutSeconds}s. An infinite loop is the usual cause.`);
    if (data.truncated) notes.push(`Recording stopped after ${o.config.maxEvents} steps. The function may loop forever (change "algoVisualizer.maxEvents" to record more).`);
    if (e) notes.push(`Your function stopped with ${e.type}${e.message ? ': ' + e.message : ''}${e.line ? ` (line ${e.line})` : ''}.`);
    const sets = data.events.filter((x) => x.k === 'set').length;
    if (!e && !data.truncated && data.returnedNewList && sets === 0 && o.mode !== 'search') {
      notes.push('This function returns a new list instead of changing the input, so there is little to show. Algorithms that sort in place (changing the list you pass in) animate best. For merge sort, try the built-in demo.');
    }
    if (!data.events.length && !e && !data.timedOut) {
      notes.push('Your function never compared or changed any list element, so there are no steps to show. Does it use the list you pass in?');
    }
    return { status: 'ok', events: data.events, initial: data.initial, final: data.final, returned: data.returned, retInt: data.retInt,
      truncated: !!data.truncated, timedOut: !!data.timedOut, runtimeError: e || null, notes };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

module.exports = { traceFunction, findPython };
