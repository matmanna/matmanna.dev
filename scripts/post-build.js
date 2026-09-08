#!/usr/bin/env node
// Post-build class minifier - updates BOTH HTML classes AND inline CSS

const fs = require('fs');
const path = require('path');

const classMap = {};
const varMap = {}; // CSS variable minification map
let idx = 0;
let varIdx = 0;

function shouldSkip(c) {
  // Icons
  if (c.includes('fa-') || c.includes('icon-fa')) return true;
  if (c.startsWith('not-')) return true;

  return false;
}

function getVarShortName(num) {
  // Map to --a, --b, --c, ... --z, --aa, --ab, etc.
  if (num < 26) return '--' + String.fromCharCode(97 + num); // a-z
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  num -= 26;
  result += letters[Math.floor(num / 26)];
  result += letters[num % 26];
  return '--' + result;
}

function stripPalette(html) {
  const before = html.length;

  // 1. Strip redundant ::backdrop reset (inherits from parent via *, :after, :before)
  html = html.replace(/::backdrop\{--tw-[^}]*\}/g, '');

  // 2. Strip unused --tw-* variable declarations from base reset
  // These are empty/whitespace defaults that no utility class references via var()
  const baseResetMatch = html.match(/\*,?:after,:before\{([^}]*)\}/);
  if (baseResetMatch) {
    const block = baseResetMatch[0];
    const decls = baseResetMatch[1].match(/--tw-[a-z0-9-]+:\s*[^;]+;/g) || [];
    // Find which --tw-* vars are referenced via var() anywhere in the HTML
    const restOfHTML = html.replace(block, '');
    const unused = decls.filter(d => {
      const varName = d.split(':')[0].trim();
      return !restOfHTML.includes('var(' + varName + ')');
    });
    if (unused.length > 0) {
      let newBlock = block;
      unused.forEach(d => { newBlock = newBlock.replace(d, ''); });
      // Clean up empty declarations and trailing semicolons
      newBlock = newBlock.replace(/;\s*;/g, ';').replace(/;\}/, '}');
      html = html.replace(block, newBlock);
      console.log('Stripped ' + unused.length + ' unused --tw-* variables');
    }
  }

  // 2. Strip dead prose rules (elements never used on the site)
  const deadElements = ['pre', 'blockquote', 'kbd', 'table', 'thead', 'tbody', 'tfoot', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'picture', 'video'];
  deadElements.forEach(el => {
    const regex = new RegExp('\\.prose :where\\([^)]*\\b' + el + '\\b[^)]*\\):not\\(:where\\(\\[class~=not-prose\\],\\[class~=not-prose\\] \\*\\)\\)\\{[^}]*\\}', 'g');
    html = html.replace(regex, '');
  });

  // 3. Strip @font-face (embedded Libertinus Mono — use system monospace instead)
  html = html.replace(/@font-face\{[^}]*src:url\([^)]*\)[^}]*\}/g, '');

  // 4. Strip unused prose variable declarations
  // Find the second .prose{ block (the one with --tw-prose-* variables)
  const proseVarBlock = html.match(/\.prose\{(--tw-prose[^}]*)\}/);
  if (proseVarBlock) {
    const block = proseVarBlock[0];
    const vars = proseVarBlock[1].match(/--[a-z-]+:[^;]+/g) || [];
    // Check which vars are used in remaining prose rules
    const restOfHTML = html.replace(block, '');
    const unused = vars.filter(v => {
      const varName = v.split(':')[0];
      return !restOfHTML.includes('var(' + varName + ')');
    });
    if (unused.length > 0) {
      let newBlock = block;
      unused.forEach(v => { newBlock = newBlock.replace(v + ';', ''); });
      html = html.replace(block, newBlock);
    }
  }

  if (html.length < before) {
    console.log('Palette optimized: ' + (before - html.length) + ' bytes');
  }
  return html;
}

function minifyInlineScripts(html) {
  // Minify inline script blocks (strip comments and excess whitespace)
  return html.replace(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi, (match, content) => {
    if (content.length < 50) return match; // Skip tiny scripts
    // Strip comments only when they occur outside JavaScript strings. A regex
    // for // would also match the protocol in URLs such as https://example.com.
    let withoutComments = '';
    let quote = null;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];

      if (quote) {
        withoutComments += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        withoutComments += char;
      } else if (char === '/' && next === '*') {
        const end = content.indexOf('*/', i + 2);
        i = end === -1 ? content.length : end + 1;
      } else if (char === '/' && next === '/') {
        const end = content.indexOf('\n', i + 2);
        i = end === -1 ? content.length : end - 1;
      } else {
        withoutComments += char;
      }
    }

    const minified = withoutComments
      .replace(/\s+/g, ' ') // collapse whitespace
      .replace(/\s*([{}();,])\s*/g, '$1') // remove space around punctuation
      .trim();
    return match.replace(content, minified);
  });
}

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Optimize palette CSS before class renaming (selectors still say .prose)
  html = stripPalette(html);

  // Minify inline scripts
  html = minifyInlineScripts(html);

  const matches = html.match(/class="[^"]+"/g) || [];

  // Collect --tw-* variables (first file only, or reset per file - using global map)
  const varMatches = html.match(/--tw-[a-z0-9-]*/g) || [];
  varMatches.forEach(v => {
    if (!varMap[v]) varMap[v] = getVarShortName(varIdx++);
  });

  // First pass: collect class mappings
  matches.forEach(m => {
    const arr = m.slice(7, -1).split(' ').filter(c => c);
    arr.forEach(c => {
      if (!shouldSkip(c) && !classMap[c]) classMap[c] = 'c' + idx++;
    });
  });

  // NOTE: do NOT alias dark:/responsive variants onto their base class token.
  // Sharing a token makes an element that carries the base class also match the
  // variant's CSS rule (equal specificity, source-order decides), and an aliased
  // `dark:` rule can sort AFTER an element's real dark variant — e.g. an element
  // with `text-primary-700 dark:text-primary-300` matches both
  // `.cX:where(.dark){#d6d3d1}` (real) and `.cY:where(.dark){#44403c}` (aliased
  // dark:text-primary-700) and keeps its light ink in dark. Every class —
  // including prefixed variants — gets its own unique index from the first pass.

  // Second pass: replace classes in HTML
  matches.forEach(m => {
    const arr = m.slice(7, -1).split(' ').filter(c => c);
    const newArr = arr.map(c => shouldSkip(c) ? c : classMap[c]);
    if (newArr.join(' ') !== arr.join(' ')) {
      html = html.replace(m, 'class="' + newArr.join(' ') + '"');
      modified = true;
    }
  });

  // Replace --tw-* variables in HTML and inline styles
  Object.entries(varMap).forEach(([orig, short]) => {
    const varRegex = new RegExp(orig.replace(/[-]/g, '\\-'), 'g');
    if (html.match(varRegex)) {
      html = html.replace(varRegex, short);
      modified = true;
    }
  });

  // Third pass: replace in ALL CSS
  Object.entries(classMap).forEach(([orig, short]) => {
    if (shouldSkip(orig)) return;

    // For regular classes: escape dashes, NOT brackets (CSS keeps them as-is)
    let escaped = orig.replace(/-/g, String.raw`\-`);

    // 1. Base class: .flex-row → .c6
    const basePattern = String.raw`\.` + escaped;
    const baseRegex = new RegExp(basePattern + '(?=[{:, >.])', 'g');
    html = html.replace(baseRegex, '.' + short);

    // 2. Dark variant: .dark\:flex-row → .c6  
    if (orig.startsWith('dark:')) {
      const baseClass = orig.slice(5);
      let baseEscaped = baseClass.replace(/-/g, String.raw`\-`);
      const darkPattern = String.raw`\.dark\\:` + baseEscaped;
      const darkRegex = new RegExp(darkPattern + '(?=[{:, >.])', 'g');
      html = html.replace(darkRegex, '.' + short);
    }

    // 3. Responsive variant
    if (orig.match(/^(sm|md|lg|xl|2xl):/)) {
      const baseClass = orig.replace(/^(sm|md|lg|xl|2xl):/, '');
      const prefix = orig.match(/^(sm|md|lg|xl|2xl):/)[1];
      const baseEscaped = baseClass.replace(/-/g, String.raw`\-`);

      const respPattern = String.raw`\.` + prefix + String.raw`\\:` + baseEscaped;
      const respRegex = new RegExp(respPattern + '(?=[{:, >.])', 'g');
      html = html.replace(respRegex, '.' + short);
    }

    // 4. Arbitrary value classes: w-[88px], max-w-[80ch], border-t-[6px]
    // In CSS: brackets are escaped as \[ and \], % is escaped as \%
    if (orig.includes('[')) {
      // Build the EXACT string as it appears in CSS
      // CSS has: max-w-\[85ch\]  (literal backslash before [ and ])
      // In regex, to match literal backslash + [, we need: \\\[
      // But in JS string, that's '\\\\[' (two backslashes in string = one in regex)
      const cssClass = orig.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]').replace(/%/g, '\\\\%');
      const arbiPattern = '.' + cssClass;
      const arbiRegex = new RegExp(arbiPattern + '(?=[{:, >.])', 'g');
      html = html.replace(arbiRegex, '.' + short);

      // Dark + arbitrary
      if (orig.startsWith('dark:')) {
        const baseClass = orig.slice(5);
        const cssClass2 = baseClass.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]').replace(/%/g, '\\\\%');
        const darkArbiPattern = '.dark\\\\:' + cssClass2;
        const darkArbiRegex = new RegExp(darkArbiPattern + '(?=[{:, >.])', 'g');
        html = html.replace(darkArbiRegex, '.' + short);
      }

      // Responsive + arbitrary
      if (orig.match(/^(sm|md|lg|xl|2xl):/)) {
        const baseClass = orig.replace(/^(sm|md|lg|xl|2xl):/, '');
        const prefix = orig.match(/^(sm|md|lg|xl|2xl):/)[1];
        const cssClass2 = baseClass.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]').replace(/%/g, '\\\\%');
        const respArbiPattern = '.' + prefix + '\\\\:' + cssClass2;
        const respArbiRegex = new RegExp(respArbiPattern + '(?=[{:, >.])', 'g');
        html = html.replace(respArbiRegex, '.' + short);
      }
    }
  });

  // Fourth pass: handle CSS selectors with no- prefix classes
  // e.g., a:not(.no-external-icon) → a:not(.cXX)
  // e.g., a[data-no-external-icon] → a[data-cXX]
  Object.entries(classMap).forEach(([orig, short]) => {
    if (orig.startsWith('no-')) {
      // Replace .no-external-icon in CSS selectors
      const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const selectorRegex = new RegExp('\\.' + escaped + '(?=[^a-zA-Z0-9]|$)', 'g');
      html = html.replace(selectorRegex, '.' + short);

      // Also replace data-no-external-icon in attribute selectors: [data-no-external-icon] → [data-cXX]
      const attrRegex = new RegExp('\\[data-' + escaped + '\\]', 'g');
      html = html.replace(attrRegex, '[data-' + short + ']');

      // And data-no-external-icon="..." in HTML: data-no-external-icon="..." → data-cXX="..."
      const htmlAttrRegex = new RegExp('data-' + escaped + '=', 'g');
      html = html.replace(htmlAttrRegex, 'data-' + short + '=');
    }
  });

  // 5. Class-combination merging runs as a separate global pass (combineClassesAcrossSite)
  // at the end of the script, after every file is minified.

  if (modified) fs.writeFileSync(filePath, html);
}

// ===========================================================================
// Global class-combination merging.
//
// Runs after per-file minification. The minifier has already produced short
// per-class tokens (cN) and minified the inline CSS. Many pages repeat the same
// *combination* of classes (cards, pills, nav rows). We:
//   1. Mine frequent contiguous combinations of plain .cN{} utility tokens
//      (2..6 classes) across every page's class="..." attribute.
//   2. For each candidate compute the byte economics per page:
//      replacing  k tokens (length L) with one qN token saves (L - qLen) per
//      occurrence, at the cost of one appended `.qN{decls}` rule per page that
//      uses it. Only apply groups whose per-page net is positive.
//   3. Rewrite those occurrences to the qN token, append the merged rule to the
//      page's CSS, and delete the now-unused plain `.cN{...}` member rules.
//
// Safety gates (the reasons the old pair-based pass regressed):
//   - Only tokens whose CSS rule is exactly a plain `.cN{...}` (single selector,
//     top-level, not inside @media, not referenced by any other selector such as
//     :hover, .dark  , dark:, or .cN :where(descendant) prose selectors) may
//     participate. Variant classes now get their own distinct cN token (the
//     minifier no longer aliases dark:/responsive onto the base token), so
//     merging a base utility never duplicates a variant rule.
//   - Members must not repeat the same property (order-ambiguous union).
//   - Per occurrence, a merged group is skipped if any OTHER surviving class on
//     that element declares a property also declared by a member — injecting the
//     merged rule after the plain rules would otherwise change the cascade
//     winner for that element.
//   - A member rule is only deleted when the token is fully unused on the page
//     AND its declaration declares no CSS variables (vars like --ba/--bd are
//     referenced cross-token by other rules, e.g. color/bg tokens).
// ===========================================================================

function combineClassesAcrossSite() {
  const files = [];
  (function collect(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) collect(full);
      else if (name.endsWith('.html')) files.push(full);
    });
  })('_site');

  if (files.length === 0) return null;

  // ---- Global CSS facts ----
  const plainDecl = new Map();   // token -> rule decl (identical everywhere -> else AMBIG)
  const inSelector = new Set();  // token referenced by a compound/descendant selector
  const inMedia = new Set();     // token's .cN{} rule lives inside @media
  const pageHtml = new Map();    // file -> { html, css }

  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    pageHtml.set(f, { html, css });

    const re = /\.c\d{1,4}\{[^}]*\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      const before = css.slice(0, m.index);
      let depth = 0;
      for (const ch of before) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (depth === 0) {
        const bb = css.indexOf('{', m.index);
        const tok = css.slice(m.index + 1, bb);
        const decl = css.slice(bb + 1, css.indexOf('}', bb));
        if (!plainDecl.has(tok)) plainDecl.set(tok, decl);
        else if (plainDecl.get(tok) !== decl) plainDecl.set(tok, '(AMBIG)');
      } else {
        // rule sits inside @media or another nested block — variant context, not mergeable
        inMedia.add(m[0].slice(1, m[0].indexOf('{')));
      }
    }

    const selRe = /([^}]*)\{/g;
    let sm;
    while ((sm = selRe.exec(css)) !== null) {
      const sel = sm[1].trim();
      const toks = sel.match(/\.c\d{1,4}/g);
      if (toks && !/^\.c\d{1,4}$/.test(sel)) toks.forEach(t => inSelector.add(t.slice(1)));
    }
  }

  // ---- Tokenize class attributes ----
  const pageAttrs = new Map(); // file -> [{ start, end, raw, toks }]
  for (const f of files) {
    const { html } = pageHtml.get(f);
    const attrs = [];
    for (const m of html.matchAll(/class="([^"]+)"/g)) attrs.push({ start: m.index, end: m.index + m[0].length, raw: m[1], toks: m[1].split(/\s+/).filter(Boolean) });
    pageAttrs.set(f, attrs);
  }

  const mergeable = t => /^c\d{1,4}$/.test(t) && plainDecl.has(t) && plainDecl.get(t) !== '(AMBIG)' && !inSelector.has(t) && !inMedia.has(t);

  // ---- Enumerate candidate groups (contiguous mergeable runs, len 2..6) ----
  const seqCount = new Map();
  const MAXLEN = 6, MIN_COUNT = 3;
  for (const attrs of pageAttrs.values()) {
    for (const a of attrs) {
      let runs = [], cur = [];
      for (const t of a.toks) { if (mergeable(t)) cur.push(t); else { if (cur.length) runs.push(cur); cur = []; } }
      if (cur.length) runs.push(cur);
      for (const run of runs) {
        for (let len = 2; len <= Math.min(MAXLEN, run.length); len++) {
          for (let s = 0; s + len <= run.length; s++) {
            const seq = run.slice(s, s + len).join(' ');
            if (!seqCount.has(len)) seqCount.set(len, new Map());
            const mm = seqCount.get(len); mm.set(seq, (mm.get(seq) || 0) + 1);
          }
        }
      }
    }
  }

  const groups = [];
  for (const [len, mm] of seqCount) {
    for (const [seq, count] of mm) {
      if (count < MIN_COUNT) continue;
      const toks = seq.split(' ');
      if (!toks.every(mergeable)) continue;
      const decls = toks.map(t => plainDecl.get(t));
      const props = new Set();
      let conflict = false;
      for (const d of decls) for (const pd of d.split(';')) {
        const p = pd.split(':')[0];
        if (props.has(p)) { conflict = true; break; }
        props.add(p);
      }
      if (conflict) continue;
      const attrCost = toks.reduce((a, t) => a + t.length, 0) + (toks.length - 1);
      groups.push({ seq, toks, count, decls, attrCost });
    }
  }

  function pageCounts(toks) {
    const need = toks.length;
    const pc = new Map();
    for (const [f, attrs] of pageAttrs) {
      let c = 0;
      for (const a of attrs) for (let i = 0; i + need <= a.toks.length; i++)
        if (a.toks.slice(i, i + need).join(' ') === toks.join(' ')) { c++; break; }
      if (c) pc.set(f, c);
    }
    return pc;
  }
  for (const g of groups) g.pc = pageCounts(g.toks);

  const propsOf = decl => {
    const out = new Map();
    for (const pd of decl.split(';')) {
      const i = pd.indexOf(':');
      if (i >= 0) out.set(pd.slice(0, i), pd.slice(i + 1));
    }
    return out;
  };
  function overlapsSurvivor(attrToks, i, need, memberProps) {
    for (let k = 0; k < attrToks.length; k++) {
      if (k >= i && k < i + need) continue;
      const t = attrToks[k];
      if (!/^c\d{1,4}$/.test(t)) continue;
      const d = plainDecl.get(t);
      if (!d || d === '(AMBIG)') continue;
      for (const p of propsOf(d).keys()) if (memberProps.has(p)) return true;
    }
    return false;
  }

  // ---- Greedy apply ----
  const reverseMap = new Map();
  Object.entries(classMap).forEach(([raw, tok]) => reverseMap.set(tok, raw));

  let qIdx = 0;
  const appliedInfo = [];        // group report
  const usedQPerFile = new Map();// file -> Set(qN)
  let attrSaved = 0;
  let ruleAdded = 0;

  for (let iter = 0; iter < 400; iter++) {
    const qLen = 2 + (qIdx >= 10 ? 1 : 0);
    let best = null, bestNet = 0;
    for (const g of groups) {
      const ruleLen = g.decls.join(';').length + 3 + qLen;
      let net = 0;
      for (const occ of g.pc.values()) { const s = (g.attrCost - qLen) * occ - ruleLen; if (s > 0) net += s; }
      if (net > bestNet) { bestNet = net; best = g; }
    }
    if (!best || bestNet <= 0) break;

    const qName = 'q' + qIdx++;
    const len = qName.length;
    const ruleLen = best.decls.join(';').length + 3 + len;
    const memberProps = new Set();
    for (const d of best.decls) for (const p of propsOf(d).keys()) memberProps.add(p);
    const need = best.toks.length;

    for (const [f, occ] of best.pc) {
      if ((best.attrCost - len) * occ - ruleLen <= 0) continue;
      const attrs = pageAttrs.get(f);
      let appliedHere = false;
      for (const a of attrs) {
        for (let i = 0; i + need <= a.toks.length; i++) {
          if (a.toks.slice(i, i + need).join(' ') === best.seq) {
            if (overlapsSurvivor(a.toks, i, need, memberProps)) break;
            attrSaved += best.attrCost - len;
            a.toks.splice(i, need, qName);
            appliedHere = true;
            break;
          }
        }
      }
      if (appliedHere) {
        ruleAdded += ruleLen;
        if (!usedQPerFile.has(f)) usedQPerFile.set(f, new Set());
        usedQPerFile.get(f).add(qName);
      }
    }
    appliedInfo.push({ qName, seq: best.seq, toks: best.toks, count: best.count, decl: best.decls.join(';'), raw: best.toks.map(t => reverseMap.get(t) || t).join(' ') });
    groups.splice(groups.indexOf(best), 1);
  }

  // ---- Rebuild pages: rewrite attrs, delete dead member rules, append qN rules ----
  let deadRemoved = 0;
  const skipDead = process.env.COMPOSE_SKIP_DEAD === '1';
  const skipMerge = process.env.COMPOSE_SKIP_MERGE === '1';
  let afterBytes = 0;
  let beforeBytes = 0;

  for (const f of files) {
    const { html } = pageHtml.get(f);
    beforeBytes += Buffer.byteLength(html, 'utf8');

    let out = html;
    const attrs = pageAttrs.get(f);
    // rewrite from the end so earlier offsets stay valid
    if (!skipMerge) {
      for (let i = attrs.length - 1; i >= 0; i--) {
        const a = attrs[i];
        const newStr = a.toks.join(' ');
        if (newStr !== a.raw) out = out.slice(0, a.start + 7) + newStr + out.slice(a.end - 1);
      }
    }

    // append merged rules used by this page at their members' original slot so the
    // original cascade order (incl. responsive @media variants) is preserved
    const qs = usedQPerFile.get(f);
    if (qs && qs.size) {
      const toAdd = [];
      for (const ai of appliedInfo) {
        if (!qs.has(ai.qName)) continue;
        let pos = -1;
        for (const m of ai.toks) {
          const rule = '.' + m + '{' + plainDecl.get(m) + '}';
          const p = out.indexOf(rule);
          if (p >= 0 && (pos < 0 || p < pos)) pos = p;
        }
        if (pos < 0) continue;
        toAdd.push({ pos, rule: '.' + ai.qName + '{' + ai.decl + '}' });
      }
      toAdd.sort((x, y) => y.pos - x.pos);
      for (const { pos, rule } of toAdd) out = out.slice(0, pos) + rule + out.slice(pos);
    }

    // which cN tokens are still used on this page (for dead-rule removal)
    const used = new Set();
    for (const a of attrs) for (const t of a.toks) if (/^c\d{1,4}$/.test(t)) used.add(t);

    // delete plain rules of fully-unused, var-free mergeable tokens
    if (!skipDead) {
      for (const [tok, decl] of plainDecl) {
        if (used.has(tok) || !mergeable(tok)) continue;
        if (/--[a-z0-9]+:/.test(decl)) continue; // declares a CSS var (cross-token refs)
        const rule = '.' + tok + '{' + decl + '}';
        if (out.includes(rule)) {
          const lenBefore = out.length;
          out = out.split(rule).join('');
          deadRemoved += lenBefore - out.length;
        }
      }
    }

    afterBytes += Buffer.byteLength(out, 'utf8');
    if (out !== html) fs.writeFileSync(f, out);
  }

  const net = afterBytes - beforeBytes;
  return {
    files: files.length,
    beforeBytes,
    afterBytes,
    net,
    attrSaved,
    ruleAdded,
    deadRemoved,
    groups: appliedInfo.length,
    hist: appliedInfo.reduce((h, a) => { const n = a.seq.split(' ').length; h[n] = (h[n] || 0) + 1; return h; }, {}),
    top: appliedInfo.slice(0, 8),
  };
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkDir(full);
    else if (name.endsWith('.html')) processFile(full);
  });
}

// Also update tailwind.css with minified class names and CSS variables
function updateCSS(filePath) {
  if (!fs.existsSync(filePath)) return;
  let css = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // The inline page CSS already drops this embedded font in stripPalette().
  // Remove it from the copied stylesheet too; the site uses system monospace.
  const withoutEmbeddedFonts = css.replace(/@font-face\s*\{[\s\S]*?\}\s*/g, '');
  if (withoutEmbeddedFonts !== css) {
    css = withoutEmbeddedFonts;
    modified = true;
  }

  // Replace --tw-* variables in CSS
  Object.entries(varMap).forEach(([orig, short]) => {
    const varRegex = new RegExp(orig.replace(/[-]/g, '\\-'), 'g');
    if (css.match(varRegex)) {
      css = css.replace(varRegex, short);
      modified = true;
    }
  });

  // Replace ALL class names in CSS selectors
  Object.entries(classMap).forEach(([orig, short]) => {
    if (shouldSkip(orig)) return;

    let escaped = orig.replace(/-/g, String.raw`\-`);

    // 1. Base class in selectors: .flex-row → .c6
    const selectorRegex = new RegExp('\\.' + escaped + '(?=[^a-zA-Z0-9\\-]|$)', 'g');
    if (css.match(selectorRegex)) {
      css = css.replace(selectorRegex, '.' + short);
      modified = true;
    }

    // 2. Dark variant: .dark\:flex-row → .c6
    if (orig.startsWith('dark:')) {
      const baseClass = orig.slice(5);
      let baseEscaped = baseClass.replace(/-/g, String.raw`\-`);
      const darkPattern = String.raw`\.dark\\:` + baseEscaped;
      const darkRegex = new RegExp(darkPattern + '(?=[^a-zA-Z0-9\\-]|$)', 'g');
      if (css.match(darkRegex)) {
        css = css.replace(darkRegex, '.' + short);
        modified = true;
      }
    }

    // 3. Responsive variant: .md\:flex-row → .c6
    if (orig.match(/^(sm|md|lg|xl|2xl):/)) {
      const baseClass = orig.replace(/^(sm|md|lg|xl|2xl):/, '');
      const prefix = orig.match(/^(sm|md|lg|xl|2xl):/)[1];
      const baseEscaped = baseClass.replace(/-/g, String.raw`\-`);
      const respPattern = String.raw`\.` + prefix + String.raw`\\:` + baseEscaped;
      const respRegex = new RegExp(respPattern + '(?=[^a-zA-Z0-9\\-]|$)', 'g');
      if (css.match(respRegex)) {
        css = css.replace(respRegex, '.' + short);
        modified = true;
      }
    }

    // 4. Arbitrary value classes: .w-[88px] → .c5
    if (orig.includes('[')) {
      const cssClass = orig.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]').replace(/%/g, '\\\\%');
      const arbiPattern = '.' + cssClass;
      const arbiRegex = new RegExp(arbiPattern + '(?=[^a-zA-Z0-9\\-]|$)', 'g');
      if (css.match(arbiRegex)) {
        css = css.replace(arbiRegex, '.' + short);
        modified = true;
      }
    }
  });

  if (modified) fs.writeFileSync(filePath, css);
}

function ensureUtf8Meta() {
  // Guarantee a <meta charset="utf-8"> within the first 1024 bytes of every page.
  // Plugins can prepend a <head>/<style> before the doctype (e.g. GFM admonitions
  // CSS), pushing the real meta tag past the browser encoding-sniff window, which
  // makes UAs fall back to windows-1252 and mangle UTF-8 smart punctuation.
  const files = [];
  (function collect(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(name => {
      const f = path.join(dir, name);
      const s = fs.statSync(f);
      if (s.isDirectory()) collect(f);
      else if (name.endsWith('.html')) files.push(f);
    });
  })('_site');

  for (const f of files) {
    const b = fs.readFileSync(f);
    const prefix = b.subarray(0, 1024).toString('latin1');
    if (/charset\s*=/.test(prefix)) continue;
    let out = b.toString('utf8');
    const headTag = out.match(/<head[\s>]/);
    const meta = '<meta charset="utf-8">';
    if (headTag) {
      const close = out.indexOf('>', headTag.index);
      out = out.slice(0, close + 1) + meta + out.slice(close + 1);
    } else {
      out = meta + out;
    }
    fs.writeFileSync(f, out);
  }
}

walkDir('_site');
updateCSS('_site/assets/css/tailwind.css');
console.log('Minified ' + idx + ' classes, ' + varIdx + ' CSS variables');

const comboStats = process.env.COMPOSE_OFF === '1' ? null : combineClassesAcrossSite();
if (comboStats && comboStats.groups > 0) {
  const histTxt = Object.entries(comboStats.hist).map(([k, v]) => k + '-class: ' + v).join(', ');
  console.log('Combined classes: ' + comboStats.groups + ' groups (' + histTxt + ')');
  console.log('  character delta: ' + (comboStats.attrSaved - comboStats.ruleAdded) + ' bytes from attrs&rules (' +
    comboStats.attrSaved + ' attr savings, +' + comboStats.ruleAdded + ' merged rules)');
  console.log('  removed ' + comboStats.deadRemoved + ' bytes of dead member rules');
  console.log('  NET: ' + comboStats.net + ' bytes across ' + comboStats.files + ' pages (' +
    (comboStats.net / comboStats.beforeBytes * 100).toFixed(2) + '%)');
  console.log('  top groups by occurrence:');
  comboStats.top.forEach(g => console.log('    ' + g.qName + ' [' + g.raw + '] x' + g.count + ' decl(' + g.decl.length + ')'));
}
