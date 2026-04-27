#!/usr/bin/env node
// Post-build class minifier - updates BOTH HTML classes AND CSS

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function shouldSkip(c) {
  // Icons - MUST skip
  if (c.includes('fa-') || c.includes('icon-fa') || c.includes('icon-fa')) return true;
  if (c.startsWith('not-')) return true;
    if (c.includes('border')) return true;
  // Dark mode variants won't work without complex CSS mapping
  if (c.startsWith('dark:') || c.includes(":")) return true;
  // Max/min widths
  if (c.startsWith('max-w-') ) return true;
  return false;
}

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  const matches = html.match(/class="[^"]+"/g) || [];
  
  // First pass: collect mappings
  matches.forEach(m => {
    const arr = m.slice(7, -1).split(' ').filter(c => c);
    arr.forEach(c => {
      if (!shouldSkip(c) && !classMap[c]) classMap[c] = 'c' + idx++;
    });
  });
  
  // Second pass: replace in HTML
  matches.forEach(m => {
    const arr = m.slice(7, -1).split(' ').filter(c => c);
    const newArr = arr.map(c => shouldSkip(c) ? c : classMap[c]);
    if (newArr.join(' ') !== arr.join(' ')) {
      html = html.replace(m, 'class="' + newArr.join(' ') + '"');
      modified = true;
    }
  });
  
  // Third pass: replace in ALL CSS blocks 
  const styleMatches = html.match(/<style>([\s\S]*?)<\/style>/g) || [];
  styleMatches.forEach((styleBlock, styleIdx) => {
    let newStyle = styleBlock;
    Object.entries(classMap).forEach(([orig, short]) => {
      if (shouldSkip(orig)) return;
      
      let escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      escaped = escaped.replace(/-/g, '\\-');
      
      let regex = new RegExp('\\.' + escaped + '([{:, >~]+)', 'g');
      newStyle = newStyle.replace(regex, '.' + short + '$1');
      
      if (orig.includes(':')) {
        const colonEscaped = escaped.split(':').join('\\:');
        regex = new RegExp('\\.' + colonEscaped + '([{:, >~]+)', 'g');
        newStyle = newStyle.replace(regex, '.' + short + '$1');
      }
    });
    
    if (newStyle !== styleBlock) {
      html = html.replace(styleBlock, newStyle);
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
console.log('Minified ' + idx + ' classes');