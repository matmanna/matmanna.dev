#!/usr/bin/env node
// Post-build class minifier - updates BOTH HTML classes AND CSS

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function shouldSkip(c) {
  // Icons
  if (c.includes('fa-') || c.includes('icon-fa')) return true;
  if (c.startsWith('not-')) return true;
  // Border
  if (c.includes('border')) return true;
  // Widths
  if (c.startsWith('max-w-')) return true;
  // Responsive (sm:, md:, lg:, etc.) - complex to handle properly
  if (c.includes(':') && !c.startsWith('dark:')) return true;
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
  
  // Also create dark: mappings (e.g., dark:text-primary-300 → same cXX as text-primary-300)
  Object.keys(classMap).forEach(orig => {
    const darkVer = 'dark:' + orig;
    classMap[darkVer] = classMap[orig];
  });
  
  // Second pass: replace in HTML (including dark: variants)
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
      
      // Base: .class → .short
      let escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      escaped = escaped.replace(/-/g, '\\-');
      
      let regex = new RegExp('\\.' + escaped + '([{:, >~]+)', 'g');
      newStyle = newStyle.replace(regex, '.' + short + '$1');
      
      // Dark variant: .dark\:class → .short
      // CSS selector is .dark\:baseclass, regex needs \.dark\\:baseclass
      if (orig.startsWith('dark:')) {
        const baseClass = orig.slice(5);
        const baseEscaped = baseClass.replace(/-/g, '\\-');
        const darkPattern = '\\.dark\\\\:' + baseEscaped;
        const regex = new RegExp(darkPattern + '([{:, ])');
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