const fs = require('fs');
const html = fs.readFileSync('_site/index.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/g)[0];

// Find dark: selectors
const darks = css.match(/\.dark\\:[a-z0-9\-]+/g);
console.log('Dark selectors sample:', darks ? darks.slice(0, 5) : 'none');

// Both dark and normal have same styles - we could create mappings
const text300dark = css.includes('.dark\\:text-primary-300');
const text300norm = css.includes('.text-primary-300');

// If we map text-primary-300 to cXX, we also need to map dark:text-primary-300 to SAME cXX
console.log('Same base class:', text300dark && text300norm);