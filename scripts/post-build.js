#!/usr/bin/env node
// Post-build class minifier - updates BOTH HTML classes AND CSS

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function shouldSkip(c) {
  if (c.includes('fa-') || c.includes('icon-fa')) return true;
  if (c.startsWith('no-') || c.startsWith('not-')) return true;
  if (c.includes(':') || c.includes('[')) return true;
  // if (c.startsWith('flex') || c.startsWith('items-') || c.startsWith('justify-') || c.startsWith('self-')) return true;
  // if (c.startsWith('gap-') || c.startsWith('space-')) return true;
  // if (c.match(/^[mp](?:-|$|x|y|t|b|l|r)/)) return true;
  // if (c.startsWith('w-') || c.startsWith('h-')) return true;
  // if (c.startsWith('max-') || c.startsWith('min-')) return true;
  if (c.startsWith('border') || c.startsWith('rounded')) return true;
  // if (c.startsWith('object-')) return true;
  if (c.startsWith('font-')) return true;
  // if (c.startsWith('text-xs') || c.startsWith('text-sm') || c.startsWith('text-')) return true;
  // if (c.startsWith('inline') || c.startsWith('block')) return true;
  // if (c.startsWith('bg-')) return true;
  // if (c.startsWith('top-') || c.startsWith('bottom-') || c.startsWith('left-') || c.startsWith('right-')) return true;
  return false;
}

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  const matches = html.match(/class="[^"]+"/g) || [];
  
  // First pass: collect mappings
  matches.forEach(m => {
    const arr = m.slice(7, -1).split(' ').filter(c => c);
    // if (arr.includes('nomin')) return;
    arr.forEach(c => {
      if (!shouldSkip(c) && !classMap[c]) classMap[c] = 'c' + idx++;
    });
  });
  
  // Second pass: replace in HTML
  matches.forEach(m => {
    const arr = m.slice(7, -1).split(' ').filter(c => c);
    // if (arr.includes('nomin')) return;
    const newArr = arr.map(c => shouldSkip(c) ? c : classMap[c]);
    if (newArr.join(' ') !== arr.join(' ')) {
      html = html.replace(m, 'class="' + newArr.join(' ') + '"');
      modified = true;
    }
  });
  
  // Third pass: replace in CSS
  const styleMatches = html.match(/<style>([\s\S]*?)<\/style>/g) || [];
  if (styleMatches[0]) {
    let newStyle = styleMatches[0];
    Object.entries(classMap).forEach(([orig, short]) => {
      if (shouldSkip(orig)) return;
      // Escape special regex chars, replace - with \-
      const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '\\-');
      const regex = new RegExp('\\.' + escaped + '([{:, >~]+)', 'g');
      newStyle = newStyle.replace(regex, '.' + short + '$1');
    });
    if (newStyle !== styleMatches[0]) {
      html = html.replace(styleMatches[0], newStyle);
      modified = true;
    }
  }
  
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

walkDir('_site');
console.log('Minified ' + idx + ' classes');