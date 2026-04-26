#!/usr/bin/env node
// Post-build class minifier - updates BOTH HTML classes AND CSS

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function shouldSkip(c) {
  // Icons - MUST skip
  if (c.includes('fa-') || c.includes('icon-fa')) return true;
  if (c.startsWith('no-') || c.startsWith('not-')) return true;
  if (c.includes(':') || c.includes('[')) return true;

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
  
  // Third pass: replace in CSS (handle : and [)  
  const styleMatches = html.match(/<style>([\s\S]*?)<\/style>/g) || [];
  if (styleMatches[0]) {
    let newStyle = styleMatches[0];
    Object.entries(classMap).forEach(([orig, short]) => {
      if (shouldSkip(orig)) return;
      
      // Base escape
      let escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Escape dashes
      escaped = escaped.replace(/-/g, '\\-');
      
      // Pattern 1: normal .class
      let regex = new RegExp('\\.' + escaped + '([{:, >~]+)', 'g');
      newStyle = newStyle.replace(regex, '.' + short + '$1');
      
      // Pattern 2: escaped colon (for dark:text etc)
      if (orig.includes(':')) {
        // Replace each : with \\: in the escaped string
        const colonEscaped = escaped.split(':').join('\\:');
        const regex = new RegExp('\\.' + colonEscaped + '([{:, >~]+)', 'g');
        newStyle = newStyle.replace(regex, '.' + short + '$1');
      }
      
      // Pattern 3: escaped brackets (for w-[88px])
      if (orig.includes('[')) {
        const bracketEscaped = orig.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
        regex = new RegExp('\\.' + bracketEscaped + '([{:, >~]+)', 'g');
        newStyle = newStyle.replace(regex, '.' + short + '$1');
      }
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