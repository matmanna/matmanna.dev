#!/usr/bin/env node
// Post-build class minifier for Jekyll - updates both HTML classes AND inline <style> CSS

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // First pass: collect class mappings from HTML class attributes
  const matches = html.match(/class="([^"]+)"/g) || [];
  matches.forEach(m => {
    const orig = m.match(/class="([^"]+)"/)[1];
    const classArr = orig.split(' ').filter(c => c);
    classArr.forEach(c => {
      // Skip icons, no-*, and variant classes
      if (c.startsWith('fa-') || c.startsWith('no-') || c.includes(':') || c.startsWith('[')) return;
      if (!classMap[c]) {
        classMap[c] = `c${idx++}`;
      }
    });
  });
  
  // Second pass: replace classes in HTML
  matches.forEach(m => {
    const orig = m.match(/class="([^"]+)"/)[1];
    const classArr = orig.split(' ').filter(c => c);
    const newArr = classArr.map(c => {
      if (c.startsWith('fa-') || c.startsWith('no-') || c.includes(':') || c.startsWith('[')) return c;
      return classMap[c] || c;
    });
    const newClasses = newArr.join(' ');
    if (newClasses !== orig) {
      html = html.replace(m, `class="${newClasses}"`);
      modified = true;
    }
  });
  
  // Third pass: replace classes in <style> block
  if (html.includes('<style>')) {
    let styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    let newStyle = styleBlock;
    const entries = Object.entries(classMap).sort((a, b) => b[0].length - a[0].length);
    entries.forEach(([orig, short]) => {
      const regex = new RegExp(`\\.${orig}`, 'g');
      newStyle = newStyle.replace(regex, `.${short}`);
    });
    if (newStyle !== styleBlock) {
      html = html.replace(styleBlock, newStyle);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, html);
  }
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