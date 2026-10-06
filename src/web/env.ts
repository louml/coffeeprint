import { BOLD, DISPLAY, REG, renderLabelCore, type RenderEnv } from '../core/label/draw.js';
import type { Bitmap1bpp, DadosRotulo, OpcoesRotulo } from '../core/label/types.js';

const FONTS: Array<[string, string]> = [
  [REG, 'assets/fonts/open-sans-latin-400-normal.woff'],
  [BOLD, 'assets/fonts/open-sans-latin-700-normal.woff'],
  [DISPLAY, 'assets/fonts/bebas-neue-latin-400-normal.woff'],
];

let ready: Promise<void> | undefined;
/** Carrega as fontes do rótulo (empacotadas no site, funcionam sem internet depois do primeiro acesso). */
export function loadFonts(): Promise<void> {
  ready ??= Promise.all(
    FONTS.map(async ([family, url]) => {
      const face = new FontFace(family, `url(${url})`);
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return ready;
}

let seal: Promise<HTMLImageElement> | undefined;
const env: RenderEnv = {
  createCanvas: (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
  loadSeal: () =>
    (seal ??= new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível carregar o selo.'));
      img.src = 'assets/img/selo.jpg';
    })),
};

/** Mesma imagem de 1 bit que o servidor gerava: serve para a tela e para a impressão. */
export async function renderLabel(dados: DadosRotulo, opcoes: OpcoesRotulo): Promise<Bitmap1bpp> {
  await loadFonts();
  return renderLabelCore(env, dados, opcoes);
}

/** Desenha a imagem de 1 bit em um canvas (preto e branco). */
export function drawBitmap(bmp: Bitmap1bpp, canvas: HTMLCanvasElement): void {
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(bmp.width, bmp.height);
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      const v = bmp.data[y * bmp.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7)) ? 0 : 255;
      const o = (y * bmp.width + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
