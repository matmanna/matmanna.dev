#!/usr/bin/env node
// Post-build class minifier - updates BOTH HTML classes AND inline CSS

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
  
  // Also create responsive mappings (sm:, md:, lg: → same cXX as base)
  ['sm:', 'md:', 'lg:', 'xl:', '2xl:'].forEach(prefix => {
    Object.keys(classMap).forEach(orig => {
      if (!orig.includes(':') && classMap[orig]) {
        const respVer = prefix + orig;
        classMap[respVer] = classMap[orig];
      }
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
  
  // Third pass: replace in ALL CSS (both <style> blocks AND Tailwind inline styles)
  Object.entries(classMap).forEach(([orig, short]) => {
    if (shouldSkip(orig)) return;
    
    // Build escaped pattern for class name
    // Use String.raw with double backslash to get single backslash in regex
    let escaped = orig.replace(/-/g, String.raw`\-`);
    
    // 1. Base class: .flex-row → .c6
    const basePattern = String.raw`\.` + escaped;
    const baseRegex = new RegExp(basePattern + String.raw`([{:, >~])`, 'g');
    html = html.replace(baseRegex, '.' + short + '$1');
    
    // 2. Dark variant: .dark\:flex-row → .c6  
    if (orig.startsWith('dark:')) {
      const baseClass = orig.slice(5);
      const baseEscaped = baseClass.replace(/-/g, String.raw`\-`);
      const darkPattern = String.raw`\.dark\\:` + baseEscaped;
      const darkRegex = new RegExp(darkPattern + String.raw`([{:, >])`, 'g');
      html = html.replace(darkRegex, '.' + short + '$1');
    }
    
    // 3. Responsive variant: .sm\:flex-row → .c6
    if (orig.match(/^(sm|md|lg|xl|2xl):/)) {
      const baseClass = orig.replace(/^(sm|md|lg|xl|2xl):/, '');
      const prefix = orig.match(/^(sm|md|lg|xl|2xl):/)[1];
      const baseEscaped = baseClass.replace(/-/g, String.raw`\-`);
      
      // Use \\ to match single backslash in CSS - need TWO in string for regex
      const respPattern = String.raw`\.` + prefix + String.raw`\\:` + baseEscaped;
      const respRegex = new RegExp(respPattern + String.raw`([{:, >])`, 'g');
      html = html.replace(respRegex, '.' + short + '$1');
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