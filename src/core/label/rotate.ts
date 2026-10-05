import type { Bitmap1bpp } from './types.js';

export type Rotacao = 0 | 90 | 180 | 270;
export const ROTACOES: readonly Rotacao[] = [0, 90, 180, 270];

const get = (b: Bitmap1bpp, x: number, y: number) => (b.data[y * b.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0;

/** Gira a imagem no sentido horário. Usado para compensar a forma como a etiqueta está no rolo da impressora. */
export function rotateBitmap(src: Bitmap1bpp, graus: Rotacao): Bitmap1bpp {
  if (graus === 0) return src;
  const swap = graus !== 180;
  const width = swap ? src.height : src.width;
  const height = swap ? src.width : src.height;
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (!get(src, x, y)) continue;
      const [nx, ny] = graus === 90 ? [src.height - 1 - y, x] : graus === 180 ? [src.width - 1 - x, src.height - 1 - y] : [y, src.width - 1 - x];
      data[ny * bytesPerRow + (nx >> 3)] |= 0x80 >> (nx & 7);
    }
  }
  return { width, height, bytesPerRow, data };
}
