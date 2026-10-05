import type { Bitmap1bpp } from '../label/types.js';

/** Monta o comando ZPL que imprime a imagem inteira `copias` vezes. */
export function bitmapToZpl(bmp: Bitmap1bpp, copias: number): string {
  const total = bmp.data.length;
  const hex = Buffer.from(bmp.data).toString('hex').toUpperCase();
  return [
    '^XA',
    '^CI28',
    `^PW${bmp.width}`,
    `^LL${bmp.height}`,
    '^LH0,0',
    `^FO0,0^GFA,${total},${total},${bmp.bytesPerRow},${hex}^FS`,
    `^PQ${copias},0,1,N`,
    '^XZ',
    '',
  ].join('\n');
}
