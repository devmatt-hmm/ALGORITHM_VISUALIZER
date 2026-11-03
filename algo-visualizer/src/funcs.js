'use strict';
/* Pure helpers: find top-level Python functions, decide how to call them, parse the array input. */

const SIZE = new Set(['n', 'size', 'length', 'len', 'count', 'num']);
const LO = new Set(['lo', 'low', 'left', 'l', 'start', 'begin', 'first']);
const HI = new Set(['hi', 'high', 'right', 'r', 'last']);

function splitParams(s) {
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

/** Top-level functions: [{name, startLine, endLine, params:[{name, required}], sig}] (0-based lines). */
function findFunctions(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const out = [];
  let inTriple = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // crude triple-quote tracking so docstrings that mention "def" are ignored
    const trip = l.match(/("""|''')/g);
    if (inTriple) { if (l.includes(inTriple)) inTriple = null; continue; }
    if (trip && trip.length % 2 === 1) { const m = /("""|''')/.exec(l); if (!/^def\b/.test(l)) { inTriple = m[1]; continue; } }
    const m = /^(async\s+)?def\s+([A-Za-z_]\w*)\s*\((.*)$/.exec(l);
    if (!m) continue;
    // gather the signature until the closing paren of the parameter list
    let sig = m[3], k = i, depth = 1;
    let acc = '';
    for (;;) {
      for (const ch of sig) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) { depth--; if (depth === 0) break; } acc += ch; }
      if (depth === 0 || k + 1 >= lines.length) break;
      k++; sig = lines[k];
    }
    const params = splitParams(acc).filter((p) => p !== '*' && p !== '/').map((p) => {
      const nm = /^\*{0,2}([A-Za-z_]\w*)/.exec(p);
      return { name: nm ? nm[1] : p, required: !p.includes('=') && !p.startsWith('*') };
    });
    // block end: last line before the next non-blank line at column 0
    let end = k;
    for (let b = k + 1; b < lines.length; b++) {
      if (!lines[b].trim()) continue;
      if (/^\S/.test(lines[b]) && !/^[)\]}]/.test(lines[b])) break;
      end = b;
    }
    out.push({ name: m[2], startLine: i, endLine: end, params, isAsync: !!m[1] });
    i = k;
  }
  return out;
}

/** How to call a function: { plan:[...], needsTarget } or { error }. */
function planArgs(fn) {
  if (fn.isAsync) return { error: `"${fn.name}" is an async function, which is not supported.` };
  const ps = fn.params;
  if (!ps.length) return { error: `"${fn.name}" takes no parameters, so there is no list to visualize. It needs a list as its first parameter.` };
  const plan = ['arr'];
  let needsTarget = false, targetName = null;
  for (let i = 1; i < ps.length; i++) {
    const p = ps[i];
    if (!p.required) continue;
    if (SIZE.has(p.name)) plan.push('size');
    else if (LO.has(p.name)) plan.push('lo');
    else if (HI.has(p.name)) plan.push('hi');
    else if (!needsTarget) { plan.push('target'); needsTarget = true; targetName = p.name; }
    else return { error: `"${fn.name}" needs more arguments than I can fill in (${ps.map((x) => x.name).join(', ')}). I can pass the list, a target value, the size, and lo/hi range bounds.` };
  }
  return { plan, needsTarget, targetName };
}

/** "5, 2 9;1" -> [5,2,9,1] or { error } */
function parseArray(s, min = 2, max = 60) {
  const cleaned = String(s).replace(/[\[\](){}]/g, ' ').trim();
  if (!cleaned) return { error: 'Type some whole numbers separated by commas, e.g. 5, 2, 9, 1.' };
  const parts = cleaned.split(/[,;\s]+/).filter(Boolean);
  const bad = parts.find((p) => !/^-?\d+$/.test(p));
  if (bad !== undefined) return { error: `"${bad}" is not a whole number. Use integers separated by commas.` };
  const nums = parts.map(Number);
  if (nums.some((n) => Math.abs(n) > 99999)) return { error: 'Keep the numbers between -99999 and 99999.' };
  if (nums.length < min) return { error: `Give at least ${min} numbers.` };
  if (nums.length > max) return { error: `Give at most ${max} numbers (you gave ${nums.length}).` };
  return { array: nums };
}

module.exports = { findFunctions, planArgs, parseArray, splitParams };

/** A sensible starting guess for "arguments" based on parameter names. */
function defaultArgs(fn) {
  const guess = (n) => {
    if (/^(arr|array|lst|list|nums|numbers|items|data|a_list|xs|seq)$/i.test(n)) return '[5, 2, 9, 1]';
    if (/^(s|st|string|word|text|txt|word1|word2|s1|s2)$/i.test(n)) return '"abc"';
    if (/^(src|source|from|frm|origin|start_peg)$/i.test(n)) return '"A"';
    if (/^(dst|dest|destination|to|target_peg)$/i.test(n)) return '"C"';
    if (/^(via|aux|auxiliary|tmp|temp|spare|mid|middle)$/i.test(n)) return '"B"';
    if (/^(a|x)$/i.test(n)) return '12';
    if (/^b$/i.test(n)) return '18';
    if (/^(lo|low|left|start|i|idx|index)$/i.test(n)) return '0';
    if (/^(n|num|k|m)$/i.test(n)) return '5';
    return '4';
  };
  return fn.params.filter((p) => p.required).map((p) => guess(p.name)).join(', ');
}
module.exports.defaultArgs = defaultArgs;
