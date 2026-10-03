#!/usr/bin/env node
// Class combiner - runs after post-build.js has minified class names.
//
// For every page, finds sets of 1, 2, 3, ... classes that appear together on
// elements and replaces each chosen set with one short combo class (e.g.
// class="c8 c26 c27 c15" -> class="a c15"). A combo only pays off when the
// class characters it removes from the HTML outweigh the CSS characters it
// adds, so the gain of every candidate set is:
//
//   (class chars saved on every element that uses the set)
//   - (selector chars appended to every CSS rule that targets the set)
//
// CSS is never copied into new rules. The combo name is appended to the
// selector list of each existing rule (`.c8{display:flex}` ->
// `.c8,.a{display:flex}`), so every declaration keeps its original position in
// the cascade and its original specificity (`.c61.c62` becomes `.a.a`). This is
// what broke the old combineClasses() in post-build.js: it moved declarations
// into a new rule at the end of the stylesheet, which changed which rule won
// against dark: and responsive variants.
//
// Results are cached in .cache/class-combos.json. On the next build a page is
// only re-analysed for the class lists that changed since the cached run; a
// page whose class lists and CSS are both unchanged reuses its cached combos.
//
// Usage: node scripts/combine-classes.js [--site _site] [--cache path]
//          [--no-cache] [--dry-run] [--only index.html] [--quiet]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');

const CACHE_VERSION = 1;
// Elements with more eligible classes than this only get subsets up to
// LARGE_ELEMENT_MAX_SUBSET in size, so the subset count stays bounded.
const FULL_ENUM_LIMIT = 16;
const LARGE_ELEMENT_MAX_SUBSET = 5;
// Selectors whose variant count would exceed this are left alone.
const MAX_VARIANTS_PER_SELECTOR = 64;

const CLASS_ATTR = /(\sclass=")([^"]*)(")/g;
const STYLE_BLOCK = /(<style[^>]*>)([\s\S]*?)(<\/style>)/g;
const SCRIPT_BLOCK = /<script[^>]*>([\s\S]*?)<\/script>/g;

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

// ---------------------------------------------------------------------------
// Page analysis
// ---------------------------------------------------------------------------

// Collects every complex selector in the page's <style> blocks, split into
// literal text and class occurrences, grouped into compounds.
function analyseCSS(styleTexts) {
  const selectors = [];
  const cssClasses = new Set();
  const negatedClasses = new Set();
  const attrClassValues = new Set();

  styleTexts.forEach((text, blockIdx) => {
    let root;
    try {
      root = postcss.parse(text);
    } catch (e) {
      return;
    }
    let ruleIdx = 0;
    root.walkRules(rule => {
      const myRuleIdx = ruleIdx++;
      if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      if (!rule.selector.includes('.') && !rule.selector.includes('[class')) return;

      let complexTexts = [];
      try {
        selectorParser(r => {
          r.each(sel => complexTexts.push(sel.toString().trim()));
        }).processSync(rule.selector);
      } catch (e) {
        return;
      }

      complexTexts.forEach(text => {
        const occurrences = [];
        selectorParser(r => {
          r.walkAttributes(a => {
            if (a.attribute === 'class' && a.value) attrClassValues.add(a.value);
          });
          r.walkClasses(c => {
            let negated = false;
            for (let p = c.parent; p; p = p.parent) {
              if (p.type === 'pseudo' && p.value.toLowerCase() === ':not') negated = true;
            }
            const raw = '.' + ((c.raws && c.raws.value) || c.value);
            if (text.slice(c.sourceIndex, c.sourceIndex + raw.length) !== raw) {
              // Position mismatch: never rewrite this class.
              negatedClasses.add(c.value);
              return;
            }
            cssClasses.add(c.value);
            if (negated) negatedClasses.add(c.value);
            // A compound is the run of simple selectors between combinators
            // inside one Selector container.
            let combinatorsBefore = 0;
            for (const n of c.parent.nodes) {
              if (n === c) break;
              if (n.type === 'combinator') combinatorsBefore++;
            }
            occurrences.push({
              cls: c.value,
              start: c.sourceIndex,
              end: c.sourceIndex + raw.length,
              rawLen: raw.length,
              compoundKey: c.parent, // object identity, mapped below
              compoundIdx: combinatorsBefore,
            });
          });
        }).processSync(text);
        if (!occurrences.length) return;
        occurrences.sort((a, b) => a.start - b.start);

        // Split selector text into literal parts and class slots.
        const parts = [];
        let pos = 0;
        const compoundIds = new Map();
        const compounds = [];
        occurrences.forEach(o => {
          parts.push(text.slice(pos, o.start));
          let byIdx = compoundIds.get(o.compoundKey);
          if (!byIdx) compoundIds.set(o.compoundKey, (byIdx = new Map()));
          let cIdx = byIdx.get(o.compoundIdx);
          if (cIdx === undefined) {
            cIdx = compounds.length;
            byIdx.set(o.compoundIdx, cIdx);
            compounds.push({ slots: [], classes: new Set() });
          }
          const slot = parts.length;
          parts.push({ cls: o.cls, raw: text.slice(o.start, o.end), compound: cIdx });
          compounds[cIdx].slots.push(slot);
          compounds[cIdx].classes.add(o.cls);
          pos = o.end;
        });
        parts.push(text.slice(pos));
        selectors.push({ blockIdx, ruleIdx: myRuleIdx, text, parts, compounds });
      });
    });
  });

  return { selectors, cssClasses, negatedClasses, attrClassValues };
}

function extractPage(html) {
  const styleTexts = [];
  html.replace(STYLE_BLOCK, (m, open, body) => {
    styleTexts.push(body);
    return m;
  });

  // Words used by scripts outside of class="..." markup. A class named in
  // script code may be queried or toggled at runtime, so it is never merged.
  const scriptWords = new Set();
  html.replace(SCRIPT_BLOCK, (m, body) => {
    body.replace(/class="[^"]*"/g, '').replace(/[A-Za-z_][\w-]*/g, w => {
      scriptWords.add(w);
      return w;
    });
    return m;
  });

  const classLists = [];
  const htmlClasses = new Set();
  html.replace(CLASS_ATTR, (m, pre, value) => {
    const tokens = value.split(/\s+/).filter(Boolean);
    tokens.forEach(t => htmlClasses.add(t));
    classLists.push(tokens);
    return m;
  });

  return { styleTexts, scriptWords, classLists, htmlClasses };
}

function eligibleClasses(page, css) {
  const eligible = new Set();
  css.cssClasses.forEach(c => {
    if (!page.htmlClasses.has(c)) return;
    if (css.negatedClasses.has(c)) return;
    if (page.scriptWords.has(c)) return;
    for (const v of css.attrClassValues) if (v.includes(c) || c.includes(v)) return;
    eligible.add(c);
  });
  return eligible;
}

// ---------------------------------------------------------------------------
// Subset enumeration (the cached, incremental part)
// ---------------------------------------------------------------------------

function signatureOf(tokens) {
  return [...new Set(tokens)].sort().join(' ');
}

// Subsets are stored as base-36 indexes into the page's sorted list of
// eligible classes ("c117 c118 c15" -> "2.3.a"), which keeps the cache small.
function classTable(eligible) {
  const list = [...eligible].sort();
  return { list, ids: new Map(list.map((c, i) => [c, i.toString(36)])) };
}

function eligiblePart(signature, table) {
  return signature.split(' ')
    .filter(c => table.ids.has(c))
    .map(c => table.ids.get(c))
    .sort((a, b) => parseInt(a, 36) - parseInt(b, 36));
}

function forEachSubset(classes, fn) {
  const n = classes.length;
  if (n <= FULL_ENUM_LIMIT) {
    for (let mask = 1; mask < 1 << n; mask++) {
      const subset = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(classes[i]);
      fn(subset.join('.'));
    }
    return;
  }
  const pick = (start, acc) => {
    if (acc.length) fn(acc.join('.'));
    if (acc.length === LARGE_ELEMENT_MAX_SUBSET) return;
    for (let i = start; i < n; i++) pick(i + 1, acc.concat(classes[i]));
  };
  pick(0, []);
}

function addSignatureSubsets(subsetCounts, signature, table, delta) {
  forEachSubset(eligiblePart(signature, table), key => {
    const next = (subsetCounts[key] || 0) + delta;
    if (next === 0) delete subsetCounts[key];
    else subsetCounts[key] = next;
  });
}

// ---------------------------------------------------------------------------
// Greedy selection
// ---------------------------------------------------------------------------

function* comboNames(taken) {
  // Lowercase only: pages that render in quirks mode match class selectors
  // case-insensitively, so `a` and `A` would collide.
  const first = 'abcdefghijklmnopqrstuvwxyz';
  const rest = first + '0123456789';
  for (const a of first) if (!taken.has(a)) yield a;
  for (const a of first) for (const b of rest) if (!taken.has(a + b)) yield a + b;
  for (const a of first) for (const b of rest) for (const c of rest) if (!taken.has(a + b + c)) yield a + b + c;
}

// Ties break on the class list so a cached run and a full run pick the same
// combos in the same order.
function higher(a, b) {
  return a.key > b.key || (a.key === b.key && a.id < b.id);
}

class MaxHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  peek() { return this.items[0]; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!higher(a[i], a[p])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && higher(a[l], a[m])) m = l;
        if (r < a.length && higher(a[r], a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Per-page model of which token each element shows for each class, and how
// many selector variants that forces in the CSS.
function buildModel(sigCounts, eligible, css) {
  const sigs = Object.entries(sigCounts).map(([signature, mult]) => {
    const all = new Set(signature.split(' ').filter(Boolean));
    return {
      signature,
      mult,
      all,
      uncovered: new Set([...all].filter(c => eligible.has(c))),
      map: new Map(), // class -> combo name
      combos: [],
    };
  });

  const compounds = [];
  const compoundsByClass = new Map();
  css.selectors.forEach((sel, selIdx) => {
    sel.compoundRefs = sel.compounds.map(comp => {
      const id = compounds.length;
      const matching = [];
      sigs.forEach((s, i) => {
        for (const c of comp.classes) if (!s.all.has(c)) return;
        matching.push(i);
      });
      const entry = { selIdx, slots: comp.slots, classes: comp.classes, matching, alts: null };
      compounds.push(entry);
      comp.classes.forEach(c => {
        if (!compoundsByClass.has(c)) compoundsByClass.set(c, []);
        compoundsByClass.get(c).push(id);
      });
      return id;
    });
  });

  const model = { sigs, compounds, compoundsByClass, selectors: css.selectors };
  compounds.forEach(comp => (comp.alts = compoundAlts(model, comp, null)));
  model.selCost = css.selectors.map((sel, i) => selectorCost(model, i, null));
  return model;
}

// Distinct rewrites of one compound that some element actually needs,
// as Map(tupleKey -> length difference vs. the original text).
function compoundAlts(model, comp, override) {
  const sel = model.selectors[comp.selIdx];
  const alts = new Map([['', 0]]);
  comp.matching.forEach(i => {
    const map = (override && override.has(i)) ? override.get(i) : model.sigs[i].map;
    let key = '';
    let diff = 0;
    comp.slots.forEach(slot => {
      const part = sel.parts[slot];
      const name = map.get(part.cls);
      if (name) {
        key += slot + '=' + name + ';';
        diff += name.length + 1 - part.raw.length;
      }
    });
    if (key && !alts.has(key)) alts.set(key, diff);
  });
  return alts;
}

// Characters appended to one rule for all variants of one complex selector:
// every combination of compound rewrites except the original, each with a
// leading comma.
function selectorCost(model, selIdx, altOverride) {
  const sel = model.selectors[selIdx];
  let n = 1;
  const stats = sel.compoundRefs.map(id => {
    const alts = (altOverride && altOverride.has(id)) ? altOverride.get(id) : model.compounds[id].alts;
    let d = 0;
    alts.forEach(v => (d += v));
    n *= alts.size;
    return { size: alts.size, d };
  });
  if (n === 1) return 0;
  if (n > MAX_VARIANTS_PER_SELECTOR) return Infinity;
  let cost = (n - 1) * (sel.text.length + 1);
  stats.forEach(s => (cost += s.d * (n / s.size)));
  return cost;
}

function evaluate(model, classes, name) {
  const set = new Set(classes);
  const hit = [];
  let htmlSaved = 0;
  const perElement = classes.reduce((t, c) => t + c.length, 0) + classes.length - 1 - name.length;
  model.sigs.forEach((s, i) => {
    for (const c of classes) if (!s.uncovered.has(c)) return;
    hit.push(i);
    htmlSaved += s.mult * perElement;
  });
  if (!hit.length) return { gain: -Infinity, htmlSaved: 0, cssAdded: 0, hit };

  const override = new Map();
  hit.forEach(i => {
    const m = new Map(model.sigs[i].map);
    classes.forEach(c => m.set(c, name));
    override.set(i, m);
  });
  const altOverride = new Map();
  const touchedSels = new Set();
  classes.forEach(c => (model.compoundsByClass.get(c) || []).forEach(id => {
    if (altOverride.has(id)) return;
    const comp = model.compounds[id];
    if (!comp.matching.some(i => override.has(i))) return;
    altOverride.set(id, compoundAlts(model, comp, override));
    touchedSels.add(comp.selIdx);
  }));
  let cssAdded = 0;
  touchedSels.forEach(selIdx => {
    cssAdded += selectorCost(model, selIdx, altOverride) - model.selCost[selIdx];
  });
  return { gain: htmlSaved - cssAdded, htmlSaved, cssAdded, hit, override, altOverride, touchedSels };
}

function applyCombo(model, classes, name, ev) {
  ev.hit.forEach(i => {
    const s = model.sigs[i];
    classes.forEach(c => s.uncovered.delete(c));
    s.map = ev.override.get(i);
    s.combos.push(name);
  });
  ev.altOverride.forEach((alts, id) => (model.compounds[id].alts = alts));
  ev.touchedSels.forEach(selIdx => (model.selCost[selIdx] = selectorCost(model, selIdx, null)));
}

function chooseCombos(model, subsetCounts, table, takenNames) {
  const names = comboNames(takenNames);
  let nextName = names.next().value;
  const heap = new MaxHeap();
  const perElementBound = classes => classes.reduce((t, c) => t + c.length, 0) + classes.length - 2;
  Object.entries(subsetCounts).forEach(([key, count]) => {
    const classes = key.split('.').map(id => table.list[parseInt(id, 36)]);
    const bound = count * perElementBound(classes);
    if (bound > 0) heap.push({ key: bound, id: key, classes });
  });

  const chosen = [];
  while (heap.size && nextName) {
    const top = heap.pop();
    if (top.key <= 0) break;
    const ev = evaluate(model, top.classes, nextName);
    if (ev.gain === -Infinity) continue;
    if (heap.size && higher(heap.peek(), { key: ev.gain, id: top.id })) {
      heap.push({ key: ev.gain, id: top.id, classes: top.classes });
      continue;
    }
    if (ev.gain <= 0) break;
    applyCombo(model, top.classes, nextName, ev);
    chosen.push({ name: nextName, classes: top.classes, gain: ev.gain, htmlSaved: ev.htmlSaved, cssAdded: ev.cssAdded });
    nextName = names.next().value;
  }
  return chosen;
}

// Rebuilds the model state for combos taken from the cache.
function replayCombos(model, combos) {
  for (const combo of combos) {
    const ev = evaluate(model, combo.classes, combo.name);
    if (ev.gain === -Infinity) return false;
    applyCombo(model, combo.classes, combo.name, ev);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Rewriting
// ---------------------------------------------------------------------------

function selectorVariants(model, selIdx) {
  const sel = model.selectors[selIdx];
  const altLists = sel.compoundRefs.map(id => [...model.compounds[id].alts.keys()]);
  let combos = [[]];
  altLists.forEach(list => {
    const next = [];
    combos.forEach(prefix => list.forEach(k => next.push(prefix.concat(k))));
    combos = next;
  });
  const variants = [];
  combos.forEach(choice => {
    if (choice.every(k => k === '')) return;
    const replace = new Map();
    choice.forEach(k => k.split(';').filter(Boolean).forEach(pair => {
      const [slot, name] = pair.split('=');
      replace.set(Number(slot), name);
    }));
    variants.push(sel.parts.map((p, i) => typeof p === 'string' ? p : '.' + (replace.get(i) || p.raw.slice(1))).join(''));
  });
  return variants;
}

function rewritePage(html, model) {
  const bySig = new Map(model.sigs.map(s => [s.signature, s]));

  html = html.replace(CLASS_ATTR, (m, pre, value, post) => {
    const tokens = value.split(/\s+/).filter(Boolean);
    const s = bySig.get(signatureOf(tokens));
    if (!s || !s.map.size) return m;
    const out = [];
    const seen = new Set();
    tokens.forEach(t => {
      const name = s.map.get(t);
      if (!name) return out.push(t);
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    });
    return pre + out.join(' ') + post;
  });

  // Group appended selector variants by rule.
  const additions = new Map(); // "block:rule" -> [variant]
  model.selectors.forEach((sel, i) => {
    if (model.selCost[i] === 0) return;
    const key = sel.blockIdx + ':' + sel.ruleIdx;
    if (!additions.has(key)) additions.set(key, []);
    additions.get(key).push(...selectorVariants(model, i));
  });

  let blockIdx = 0;
  html = html.replace(STYLE_BLOCK, (m, open, body, close) => {
    const myBlock = blockIdx++;
    let root;
    try {
      root = postcss.parse(body);
    } catch (e) {
      return m;
    }
    let ruleIdx = 0;
    let changed = false;
    root.walkRules(rule => {
      const extra = additions.get(myBlock + ':' + ruleIdx++);
      if (!extra) return;
      rule.selector = rule.selector.trim() + ',' + extra.join(',');
      changed = true;
    });
    return changed ? open + root.toString() + close : m;
  });

  return html;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function loadCache(cachePath) {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (data.version === CACHE_VERSION) return data;
  } catch (e) {}
  return { version: CACHE_VERSION, pages: {} };
}

function processPage(html, cached) {
  const t0 = process.hrtime.bigint();
  const page = extractPage(html);
  const css = analyseCSS(page.styleTexts);
  const eligible = eligibleClasses(page, css);

  const sigCounts = {};
  page.classLists.forEach(tokens => {
    const sig = signatureOf(tokens);
    if (sig) sigCounts[sig] = (sigCounts[sig] || 0) + 1;
  });

  // Anything that changes which selectors exist or which classes may be
  // merged invalidates the whole page entry.
  const table = classTable(eligible);
  const cssKey = sha1(JSON.stringify([page.styleTexts, table.list]));

  let mode;
  let subsetCounts;
  let sigsChanged = 0;
  if (cached && cached.cssKey === cssKey) {
    subsetCounts = cached.subsetCounts;
    const before = cached.sigCounts;
    const keys = new Set([...Object.keys(before), ...Object.keys(sigCounts)]);
    keys.forEach(sig => {
      const delta = (sigCounts[sig] || 0) - (before[sig] || 0);
      if (!delta) return;
      sigsChanged++;
      addSignatureSubsets(subsetCounts, sig, table, delta);
    });
    mode = sigsChanged ? 'incremental' : 'cached';
  } else {
    subsetCounts = {};
    Object.entries(sigCounts).forEach(([sig, count]) => addSignatureSubsets(subsetCounts, sig, table, count));
    mode = 'full';
  }
  const t1 = process.hrtime.bigint();

  const model = buildModel(sigCounts, eligible, css);
  const takenNames = new Set([...page.htmlClasses, ...css.cssClasses, ...page.scriptWords].map(n => n.toLowerCase()));

  let combos;
  if (mode === 'cached' && replayCombos(model, cached.combos)) {
    combos = cached.combos;
  } else {
    if (mode === 'cached') {
      mode = 'full';
      return processPage(html, null);
    }
    combos = chooseCombos(model, subsetCounts, table, takenNames);
  }
  const t2 = process.hrtime.bigint();

  const out = combos.length ? rewritePage(html, model) : html;
  const t3 = process.hrtime.bigint();

  return {
    html: out,
    entry: { cssKey, sigCounts, subsetCounts, combos },
    stats: {
      mode,
      sigsChanged,
      elements: page.classLists.length,
      signatures: Object.keys(sigCounts).length,
      eligibleClasses: eligible.size,
      candidates: Object.keys(subsetCounts).length,
      combos: combos.length,
      htmlSaved: combos.reduce((t, c) => t + c.htmlSaved, 0),
      cssAdded: combos.reduce((t, c) => t + c.cssAdded, 0),
      bytesBefore: Buffer.byteLength(html),
      bytesAfter: Buffer.byteLength(out),
      ms: {
        subsets: Number(t1 - t0) / 1e6,
        select: Number(t2 - t1) / 1e6,
        rewrite: Number(t3 - t2) / 1e6,
        total: Number(t3 - t0) / 1e6,
      },
    },
  };
}

function walkHTML(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkHTML(full, out);
    else if (name.endsWith('.html')) out.push(full);
  });
  return out;
}

function run(opts = {}) {
  const siteDir = opts.siteDir || '_site';
  const cachePath = opts.cachePath || '.cache/class-combos.json';
  const useCache = opts.cache !== false;
  const cache = useCache ? loadCache(cachePath) : { version: CACHE_VERSION, pages: {} };
  const results = {};

  let files = walkHTML(siteDir);
  if (opts.only) files = files.filter(f => path.relative(siteDir, f) === opts.only);

  const t0 = process.hrtime.bigint();
  files.forEach(file => {
    const rel = path.relative(siteDir, file);
    const html = fs.readFileSync(file, 'utf8');
    const res = processPage(html, cache.pages[rel]);
    cache.pages[rel] = res.entry;
    results[rel] = res.stats;
    if (!opts.dryRun && res.html !== html) fs.writeFileSync(file, res.html);
  });
  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;

  if (useCache && !opts.dryRun) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  }

  const saved = Object.values(results).reduce((t, s) => t + s.bytesBefore - s.bytesAfter, 0);
  const modes = Object.values(results).reduce((m, s) => ((m[s.mode] = (m[s.mode] || 0) + 1), m), {});
  if (!opts.quiet) {
    console.log('Combined classes on ' + files.length + ' pages: saved ' + saved + ' bytes in ' +
      totalMs.toFixed(0) + 'ms (' + Object.entries(modes).map(([k, v]) => v + ' ' + k).join(', ') + ')');
  }
  return { results, totalMs, saved };
}

module.exports = { run, processPage };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = name => args.includes(name);
  const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const res = run({
    siteDir: value('--site'),
    cachePath: value('--cache'),
    cache: !flag('--no-cache'),
    dryRun: flag('--dry-run'),
    only: value('--only'),
    quiet: flag('--quiet'),
  });
  if (flag('--json')) console.log(JSON.stringify(res, null, 2));
}
