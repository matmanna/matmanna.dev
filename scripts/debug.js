const fs = require('fs');
const html = fs.readFileSync('_site/index.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/g)[0];

// Find selectors that have c## AND dark\:
const mappedDark = css.match(/\.c[0-9]+[^{]*{[^}]*dark/g);
console.log('Mapped dark selectors:', mappedDark ? mappedDark.length : 0);

// Check for broken patterns - selectors starting with dark\:
const brokenDark = css.match(/dark\\:[a-z][^\\}]*{/g);
console.log('Broken dark selectors:', brokenDark ? brokenDark.slice(0, 3) : 'none');