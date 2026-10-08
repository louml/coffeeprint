// Roda o mesmo desenho do app (src/label/draw.ts) no Node, só para os testes.
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import path from 'node:path';
import { BOLD, MED, REG, SEMI, renderLabelCore } from '../../build/label/draw.js';

const assets = path.resolve(import.meta.dirname, '../../assets');
for (const [family, peso] of [[REG, 400], [MED, 500], [SEMI, 600], [BOLD, 700]]) {
  GlobalFonts.registerFromPath(path.join(assets, `fonts/inter-latin-${peso}-normal.woff`), family);
}
const env = {
  createCanvas: (w, h) => createCanvas(w, h),
  loadSeal: () => loadImage(path.join(assets, 'img/selo.jpg')),
};

export const renderLabel = (dados, opcoes) => renderLabelCore(env, dados, opcoes);

export const arara = {
  cafe: { nome: 'Arara da Mogiana', notas: 'Ameixa e caramelo', produtor: 'Luís Sordi', variedade: 'Arara', regiao: 'Média Mogiana', especie: '100% Arábica', torra: 'Torra média' },
  cliente: 'Eliezer Ramos', peso: '500g', moagem: 'Grão', dataTorra: '05/10/2026',
};

/** Quantos pontos pretos há na linha y da imagem de 1 bit. */
export function pontosNaLinha(bmp, y) {
  let n = 0;
  for (let x = 0; x < bmp.width; x++) if (bmp.data[y * bmp.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) n++;
  return n;
}
