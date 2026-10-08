// Gera assets/torra-local.ico (ícone do atalho no Windows) a partir do selo da marca.
// Uso: node scripts/icone.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const selo = await loadImage(path.join(root, 'assets/img/selo.jpg'));

/** Quadrado branco de cantos arredondados com o selo dentro: legível sobre qualquer papel de parede. */
function desenhar(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  const pad = size * 0.07;
  ctx.drawImage(selo, pad, pad, size - 2 * pad, size - 2 * pad);
  return { canvas, ctx };
}

/** Imagem de ícone em formato BMP (DIB 32 bits), a mais compatível para tamanhos pequenos. */
function dib(size) {
  const { ctx } = desenhar(size);
  const px = ctx.getImageData(0, 0, size, size).data;
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // altura dobrada: imagem + máscara
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const bgra = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = ((size - 1 - y) * size + x) * 4; // BMP é de baixo para cima
      const dst = (y * size + x) * 4;
      bgra[dst] = px[src + 2];
      bgra[dst + 1] = px[src + 1];
      bgra[dst + 2] = px[src];
      bgra[dst + 3] = px[src + 3];
    }
  }
  return Buffer.concat([header, bgra, Buffer.alloc(maskRow * size)]); // máscara zerada: vale o canal alfa
}

const images = SIZES.map((size) => ({ size, data: size >= 128 ? desenhar(size).canvas.toBuffer('image/png') : dib(size) }));

const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2); // tipo: ícone
head.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e[0] = size >= 256 ? 0 : size;
  e[1] = size >= 256 ? 0 : size;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
const out = path.join(root, 'assets/torra-local.ico');
fs.writeFileSync(out, Buffer.concat([head, ...entries, ...images.map((i) => i.data)]));
console.log(`${path.relative(root, out)} gerado (${SIZES.join(', ')} px, ${(offset / 1024).toFixed(0)} KB).`);
