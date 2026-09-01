// Inlines style.css and every js/*.js file into one standalone HTML file.
// Usage: node build.js  ->  voxelcraft.html
const fs = require('fs'), path = require('path');
const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

html = html.replace(/[ \t]*<link rel="stylesheet" href="style\.css">\n/, () =>
  '<style>\n' + read('style.css').trimEnd() + '\n</style>\n');

html = html.replace(/[ \t]*<script src="(js\/[^"]+)"><\/script>\n/g, (_, src) => {
  const code = read(src);
  if (code.includes('</script')) throw new Error(src + ' contains a </script sequence');
  return '<script>\n// ===== ' + src + ' =====\n' + code.trimEnd() + '\n</script>\n';
});

if (html.includes('<script src=') || html.includes('stylesheet')) throw new Error('something was left un-inlined');
fs.writeFileSync(path.join(root, 'voxelcraft.html'), html);
console.log('voxelcraft.html  ' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB, self-contained');

// Artifact hosts wrap the page in their own <!doctype>/<html>/<head>/<body>,
// so that variant ships the title, the styles and the body content only.
const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error('could not find ' + what + ' in the bundle');
  return m;
};
const title = pick(/<title>[\s\S]*?<\/title>/, 'the title')[0];
const style = pick(/<style>[\s\S]*?<\/style>/, 'the stylesheet')[0];
const body = pick(/<body>\n([\s\S]*)<\/body>/, 'the body')[1];
const artifact = title + '\n' + style + '\n' + body.trimEnd() + '\n';
for (const tag of ['<!doctype', '<html', '<head', '<body']) {
  if (artifact.toLowerCase().includes(tag)) throw new Error('artifact build still contains ' + tag);
}
fs.writeFileSync(path.join(root, 'voxelcraft.artifact.html'), artifact);
console.log('voxelcraft.artifact.html  ' + (Buffer.byteLength(artifact) / 1024).toFixed(0) + ' KB, for hosted publishing');
