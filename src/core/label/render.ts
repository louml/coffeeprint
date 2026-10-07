import { createCanvas, GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOLD, MED, REG, SEMI, renderLabelCore, type RenderEnv } from './draw.js';
import type { Bitmap1bpp, DadosRotulo, OpcoesRotulo } from './types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets');

let fontsReady = false;
function ensureFonts(): void {
  if (fontsReady) return;
  for (const [family, weight] of [[REG, 400], [MED, 500], [SEMI, 600], [BOLD, 700]] as const) {
    GlobalFonts.registerFromPath(path.join(ASSETS, `fonts/inter-latin-${weight}-normal.woff`), family);
  }
  fontsReady = true;
}

let selo: Promise<Image> | undefined;
const env: RenderEnv = {
  createCanvas: (w, h) => createCanvas(w, h),
  loadSeal: () => (selo ??= loadImage(path.join(ASSETS, 'img/selo.jpg'))) as unknown as Promise<CanvasImageSource>,
};

/** Desenha o rótulo e devolve a imagem final de 1 bit (a mesma usada na tela e na impressão). */
export function renderLabel(dados: DadosRotulo, opcoes: OpcoesRotulo): Promise<Bitmap1bpp> {
  ensureFonts();
  return renderLabelCore(env, dados, opcoes);
}

/** Converte a imagem de 1 bit em PNG (preto e branco) para a tela ou para salvar em arquivo. */
export function bitmapToPng(bmp: Bitmap1bpp): Buffer {
  const canvas = createCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(bmp.width, bmp.height);
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      const black = bmp.data[y * bmp.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7));
      const o = (y * bmp.width + x) * 4;
      const v = black ? 0 : 255;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toBuffer('image/png');
}
