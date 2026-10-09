import { BOLD, REG, SEMI, renderLabelCore, type RenderEnv } from './label/draw.js';
import type { Bitmap1bpp, DadosRotulo, OpcoesRotulo } from './label/types.js';

/**
 * O app é um arquivo único aberto direto do disco (file://), onde o navegador bloqueia arquivos externos.
 * Por isso o build (scripts/build.mjs) embute fontes e selo como data URI em window.__ASSETS__.
 */
interface EmbeddedAssets {
  fonts: Record<string, string>;
  seal: string;
}
const found = (window as unknown as { __ASSETS__?: EmbeddedAssets }).__ASSETS__;
if (!found) throw new Error('Fontes e selo não foram embutidos. Gere o index.html com "npm run build".');
const embedded: EmbeddedAssets = found;

const FONT_FAMILIES = [REG, SEMI, BOLD];

let ready: Promise<void> | undefined;
/** Carrega as fontes do rótulo (empacotadas no site, funcionam sem internet depois do primeiro acesso). */
export function loadFonts(): Promise<void> {
  ready ??= Promise.all(
    FONT_FAMILIES.map(async (family) => {
      const face = new FontFace(family, `url("${embedded.fonts[family]}")`);
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
      img.src = embedded.seal;
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
