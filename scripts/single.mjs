// Gera o arquivo único index.html (código, estilos, fontes e selo embutidos), que funciona aberto direto do disco.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(import.meta.dirname, '..');
const b64 = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;

export async function buildSingle() {
  const bundle = await build({
    entryPoints: [path.join(root, 'src/web/app.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  const assets = {
    fonts: {
      TLInter: b64('assets/fonts/inter-latin-400-normal.woff', 'font/woff'),
      TLInterMed: b64('assets/fonts/inter-latin-500-normal.woff', 'font/woff'),
      TLInterSemi: b64('assets/fonts/inter-latin-600-normal.woff', 'font/woff'),
      TLInterBold: b64('assets/fonts/inter-latin-700-normal.woff', 'font/woff'),
    },
    seal: b64('assets/img/selo.jpg', 'image/jpeg'),
  };

  const icon = createCanvas(64, 64);
  const ictx = icon.getContext('2d');
  ictx.fillStyle = '#fff';
  ictx.fillRect(0, 0, 64, 64);
  ictx.drawImage(await loadImage(path.join(root, 'assets/img/selo.jpg')), 3, 3, 58, 58);
  const favicon = `data:image/png;base64,${icon.toBuffer('image/png').toString('base64')}`;

  const css = fs.readFileSync(path.join(root, 'site-src/style.css'), 'utf8');
  let html = fs.readFileSync(path.join(root, 'site-src/index.html'), 'utf8');
  html = html
    .replace(/<link rel="manifest"[^>]*>\s*/, '')
    .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${favicon}">`)
    .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
    .replace(/<script type="module"[^>]*><\/script>/, () => `<script>window.__ASSETS__=${JSON.stringify(assets)};</script>\n<script>\n${js}\n</script>`);
  if (html.includes('js/web/app.js') || html.includes('style.css')) throw new Error('Falha ao embutir recursos no index.html.');
  return `<!-- GERADO por "npm run build:single". Não edite à mão: edite src/ e site-src/ e gere de novo. -->\n${html}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const out = path.join(root, 'index.html');
  const html = await buildSingle();
  fs.writeFileSync(out, html);
  console.log(`index.html gerado (${(html.length / 1024).toFixed(0)} KB).`);
}
