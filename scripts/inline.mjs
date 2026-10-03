// Bundles the built game into one self-contained HTML file: dist/x.html
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
let inlined = 0;
const out = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, src) => {
  inlined++;
  const code = readFileSync(`dist/${src}`, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${code}</script>`;
});
if (inlined === 0) throw new Error('no module script found to inline');
writeFileSync('dist/x.html', out);
console.log(`dist/x.html (${(out.length / 1024).toFixed(1)} kB)`);
