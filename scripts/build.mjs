// Gera o index.html: o app inteiro em um único arquivo (código, estilos, fontes e selo embutidos).
// Ele funciona aberto direto do disco, sem servidor e sem internet.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const dataUri = (file, mime) => `data:${mime};base64,${read(file).toString('base64')}`;

/** O selo redimensionado (fundo branco) como PNG em data URI. */
async function selo(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(await loadImage(path.join(root, 'assets/img/selo.jpg')), 0, 0, size, size);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

export async function buildApp() {
  const bundle = await build({
    entryPoints: [path.join(root, 'src/app.ts')],
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
      TLInter: dataUri('assets/fonts/inter-latin-400-normal.woff', 'font/woff'),
      TLInterSemi: dataUri('assets/fonts/inter-latin-600-normal.woff', 'font/woff'),
      TLInterBold: dataUri('assets/fonts/inter-latin-700-normal.woff', 'font/woff'),
    },
    seal: dataUri('assets/img/selo.jpg', 'image/jpeg'),
  };

  const values = {
    '{{FAVICON}}': await selo(64),
    '{{LOGO}}': await selo(160),
    '/*{{CSS}}*/': read('src/style.css').toString('utf8'),
    '{{ASSETS}}': JSON.stringify(assets),
    '/*{{SCRIPT}}*/': js,
  };
  let html = read('src/index.html').toString('utf8');
  for (const [marker, value] of Object.entries(values)) html = html.replace(marker, () => value);
  if (html.includes('{{')) throw new Error('Algum marcador do src/index.html não foi substituído.');
  return `<!-- GERADO por "npm run build". Não edite à mão: edite os arquivos de src/ e gere de novo. -->\n${html}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const html = await buildApp();
  fs.writeFileSync(path.join(root, 'index.html'), html);
  console.log(`index.html gerado (${(html.length / 1024).toFixed(0)} KB).`);
}
