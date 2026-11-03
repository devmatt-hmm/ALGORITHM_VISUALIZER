'use strict';
const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { findFunctions, planArgs, parseArray, defaultArgs } = require('./src/funcs');
const { traceFunction } = require('./src/pyrun');
const { traceStructures } = require('./src/dsrun');
const { traceRecursion } = require('./src/recrun');
const { traceGraph } = require('./src/graphrun');
const Graphs = require('./media/graphs.js');

let panel = null, ready = false, queue = [], abort = null, lastRun = null, lastDs = null, lastRc = null, lastTr = null, lastGr = null;
let extensionUri, extensionPath;

function config() {
  const c = vscode.workspace.getConfiguration('algoVisualizer');
  const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    pythonPath: (c.get('pythonPath') || '').trim(),
    maxEvents: clamp(c.get('maxEvents'), 100, 50000, 5000),
    maxSnapshots: clamp(c.get('maxSnapshots'), 50, 3000, 400),
    maxCalls: clamp(c.get('maxCalls'), 20, 2000, 300),
    timeoutSeconds: clamp(c.get('timeoutSeconds'), 2, 120, 10),
    defaultArray: c.get('defaultArray') || '5, 2, 9, 1, 7, 3, 8',
  };
}

function post(msg) {
  if (!panel) return;
  if (ready) panel.webview.postMessage(msg); else queue.push(msg);
}

function html(webview) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const uri = (f) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', f));
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${uri('main.css')}" rel="stylesheet"><title>Algorithm Visualizer</title></head>
<body><div id="tabs"></div><div id="algoView"></div><div id="dsView" hidden></div><div id="rcView" hidden></div><div id="trView" hidden></div><div id="grView" hidden></div>
<script nonce="${nonce}" src="${uri('algos.js')}"></script>
<script nonce="${nonce}" src="${uri('structs.js')}"></script>
<script nonce="${nonce}" src="${uri('recur.js')}"></script>
<script nonce="${nonce}" src="${uri('trees.js')}"></script>
<script nonce="${nonce}" src="${uri('graphs.js')}"></script>
<script nonce="${nonce}" src="${uri('main.js')}"></script>
<script nonce="${nonce}" src="${uri('dsview.js')}"></script>
<script nonce="${nonce}" src="${uri('recview.js')}"></script>
<script nonce="${nonce}" src="${uri('treeview.js')}"></script>
<script nonce="${nonce}" src="${uri('graphview.js')}"></script>
</body></html>`;
}

function ensurePanel() {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); return; }
  panel = vscode.window.createWebviewPanel('algoVisualizer', 'Algorithm Visualizer', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] });
  ready = false; queue = [];
  panel.webview.html = html(panel.webview);
  panel.onDidDispose(() => { if (abort) abort.abort(); panel = null; ready = false; queue = []; abort = null; });
  panel.webview.onDidReceiveMessage(async (m) => {
    try {
      if (m.type === 'ready') { ready = true; queue.forEach((q) => panel.webview.postMessage(q)); queue = []; }
      else if (m.type === 'rerun' && lastRun) await visualizeFunction(lastRun.uri, lastRun.fnName, lastRun.array, lastRun.target);
      else if (m.type === 'ds-rerun' && lastDs) await visualizeStructures(lastDs.uri);
      else if (m.type === 'gr-rerun' && lastGr) await visualizeGraph(lastGr.uri, lastGr);
      else if (m.type === 'tr-rerun' && lastTr) await visualizeTree(lastTr.uri);
      else if (m.type === 'rc-rerun' && lastRc) await visualizeRecursion(lastRc.uri, lastRc.fnName, lastRc.argsText);
      else if (m.type === 'cancel' && abort) abort.abort();
      else if (m.type === 'reveal' && (m.view === 'ds' ? lastDs : m.view === 'rc' ? lastRc : m.view === 'tr' ? lastTr : m.view === 'gr' ? lastGr : lastRun)) {
        const doc = await vscode.workspace.openTextDocument((m.view === 'ds' ? lastDs : m.view === 'rc' ? lastRc : m.view === 'tr' ? lastTr : m.view === 'gr' ? lastGr : lastRun).uri);
        const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
        const line = Math.max(0, Math.min(doc.lineCount - 1, m.line));
        ed.selection = new vscode.Selection(line, 0, line, 0);
        ed.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      }
    } catch (e) { vscode.window.showErrorMessage(`Algorithm Visualizer: ${e.message || e}`); }
  });
}

function openPanel(tab) { ensurePanel(); post({ type: 'init', trusted: vscode.workspace.isTrusted, tab: tab || 'algo' }); }

/** Ask for the array, with live validation. */
async function askArray(def) {
  const v = await vscode.window.showInputBox({
    title: 'Algorithm Visualizer: the list to pass to your function',
    prompt: 'Whole numbers separated by commas (2 to 60 numbers)', value: def, ignoreFocusOut: true,
    validateInput: (s) => { const r = parseArray(s); return r.error || null; },
  });
  if (v === undefined) return null;
  const r = parseArray(v);
  if (r.error) { vscode.window.showWarningMessage(`Algorithm Visualizer: ${r.error}`); return null; }
  return r.array;
}

async function visualizeFunction(uriArg, fnNameArg, arrayArg, targetArg) {
  try {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own function runs your code, so it is disabled in untrusted workspaces. The built-in demos still work (run "Algorithm Visualizer: Open").');
      return;
    }
    let doc, editor = null;
    if (uriArg) doc = await vscode.workspace.openTextDocument(uriArg);
    else {
      editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('Algorithm Visualizer: open a Python file and put the cursor inside a function first.'); return; }
      doc = editor.document;
    }
    if (doc.languageId !== 'python' && !/\.pyw?$/i.test(doc.fileName || '')) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own code works for Python files for now. Use "Algorithm Visualizer: Open" for the built-in demos with C++ code.');
      return;
    }
    const text = doc.getText();
    if (!text.trim()) { vscode.window.showInformationMessage('Algorithm Visualizer: this file is empty.'); return; }
    if (text.length > 1000000) { vscode.window.showWarningMessage('Algorithm Visualizer: this file is too large (over 1 MB).'); return; }

    const fns = findFunctions(text);
    if (!fns.length) {
      vscode.window.showInformationMessage('Algorithm Visualizer: no top-level functions (def ...) found in this file. Wrap your algorithm in a function that takes the list as its first parameter, like def bubble_sort(arr):');
      return;
    }
    let fn = null;
    if (fnNameArg) fn = fns.find((f) => f.name === fnNameArg);
    else {
      const line = editor ? editor.selection.active.line : -1;
      fn = fns.find((f) => f.startLine <= line && line <= f.endLine) || null;
      if (!fn) {
        if (fns.length === 1) fn = fns[0];
        else {
          const pick = await vscode.window.showQuickPick(fns.map((f) => ({ label: f.name, description: `line ${f.startLine + 1}`, detail: `(${f.params.map((p) => p.name).join(', ')})`, f })),
            { placeHolder: 'Which function do you want to visualize?' });
          if (!pick) return;
          fn = pick.f;
        }
      }
    }
    if (!fn) { vscode.window.showWarningMessage('Algorithm Visualizer: that function is no longer in the file.'); return; }

    const plan = planArgs(fn);
    if (plan.error) { vscode.window.showWarningMessage(`Algorithm Visualizer: ${plan.error}`); return; }

    let array = arrayArg;
    if (!array) { array = await askArray(config().defaultArray); if (!array) return; }
    let target = targetArg;
    if (plan.needsTarget && target === undefined) {
      const sorted = [...array].sort((a, b) => a - b);
      const v = await vscode.window.showInputBox({
        title: `Value to pass as "${plan.targetName}"`, prompt: 'A whole number', value: String(sorted[Math.floor(sorted.length / 2)]), ignoreFocusOut: true,
        validateInput: (s) => (/^\s*-?\d+\s*$/.test(s) ? null : 'Type a whole number.'),
      });
      if (v === undefined) return;
      target = parseInt(v, 10);
    }

    lastRun = { uri: doc.uri, fnName: fn.name, array, target };
    ensurePanel();
    if (abort) abort.abort();
    const ctl = new AbortController(); abort = ctl;
    const mode = plan.needsTarget || /search|find/i.test(fn.name) ? 'search' : 'sort';
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    post({ type: 'running', name: fn.name });

    const trace = await traceFunction({
      text, fn: fn.name, plan: plan.plan, array, target, mode, docDir: doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : undefined,
      origPath: doc.uri.scheme === 'file' ? doc.uri.fsPath : '', extensionPath, signal: ctl.signal, config: config(),
    });
    if (abort !== ctl) return;
    abort = null;
    if (trace.status === 'cancelled') { post({ type: 'user-error', message: 'Cancelled.' }); return; }
    if (trace.status === 'error') { post({ type: 'user-error', message: trace.message, detail: trace.detail }); return; }
    post({
      type: 'user', name: fn.name, mode, target, dirty: doc.isDirty, file: path.basename(doc.fileName || 'Untitled'),
      source: { startLine: fn.startLine, lines: lines.slice(fn.startLine, fn.endLine + 1).slice(0, 120) },
      trace,
    });
  } catch (e) {
    vscode.window.showErrorMessage(`Algorithm Visualizer: something went wrong (${e && e.message ? e.message : e}).`);
  }
}


/** Run the whole Python file and show every change to linked structures / short lists. */
async function visualizeStructures(uriArg) {
  try {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own code runs it, so it is disabled in untrusted workspaces. The built-in demos still work (run "Algorithm Visualizer: Open Data Structures").');
      return;
    }
    let doc;
    if (uriArg) doc = await vscode.workspace.openTextDocument(uriArg);
    else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('Algorithm Visualizer: open a Python file that builds a linked list, stack or queue first.'); return; }
      doc = editor.document;
    }
    if (doc.languageId !== 'python' && !/\.pyw?$/i.test(doc.fileName || '')) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own structures works for Python files for now. Use "Algorithm Visualizer: Open Data Structures" for the built-in demos with C++ code.');
      return;
    }
    const text = doc.getText();
    if (!text.trim()) { vscode.window.showInformationMessage('Algorithm Visualizer: this file is empty.'); return; }
    if (text.length > 1000000) { vscode.window.showWarningMessage('Algorithm Visualizer: this file is too large (over 1 MB).'); return; }

    lastDs = { uri: doc.uri };
    ensurePanel();
    if (abort) abort.abort();
    const ctl = new AbortController(); abort = ctl;
    post({ type: 'ds-running', name: path.basename(doc.fileName || 'file') });
    const trace = await traceStructures({
      text, docDir: doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : undefined,
      origPath: doc.uri.scheme === 'file' ? doc.uri.fsPath : '', extensionPath, signal: ctl.signal, config: config(),
    });
    if (abort !== ctl) return;
    abort = null;
    if (trace.status === 'cancelled') { post({ type: 'ds-error', message: 'Cancelled.' }); return; }
    if (trace.status === 'error') { post({ type: 'ds-error', message: trace.message, detail: trace.detail }); return; }
    post({
      type: 'ds-user', file: path.basename(doc.fileName || 'Untitled'), dirty: doc.isDirty,
      source: text.split('\n').map((l) => l.replace(/\r$/, '')).slice(0, 500), trace,
    });
  } catch (e) {
    vscode.window.showErrorMessage(`Algorithm Visualizer: something went wrong (${e && e.message ? e.message : e}).`);
  }
}

/** Run the whole Python file and show every change to binary trees. */
async function visualizeTree(uriArg) {
  try {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own code runs it, so it is disabled in untrusted workspaces. The built-in demos still work (run "Algorithm Visualizer: Open Trees").');
      return;
    }
    let doc;
    if (uriArg) doc = await vscode.workspace.openTextDocument(uriArg);
    else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('Algorithm Visualizer: open a Python file that builds a binary tree first.'); return; }
      doc = editor.document;
    }
    if (doc.languageId !== 'python' && !/\.pyw?$/i.test(doc.fileName || '')) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own tree works for Python files for now. Use "Algorithm Visualizer: Open Trees" for the built-in demos with C++ code.');
      return;
    }
    const text = doc.getText();
    if (!text.trim()) { vscode.window.showInformationMessage('Algorithm Visualizer: this file is empty.'); return; }
    if (text.length > 1000000) { vscode.window.showWarningMessage('Algorithm Visualizer: this file is too large (over 1 MB).'); return; }

    lastTr = { uri: doc.uri };
    ensurePanel();
    if (abort) abort.abort();
    const ctl = new AbortController(); abort = ctl;
    post({ type: 'tr-running', name: path.basename(doc.fileName || 'file') });
    const trace = await traceStructures({
      harness: 'tree_harness.py', emptyNote: 'No binary tree nodes were found. I look for objects with .left and/or .right attributes (also left_child / right_child). Does your script build a tree and run (for example under if __name__ == "__main__":)?',
      text, docDir: doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : undefined,
      origPath: doc.uri.scheme === 'file' ? doc.uri.fsPath : '', extensionPath, signal: ctl.signal, config: config(),
    });
    if (abort !== ctl) return;
    abort = null;
    if (trace.status === 'cancelled') { post({ type: 'tr-error', message: 'Cancelled.' }); return; }
    if (trace.status === 'error') { post({ type: 'tr-error', message: trace.message, detail: trace.detail }); return; }
    post({
      type: 'tr-user', file: path.basename(doc.fileName || 'Untitled'), dirty: doc.isDirty,
      source: text.split('\n').map((l) => l.replace(/\r$/, '')).slice(0, 500), trace,
    });
  } catch (e) {
    vscode.window.showErrorMessage(`Algorithm Visualizer: something went wrong (${e && e.message ? e.message : e}).`);
  }
}

/** Call one recursive Python function and show its call tree. */
async function visualizeRecursion(uriArg, fnNameArg, argsArg) {
  try {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own function runs your code, so it is disabled in untrusted workspaces. The built-in demos still work (run "Algorithm Visualizer: Open Recursion").');
      return;
    }
    let doc, editor = null;
    if (uriArg) doc = await vscode.workspace.openTextDocument(uriArg);
    else {
      editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('Algorithm Visualizer: open a Python file and put the cursor inside a recursive function first.'); return; }
      doc = editor.document;
    }
    if (doc.languageId !== 'python' && !/\.pyw?$/i.test(doc.fileName || '')) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own recursion works for Python files for now. Use "Algorithm Visualizer: Open Recursion" for the built-in demos with C++ code.');
      return;
    }
    const text = doc.getText();
    if (!text.trim()) { vscode.window.showInformationMessage('Algorithm Visualizer: this file is empty.'); return; }
    if (text.length > 1000000) { vscode.window.showWarningMessage('Algorithm Visualizer: this file is too large (over 1 MB).'); return; }
    const fns = findFunctions(text);
    if (!fns.length) { vscode.window.showInformationMessage('Algorithm Visualizer: no top-level functions (def ...) found in this file. Only top-level functions can be traced.'); return; }
    let fn = null;
    if (fnNameArg) fn = fns.find((f) => f.name === fnNameArg);
    else {
      const line = editor ? editor.selection.active.line : -1;
      fn = fns.find((f) => f.startLine <= line && line <= f.endLine) || null;
      if (!fn) {
        if (fns.length === 1) fn = fns[0];
        else {
          const pick = await vscode.window.showQuickPick(fns.map((f) => ({ label: f.name, description: `line ${f.startLine + 1}`, detail: `(${f.params.map((p) => p.name).join(', ')})`, f })), { placeHolder: 'Which function do you want to visualize?' });
          if (!pick) return;
          fn = pick.f;
        }
      }
    }
    if (!fn) { vscode.window.showWarningMessage('Algorithm Visualizer: that function is no longer in the file.'); return; }
    if (fn.isAsync) { vscode.window.showWarningMessage(`Algorithm Visualizer: "${fn.name}" is an async function, which is not supported.`); return; }

    let argsText = argsArg;
    if (argsText === undefined) {
      const need = fn.params.filter((p) => p.required).map((p) => p.name);
      argsText = await vscode.window.showInputBox({
        title: `Arguments for ${fn.name}(${need.join(', ')})`,
        prompt: 'Python values separated by commas, e.g.  5   or   [3, 1, 4], 0   or   "abc"',
        value: defaultArgs(fn), ignoreFocusOut: true,
        validateInput: (s) => (s.length > 300 ? 'Keep the arguments under 300 characters.' : (need.length && !s.trim() ? `${fn.name} needs ${need.length} argument${need.length > 1 ? 's' : ''}: ${need.join(', ')}.` : null)),
      });
      if (argsText === undefined) return;
    }

    lastRc = { uri: doc.uri, fnName: fn.name, argsText };
    ensurePanel();
    if (abort) abort.abort();
    const ctl = new AbortController(); abort = ctl;
    post({ type: 'rc-running', name: fn.name, argsText });
    const trace = await traceRecursion({
      text, fn: fn.name, argsText, docDir: doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : undefined,
      origPath: doc.uri.scheme === 'file' ? doc.uri.fsPath : '', extensionPath, signal: ctl.signal, config: config(),
    });
    if (abort !== ctl) return;
    abort = null;
    if (trace.status === 'cancelled') { post({ type: 'rc-error', message: 'Cancelled.' }); return; }
    if (trace.status === 'error') { post({ type: 'rc-error', message: trace.message, detail: trace.detail }); return; }
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    post({
      type: 'rc-user', name: fn.name, argsText, file: path.basename(doc.fileName || 'Untitled'), dirty: doc.isDirty,
      source: { startLine: fn.startLine, lines: lines.slice(fn.startLine, fn.endLine + 1).slice(0, 120) }, trace,
    });
  } catch (e) {
    vscode.window.showErrorMessage(`Algorithm Visualizer: something went wrong (${e && e.message ? e.message : e}).`);
  }
}

const GRAPH_FORMATS = [
  { id: 'lists', label: 'dict of lists', detail: '{"A": ["B", "C"]}   (neighbours only, weights ignored)' },
  { id: 'dicts', label: 'dict of dicts', detail: '{"A": {"B": 4, "C": 2}}   (neighbour: weight)' },
  { id: 'tuples', label: 'dict of (neighbour, weight) tuples', detail: '{"A": [("B", 4), ("C", 2)]}' },
];

/** Call one Python graph function (graph, start[, target]) and overlay its variables on the graph. */
async function visualizeGraph(uriArg, redo) {
  try {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own function runs your code, so it is disabled in untrusted workspaces. The built-in demos still work (run "Algorithm Visualizer: Open Graphs").');
      return;
    }
    let doc, editor = null;
    if (uriArg) doc = await vscode.workspace.openTextDocument(uriArg);
    else {
      editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('Algorithm Visualizer: open a Python file and put the cursor inside a graph function (like def bfs(graph, start):) first.'); return; }
      doc = editor.document;
    }
    if (doc.languageId !== 'python' && !/\.pyw?$/i.test(doc.fileName || '')) {
      vscode.window.showWarningMessage('Algorithm Visualizer: tracing your own graph code works for Python files for now. Use "Algorithm Visualizer: Open Graphs" for the built-in demos with C++ code.');
      return;
    }
    const text = doc.getText();
    if (!text.trim()) { vscode.window.showInformationMessage('Algorithm Visualizer: this file is empty.'); return; }
    if (text.length > 1000000) { vscode.window.showWarningMessage('Algorithm Visualizer: this file is too large (over 1 MB).'); return; }
    const fns = findFunctions(text);
    if (!fns.length) { vscode.window.showInformationMessage('Algorithm Visualizer: no top-level functions (def ...) found in this file. Only top-level functions can be traced.'); return; }
    let fn = null;
    if (redo && redo.fnName) fn = fns.find((f) => f.name === redo.fnName);
    else {
      const line = editor ? editor.selection.active.line : -1;
      fn = fns.find((f) => f.startLine <= line && line <= f.endLine) || null;
      if (!fn) {
        if (fns.length === 1) fn = fns[0];
        else {
          const pick = await vscode.window.showQuickPick(fns.map((f) => ({ label: f.name, description: `line ${f.startLine + 1}`, detail: `(${f.params.map((p) => p.name).join(', ')})`, f })), { placeHolder: 'Which function do you want to visualize?' });
          if (!pick) return;
          fn = pick.f;
        }
      }
    }
    if (!fn) { vscode.window.showWarningMessage('Algorithm Visualizer: that function is no longer in the file.'); return; }
    if (fn.isAsync) { vscode.window.showWarningMessage(`Algorithm Visualizer: "${fn.name}" is an async function, which is not supported.`); return; }
    const req = fn.params.filter((p) => p.required);
    if (!req.length) { vscode.window.showWarningMessage(`Algorithm Visualizer: "${fn.name}" takes no parameters. A graph function needs the graph as its first parameter, like def ${fn.name}(graph, start):`); return; }
    if (req.length > 3) { vscode.window.showWarningMessage(`Algorithm Visualizer: "${fn.name}" needs ${req.length} arguments (${req.map((p) => p.name).join(', ')}). I can pass the graph, a start node and a target node, in that order.`); return; }
    const plan = ['graph', 'start', 'target'].slice(0, req.length);

    let spec = redo && redo.spec, graph, start = redo && redo.start, target = redo && redo.target, format = redo && redo.format;
    if (!spec) {
      const items = [...Graphs.PRESET_ORDER.map((id) => ({ label: Graphs.PRESETS[id].name, description: Graphs.PRESETS[id].text, spec: { preset: id } })), { label: '$(edit) Type my own edges…', spec: { custom: true } }];
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Which graph should your function run on?' });
      if (!pick) return;
      spec = pick.spec;
      if (spec.custom) {
        const t = await vscode.window.showInputBox({ title: 'Edges of your graph', prompt: 'Example:  A-B, A-C:4, B-D   (use A->B for directed edges, :4 for a weight)', value: 'A-B, A-C, B-D, C-D, D-E', ignoreFocusOut: true, validateInput: (s) => { const r = Graphs.parseGraph(s); return r.error || null; } });
        if (t === undefined) return;
        spec = { text: t };
      }
    }
    if (spec.preset) graph = Graphs.preset(spec.preset); else { const r = Graphs.parseGraph(spec.text); if (r.error) { vscode.window.showWarningMessage(`Algorithm Visualizer: ${r.error}`); return; } graph = r.graph; }
    const ids = graph.nodes.map((n) => n.id);
    if (plan.includes('start') && (!start || !ids.includes(start))) {
      const p = await vscode.window.showQuickPick(ids, { placeHolder: `Start node (the "${req[1].name}" argument)` });
      if (!p) return; start = p;
    }
    if (plan.includes('target') && target === undefined) {
      const p = await vscode.window.showQuickPick(['(none)', ...ids], { placeHolder: `Target node (the "${req[2].name}" argument)` });
      if (!p) return; target = p === '(none)' ? '' : p;
    }
    if (!format) {
      const order = graph.weighted ? [GRAPH_FORMATS[1], GRAPH_FORMATS[2], GRAPH_FORMATS[0]] : GRAPH_FORMATS;
      const p = await vscode.window.showQuickPick(order.map((f) => ({ label: f.label, description: f.detail, f })), { placeHolder: 'How does your function expect the graph?' });
      if (!p) return; format = p.f.id;
    }
    const formatName = GRAPH_FORMATS.find((f) => f.id === format).label;

    lastGr = { uri: doc.uri, fnName: fn.name, spec, start, target, format };
    ensurePanel();
    if (abort) abort.abort();
    const ctl = new AbortController(); abort = ctl;
    post({ type: 'gr-running', name: fn.name });
    const trace = await traceGraph({
      text, fn: fn.name, graph, format, formatName, plan, start, target, docDir: doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : undefined,
      origPath: doc.uri.scheme === 'file' ? doc.uri.fsPath : '', extensionPath, signal: ctl.signal, config: config(),
    });
    if (abort !== ctl) return;
    abort = null;
    if (trace.status === 'cancelled') { post({ type: 'gr-error', message: 'Cancelled.' }); return; }
    if (trace.status === 'error') { post({ type: 'gr-error', message: trace.message, detail: trace.detail }); return; }
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    post({
      type: 'gr-user', name: fn.name, file: path.basename(doc.fileName || 'Untitled'), dirty: doc.isDirty, graph, start, target, format, formatName,
      source: { startLine: fn.startLine, lines: lines.slice(fn.startLine, fn.endLine + 1).slice(0, 120) }, trace,
    });
  } catch (e) {
    vscode.window.showErrorMessage(`Algorithm Visualizer: something went wrong (${e && e.message ? e.message : e}).`);
  }
}

function activate(context) {
  extensionUri = context.extensionUri; extensionPath = context.extensionPath;
  context.subscriptions.push(
    vscode.commands.registerCommand('algoVisualizer.open', () => openPanel('algo')),
    vscode.commands.registerCommand('algoVisualizer.openStructures', () => openPanel('ds')),
    vscode.commands.registerCommand('algoVisualizer.visualizeStructures', () => visualizeStructures()),
    vscode.commands.registerCommand('algoVisualizer.openRecursion', () => openPanel('rc')),
    vscode.commands.registerCommand('algoVisualizer.openTrees', () => openPanel('tr')),
    vscode.commands.registerCommand('algoVisualizer.openGraphs', () => openPanel('gr')),
    vscode.commands.registerCommand('algoVisualizer.visualizeGraph', () => visualizeGraph()),
    vscode.commands.registerCommand('algoVisualizer.visualizeTree', () => visualizeTree()),
    vscode.commands.registerCommand('algoVisualizer.visualizeRecursion', () => visualizeRecursion()),
    vscode.commands.registerCommand('algoVisualizer.visualizeFunction', () => visualizeFunction()),
  );
}
function deactivate() { if (abort) abort.abort(); }

module.exports = { activate, deactivate };
