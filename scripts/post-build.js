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
    const minified = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
      .replace(/\/\/[^\n]*/g, '') // strip line comments
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

  // Also create dark: mappings (e.g., dark:text-primary-300 → same cXX as text-primary-300)
  Object.keys(classMap).forEach(orig => {
    const darkVer = 'dark:' + orig;
    classMap[darkVer] = classMap[orig];
  });

  // Also create responsive mappings (sm:, md:, lg: → same cXX as base)
  ['sm:', 'md:', 'lg:', 'xl:', '2xl:'].forEach(prefix => {
    Object.keys(classMap).forEach(orig => {
      if (!orig.includes(':') && classMap[orig]) {
        const respVer = prefix + orig;
        classMap[respVer] = classMap[orig];
      }
    });
  });

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
    const baseRegex = new RegExp(basePattern + '(?=[{:, >])', 'g');
    html = html.replace(baseRegex, '.' + short);

    // 2. Dark variant: .dark\:flex-row → .c6  
    if (orig.startsWith('dark:')) {
      const baseClass = orig.slice(5);
      let baseEscaped = baseClass.replace(/-/g, String.raw`\-`);
      const darkPattern = String.raw`\.dark\\:` + baseEscaped;
      const darkRegex = new RegExp(darkPattern + '(?=[{:, >])', 'g');
      html = html.replace(darkRegex, '.' + short);
    }

    // 3. Responsive variant
    if (orig.match(/^(sm|md|lg|xl|2xl):/)) {
      const baseClass = orig.replace(/^(sm|md|lg|xl|2xl):/, '');
      const prefix = orig.match(/^(sm|md|lg|xl|2xl):/)[1];
      const baseEscaped = baseClass.replace(/-/g, String.raw`\-`);

      const respPattern = String.raw`\.` + prefix + String.raw`\\:` + baseEscaped;
      const respRegex = new RegExp(respPattern + '(?=[{:, >])', 'g');
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
      const arbiRegex = new RegExp(arbiPattern + '(?=[{:, >])', 'g');
      html = html.replace(arbiRegex, '.' + short);

      // Dark + arbitrary
      if (orig.startsWith('dark:')) {
        const baseClass = orig.slice(5);
        const cssClass2 = baseClass.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]').replace(/%/g, '\\\\%');
        const darkArbiPattern = '.dark\\\\:' + cssClass2;
        const darkArbiRegex = new RegExp(darkArbiPattern + '(?=[{:, >])', 'g');
        html = html.replace(darkArbiRegex, '.' + short);
      }

      // Responsive + arbitrary
      if (orig.match(/^(sm|md|lg|xl|2xl):/)) {
        const baseClass = orig.replace(/^(sm|md|lg|xl|2xl):/, '');
        const prefix = orig.match(/^(sm|md|lg|xl|2xl):/)[1];
        const cssClass2 = baseClass.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]').replace(/%/g, '\\\\%');
        const respArbiPattern = '.' + prefix + '\\\\:' + cssClass2;
        const respArbiRegex = new RegExp(respArbiPattern + '(?=[{:, >])', 'g');
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

  // 5. Combine frequent class pairs (disabled — too many regressions from dark mode and responsive conflicts)
  // html = combineClasses(html);

  if (modified) fs.writeFileSync(filePath, html);
}

function combineClasses(html) {
  // Find all class="..." attributes and their class lists
  const classAttrRegex = /class="([^"]*)"/g;
  const pairCounts = {};
  const allClasses = new Set();
  let cm;
  while ((cm = classAttrRegex.exec(html)) !== null) {
    const classes = cm[1].split(/\s+/).filter(c => c && !c.startsWith('dark:') && !c.match(/^(sm|md|lg|xl|2xl):/) && !c.startsWith('not-'));
    classes.forEach(c => allClasses.add(c));
    // Count pairs
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const pair = [classes[i], classes[j]].sort().join(' ');
        pairCounts[pair] = (pairCounts[pair] || 0) + 1;
      }
    }
  }

  // Find classes that have responsive or dark mode variants
  const responsiveClasses = new Set();
  const darkClasses = new Set();
  ['sm:', 'md:', 'lg:', 'xl:', '2xl:'].forEach(prefix => {
    allClasses.forEach(c => {
      if (allClasses.has(prefix + c)) responsiveClasses.add(c);
    });
  });
  allClasses.forEach(c => {
    if (allClasses.has('dark:' + c)) darkClasses.add(c);
  });

  // Find the CSS rule for a class by searching the inline CSS
  function getCSSRule(className) {
    const escaped = className.replace(/[-]/g, '\\-');
    const regex = new RegExp('\\.' + escaped + '\\{([^}]*)\\}');
    const match = html.match(regex);
    return match ? match[1] : null;
  }

  // Find pairs that would save bytes
  const candidates = [];
  Object.entries(pairCounts).forEach(([pair, count]) => {
    if (count < 3) return;
    const [a, b] = pair.split(' ');
    // Skip pairs where either class has a responsive or dark mode variant
    if (responsiveClasses.has(a) || responsiveClasses.has(b)) return;
    if (darkClasses.has(a) || darkClasses.has(b)) return;
    const ruleA = getCSSRule(a);
    const ruleB = getCSSRule(b);
    if (!ruleA || !ruleB) return;
    // Skip pairs that set flex-direction (conflicts with sm:flex-row responsive)
    if (ruleA.includes('flex-direction') || ruleB.includes('flex-direction')) return;

    const originalPerOccurrence = a.length + 1 + b.length;
    const combinedPerOccurrence = 2;
    const ruleCost = 2 + 2 + ruleA.length + ruleB.length + 1;
    const savedPerOccurrence = originalPerOccurrence - combinedPerOccurrence;
    const totalSaved = savedPerOccurrence * count - ruleCost;

    if (totalSaved > 0) {
      candidates.push({ pair, a, b, ruleA, ruleB, count, totalSaved });
    }
  });

  candidates.sort((a, b) => b.totalSaved - a.totalSaved);

  let combinedIdx = 0;
  let applied = 0;
  for (const cand of candidates) {
    if (applied >= 10) break;

    const combinedName = 'q' + combinedIdx;
    combinedIdx++;

    const combinedRule = '.' + combinedName + '{' + cand.ruleA + ';' + cand.ruleB + '}';
    const escA = cand.a.replace(/[-]/g, '\\-');
    const escB = cand.b.replace(/[-]/g, '\\-');
    const pairRegex = new RegExp('\\b' + escA + '\\s+' + escB + '\\b', 'g');
    const pairRegexReverse = new RegExp('\\b' + escB + '\\s+' + escA + '\\b', 'g');

    const before = html.length;
    html = html.replace(pairRegex, combinedName);
    html = html.replace(pairRegexReverse, combinedName);

    if (html.length < before) {
      const firstStyleEnd = html.indexOf('</style>');
      if (firstStyleEnd >= 0) {
        html = html.substring(0, firstStyleEnd) + combinedRule + html.substring(firstStyleEnd);
      }
      applied++;
      console.log('Combined "' + cand.pair + '" -> .' + combinedName + ' (saved ' + cand.totalSaved + ' bytes, ' + cand.count + ' occurrences)');
    }
  }

  return html;
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

walkDir('_site');
updateCSS('_site/assets/css/tailwind.css');
console.log('Minified ' + idx + ' classes, ' + varIdx + ' CSS variables');
