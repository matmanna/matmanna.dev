#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const classMap = {};
let idx = 0;

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let classesFound = 0;
  
  const matches = html.match(/class="([^"]+)"/g) || [];
  
  matches.forEach(m => {
    const orig = m.match(/class="([^"]+)"/)[1];
    const classArr = orig.split(' ').filter(c => c);
    const newArr = classArr.map(c => {
      // Skip icons, no-*, and variant classes (dark:, [1])
      if (c.startsWith('fa-') || c.startsWith('no-') || c.includes(':') || c.startsWith('[')) return c;
      if (!classMap[c]) {
        classMap[c] = `c${idx++}`;
      }
      modified = true;
      return classMap[c];
    });
    
    if (modified) {
      const newClasses = newArr.join(' ');
      if (newClasses !== orig) {
        html = html.replace(m, `class="${newClasses}"`);
      }
    }
  });
  
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