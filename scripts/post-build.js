#!/usr/bin/env node
// Post-build class minifier - skips layout-critical + nomin-marked elements

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function shouldSkip(c) {
  // Icon/fa
  if (c.startsWith('fa-') || c.includes('icon-fa')) return true;
  if (c.startsWith('not-prose')) return true;
  // no- prefixes
  if (c.startsWith('no-')) return true;
  // Variants (dark:, md:, etc.)
  if (c.includes(':')) return true;
  // Arbitrary values  
  if (c.includes('[')) return true;
  // All flexbox
  if (c.startsWith('flex') || c.startsWith('items-') || c.startsWith('justify-') || c.startsWith('self-')) return true;
  // Spacing
  if (c.startsWith('gap-')) return true;
  if (c.match(/^[mp](?:-|$|x|y|t|b|l|r)/)) return true;
  // Widths/heights
  if (c.startsWith('w-') || c.startsWith('h-') || c.startsWith('max-') || c.startsWith('min-')) return true;
  // Border/radius
  if (c.startsWith('border') || c.startsWith('rounded')) return true;
  // Images
  if (c.startsWith('object-')) return true;
  if (c.startsWith('space-')) return true;
  // Font
  if (c.startsWith('font-')) return true;
  // nowrap 
  if (c.startsWith('text-nowrap')) return true;
  if (c.startsWith('inline')) return true;
  if (c.startsWith('text-xs') || c.startsWith('text-sm')) return true;
  if (c.startsWith('bg-transparent')) return true;
  if (c.startsWith('block')) return true;

  return false;
}

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  const matches = html.match(/class="[^"]+"/g) || [];
  
  // First pass: collect mappings
  matches.forEach(m => {
    const fullClassAttr = m.slice(7, -1);
    if (fullClassAttr.includes('nomin')) return;
    const classArr = fullClassAttr.split(' ').filter(c => c);
    classArr.forEach(c => {
      if (shouldSkip(c)) return;
      if (!classMap[c]) classMap[c] = 'c' + idx++;
    });
  });
  
  // Second pass: replace
  matches.forEach(m => {
    const fullClassAttr = m.slice(7, -1);
    if (fullClassAttr.includes('nomin')) return;
    const classArr = fullClassAttr.split(' ').filter(c => c);
    const newArr = classArr.map(c => shouldSkip(c) ? c : classMap[c]);
    const newClassAttr = newArr.join(' ');
    if (newClassAttr !== fullClassAttr) {
      html = html.replace(m, 'class="' + newClassAttr + '"');
      modified = true;
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

walkDir('_site');
console.log(`Minified ${Object.keys(classMap).length} classes`);