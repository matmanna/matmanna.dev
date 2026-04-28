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
  
  // Skip arbitrary values entirely - can't reliably replace in CSS
  if (c.includes('[')) return true;
  
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
   
  // Fourth pass: handle arbitrary value classes (max-w-[80ch], etc)
  // These must NOT be minified in HTML since we can't reliably replace in CSS
  // Instead, skip them entirely - they'll remain as-is in both HTML and CSS
   
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

// Also update tailwind.css with minified class names
function updateCSS(filePath) {
  if (!fs.existsSync(filePath)) return;
  let css = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  Object.entries(classMap).forEach(([orig, short]) => {
    if (orig.startsWith('no-')) {
      const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace .no-external-icon in any CSS selector
      const selectorRegex = new RegExp('\\.' + escaped + '(?=[^a-zA-Z0-9]|$)', 'g');
      if (css.match(selectorRegex)) {
        css = css.replace(selectorRegex, '.' + short);
        modified = true;
      }
      
      // Replace [data-no-external-icon] attribute selector
      const attrRegex = new RegExp('\\[data-' + escaped + '\\]', 'g');
      if (css.match(attrRegex)) {
        css = css.replace(attrRegex, '[data-' + short + ']');
        modified = true;
      }
    }
  });
  
  if (modified) fs.writeFileSync(filePath, css);
}

walkDir('_site');
updateCSS('_site/assets/css/tailwind.css');
console.log('Minified ' + idx + ' classes');