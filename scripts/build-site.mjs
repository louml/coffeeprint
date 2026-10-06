// Monta a pasta site/ (pronta para publicar em qualquer hospedagem estática).
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
fs.rmSync(site, { recursive: true, force: true });
execSync('npx tsc -p tsconfig.web.json', { cwd: root, stdio: 'inherit' });

for (const f of ['index.html', 'style.css', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, 'site-src', f), path.join(site, f));
fs.cpSync(path.join(root, 'assets/fonts'), path.join(site, 'assets/fonts'), { recursive: true });
fs.mkdirSync(path.join(site, 'assets/img'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets/img/selo.jpg'), path.join(site, 'assets/img/selo.jpg'));

// ícones do app a partir do selo
const selo = await loadImage(path.join(root, 'assets/img/selo.jpg'));
fs.mkdirSync(path.join(site, 'icons'), { recursive: true });
for (const size of [192, 512]) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  const pad = Math.round(size * 0.06);
  ctx.drawImage(selo, pad, pad, size - 2 * pad, size - 2 * pad);
  fs.writeFileSync(path.join(site, `icons/icon-${size}.png`), c.toBuffer('image/png'));
}

// lista de arquivos para o modo sem internet + versão (muda quando qualquer arquivo muda)
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p) : files.push(path.relative(site, p).split(path.sep).join('/'));
  }
})(site);
files.sort();
const hash = createHash('sha1');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(site, f)));
const sw = fs
  .readFileSync(path.join(root, 'site-src/sw.template.js'), 'utf8')
  .replace('__VERSION__', hash.digest('hex').slice(0, 10))
  .replace('__FILES__', JSON.stringify(['./', ...files], null, 2));
fs.writeFileSync(path.join(site, 'sw.js'), sw);
console.log(`site/ pronto com ${files.length} arquivos.`);
