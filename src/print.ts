import { rotateBitmap, type Rotacao } from './label/rotate.js';
import type { Bitmap1bpp } from './label/types.js';
import { drawBitmap } from './env.js';

const mm = (dots: number) => `${(dots / 8).toFixed(2).replace(/\.00$/, '')}mm`;

export interface ResultadoImpressao {
  copias: number;
  largura: string;
  altura: string;
}

export interface LoteImpressao {
  bmp: Bitmap1bpp;
  copias: number;
}

/**
 * Imprime pelo navegador (driver do Windows). Monta uma página por cópia, no tamanho exato da etiqueta,
 * e chama a impressão uma única vez, com todos os rótulos na ordem dada (a fila de impressão usa isto).
 * O navegador não informa se a impressora realmente imprimiu.
 */
export async function imprimirLotes(lotes: LoteImpressao[], rotacao: Rotacao): Promise<ResultadoImpressao> {
  const imagens = lotes.map((lote) => {
    const final = rotateBitmap(lote.bmp, rotacao);
    const canvas = document.createElement('canvas');
    drawBitmap(final, canvas);
    return { url: canvas.toDataURL('image/png'), copias: lote.copias, largura: final.width, altura: final.height };
  });
  const w = mm(imagens[0].largura);
  const h = mm(imagens[0].altura);

  document.getElementById('print-root')?.remove();
  document.getElementById('print-style')?.remove();
  const style = document.createElement('style');
  style.id = 'print-style';
  style.textContent = `
    @page { size: ${w} ${h}; margin: 0; }
    #print-root { display: none; }
    @media print {
      html, body { margin: 0; padding: 0; background: #fff; }
      body > *:not(#print-root) { display: none !important; }
      #print-root { display: block; }
      #print-root img { display: block; width: ${w}; height: ${h}; image-rendering: pixelated; break-after: page; }
      #print-root img:last-child { break-after: auto; }
    }`;
  const root = document.createElement('div');
  root.id = 'print-root';
  let total = 0;
  for (const { url, copias } of imagens) {
    for (let i = 0; i < copias; i++) {
      const img = new Image();
      img.src = url;
      root.appendChild(img);
      total++;
    }
  }
  document.head.appendChild(style);
  document.body.appendChild(root);
  await Promise.all([...root.querySelectorAll('img')].map((i) => i.decode()));

  await new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener('afterprint', done);
      resolve();
    };
    window.addEventListener('afterprint', done);
    window.print();
    // alguns navegadores não disparam afterprint; window.print() só retorna depois do diálogo
    setTimeout(done, 400);
  });
  root.remove();
  style.remove();
  return { copias: total, largura: w, altura: h };
}

/** Imprime um único rótulo, `copias` vezes. */
export function imprimir(bmp: Bitmap1bpp, copias: number, rotacao: Rotacao): Promise<ResultadoImpressao> {
  return imprimirLotes([{ bmp, copias }], rotacao);
}

/** Modo sem impressora: baixa o rótulo como imagem. */
export function baixarPng(bmp: Bitmap1bpp, nome: string): void {
  const canvas = document.createElement('canvas');
  drawBitmap(bmp, canvas);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
