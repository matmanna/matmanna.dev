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

  // 5. Strip unused utility classes from inline CSS
  // Collect all class names used in HTML
  const usedClasses = new Set();
  const classAttrRegex = /class="([^"]*)"/g;
  let cm;
  while ((cm = classAttrRegex.exec(html)) !== null) {
    cm[1].split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));
  }

  // Strip single-class utility rules where the class isn't used
  // Pattern: .className{...} or .dark\:className{...} or .sm\:className{...}
  const utilRegex = /\.([a-z][a-z0-9_-]*)\{[^}]*\}/g;
  let um;
  const toRemove = [];
  while ((um = utilRegex.exec(html)) !== null) {
    const fullMatch = um[0];
    const className = um[1];
    const matchStart = um.index;
    // Skip if it's a minified class (c0-c99) or prose class
    if (className.match(/^c\d+$/) || className === 'prose') continue;
    // Skip if it contains complex selectors (spaces, commas, >)
    if (className.includes(' ') || className.includes(',') || className.includes('>')) continue;
    // Skip if preceded by a comma (part of combined selector like .overflow-hidden,.truncate{...})
    if (matchStart > 0 && html[matchStart - 1] === ',') continue;
    // Check if class is used in HTML
    if (!usedClasses.has(className)) {
      // Also check dark: and responsive: variants
      const darkUsed = usedClasses.has('dark:' + className);
      const respUsed = ['sm:', 'md:', 'lg:', 'xl:', '2xl:'].some(p => usedClasses.has(p + className));
      if (!darkUsed && !respUsed) {
        toRemove.push(fullMatch);
      }
    }
  }
  // Also strip dark: variant rules
  const darkUtilRegex = /\.dark\\:([a-z][a-z0-9_-]*)\{[^}]*\}/g;
  while ((um = darkUtilRegex.exec(html)) !== null) {
    const fullMatch = um[0];
    const className = um[1];
    if (className.match(/^c\d+$/)) continue;
    if (!usedClasses.has('dark:' + className)) {
      toRemove.push(fullMatch);
    }
  }
  // Also strip responsive variant rules
  ['sm', 'md', 'lg', 'xl', '2xl'].forEach(prefix => {
    const respRegex = new RegExp('\\.' + prefix + '\\\\:([a-z][a-z0-9_-]*)\\{[^}]*\\}', 'g');
    while ((um = respRegex.exec(html)) !== null) {
      const fullMatch = um[0];
      const className = um[1];
      if (className.match(/^c\d+$/)) continue;
      if (!usedClasses.has(prefix + ':' + className)) {
        toRemove.push(fullMatch);
      }
    }
  });
  // Remove duplicates and strip
  [...new Set(toRemove)].forEach(rule => {
    html = html.replace(rule, '');
  });

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

  if (modified) fs.writeFileSync(filePath, html);
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
