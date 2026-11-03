'use strict';
/* Runs a whole Python script under the structure tracer. Pure Node. Never throws. */
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

/** o: { text, docDir, origPath, extensionPath, signal, config: { pythonPath, maxSnapshots, timeoutSeconds } } */
async function traceStructures(o) {
  const fail = (message, detail) => ({ status: 'error', message, detail });
  const py = findPython(o.config.pythonPath);
  if (!py) return fail('Python was not found. Install Python 3.8+ or set "algoVisualizer.pythonPath". The built-in demos still work.');
  if (py.tooOld) return fail(`Python ${py.tooOld} was found but 3.8+ is needed. Set "algoVisualizer.pythonPath".`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'algods-'));
  try {
    const src = path.join(dir, 'target.py'), out = path.join(dir, 'trace.json');
    fs.writeFileSync(src, o.text, 'utf8');
    const cwd = o.docDir && fs.existsSync(o.docDir) ? o.docDir : dir;
    const args = [...py.prefix, path.join(o.extensionPath, 'src', o.harness || 'ds_harness.py'), src, out, String(o.config.maxSnapshots), '60000', cwd, String(o.config.timeoutSeconds), o.origPath || ''];
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
    let r;
    try { r = await run(py.cmd, args, { cwd, env, timeoutMs: (o.config.timeoutSeconds + 3) * 1000, signal: o.signal }); }
    catch (e) { return fail(`Could not start Python: ${e.message}`); }
    if (r.aborted) return { status: 'cancelled' };
    let data = null;
    if (fs.existsSync(out)) { try { data = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { data = null; } }
    if (!data) {
      if (r.timedOut) return fail(`The program did not finish within ${o.config.timeoutSeconds}s and was stopped before anything could be recorded.`);
      return fail('The Python helper stopped unexpectedly.', (r.err || '').slice(0, 1500));
    }
    const e = data.error;
    if (e && e.fatal) return fail(`Python cannot run this file: SyntaxError${e.line ? ` on line ${e.line}` : ''}: ${e.message}`);
    const notes = [];
    if (data.timedOut) notes.push(`The program was stopped after ${o.config.timeoutSeconds}s (an infinite loop is the usual cause). The steps recorded so far are shown.`);
    if (data.truncated) notes.push(`Recording stopped after ${data.frames.length} steps / ${data.lines} lines (limit: "algoVisualizer.maxSnapshots"). The program may loop forever.`);
    if (e) {
      if (e.type === 'EOFError') notes.push('The program asked for input (input()), but nothing can be typed here. Use fixed values in the code instead.');
      else notes.push(`The program stopped with ${e.type}${e.message ? ': ' + e.message : ''}${e.line ? ` (line ${e.line})` : ''}. The steps before that are shown.`);
    }
    if (!data.frames.length && !e && !data.timedOut) {
      notes.push(o.emptyNote || 'No linked structures were found. I look for objects with a .next (or .prev) attribute, and for short lists / deques of simple values. Does your script create some and run (for example under if __name__ == "__main__":)?');
    }
    return { status: 'ok', frames: data.frames, sawNodes: data.sawNodes, sawArrays: data.sawArrays, truncated: !!data.truncated, timedOut: !!data.timedOut, runtimeError: e || null, notes };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

module.exports = { traceStructures };
