import { HEIGHT, MARGIN, WIDTH } from './geometry.js';
import type { Bitmap1bpp, DadosRotulo, OpcoesRotulo } from './types.js';

/**
 * Desenho do rótulo independente de plataforma: roda igual no Node (servidor) e no navegador.
 * Quem usa informa como criar um canvas e carregar o selo, e registra as fontes abaixo.
 */
type Ctx = CanvasRenderingContext2D;

export const REG = 'TLOpenSans';
export const BOLD = 'TLOpenSansBold';
export const DISPLAY = 'TLBebas';

export interface RenderEnv {
  createCanvas(width: number, height: number): { getContext(type: '2d'): unknown };
  loadSeal(): Promise<CanvasImageSource>;
}

const font = (family: string, size: number) => `${size}px "${family}"`;

// ---------------------------------------------------------------- texto

interface Token {
  text: string;
  family: string;
}

/** Quebra uma sequência de tokens em linhas que cabem em `maxWidth`. */
function wrapTokens(ctx: Ctx, tokens: Token[], size: number, maxWidth: number): Token[][] {
  const lines: Token[][] = [[]];
  let width = 0;
  for (const tok of tokens) {
    ctx.font = font(tok.family, size);
    const w = ctx.measureText(tok.text).width;
    const space = ctx.measureText(' ').width;
    const lead = lines[lines.length - 1].length ? space : 0;
    if (width + lead + w > maxWidth && lines[lines.length - 1].length) {
      lines.push([tok]);
      width = w;
    } else {
      lines[lines.length - 1].push(tok);
      width += lead + w;
    }
  }
  return lines;
}

function lineWidth(ctx: Ctx, line: Token[], size: number): number {
  let total = 0;
  line.forEach((tok, i) => {
    ctx.font = font(tok.family, size);
    total += ctx.measureText(tok.text).width + (i ? ctx.measureText(' ').width : 0);
  });
  return total;
}

function drawLine(ctx: Ctx, line: Token[], size: number, x: number, baseline: number): void {
  let cx = x;
  line.forEach((tok, i) => {
    ctx.font = font(tok.family, size);
    if (i) cx += ctx.measureText(' ').width;
    ctx.fillText(tok.text, cx, baseline);
    cx += ctx.measureText(tok.text).width;
  });
}

function tokenize(parts: Array<{ text: string; family: string }>): Token[] {
  return parts.flatMap((p) => p.text.split(/\s+/).filter(Boolean).map((text) => ({ text, family: p.family })));
}

/**
 * Escolhe o maior tamanho de fonte (de `max` até `min`) em que o texto cabe em
 * `maxLines` linhas. Se nem no mínimo couber, usa o mínimo com quantas linhas
 * forem necessárias (nunca corta palavras no meio, exceto se uma única palavra
 * for mais larga que a área, caso em que a fonte é reduzida até caber).
 */
function fitTokens(
  ctx: Ctx,
  tokens: Token[],
  maxWidth: number,
  max: number,
  min: number,
  maxLines: number,
  /** Tamanho mínimo aceito para manter tudo em 1 linha antes de partir para 2 (padrão: `min`). */
  oneLineMin = min,
) {
  for (let lines = 1; lines <= maxLines; lines += 1) {
    const lo = lines === 1 ? Math.max(oneLineMin, min) : min;
    for (let size = max; size >= lo; size -= 1) {
      const wrapped = wrapTokens(ctx, tokens, size, maxWidth);
      if (wrapped.length <= lines && wrapped.every((l) => lineWidth(ctx, l, size) <= maxWidth)) return { size, lines: wrapped };
    }
  }
  let size = min;
  let lines = wrapTokens(ctx, tokens, size, maxWidth);
  while (size > 8 && lines.some((l) => lineWidth(ctx, l, size) > maxWidth)) {
    size -= 1;
    lines = wrapTokens(ctx, tokens, size, maxWidth);
  }
  return { size, lines };
}

// ---------------------------------------------------------------- layout

const CONTENT_W = WIDTH - 2 * MARGIN;
const FOOTER_LINES = [
  'Produto artesanal. Conservar em local fresco e arejado.',
  'Validade de 6 meses a partir da data de torra.',
  'G. Gomes de Carvalho Ltda - CNPJ 36530500000182 - Porto Alegre, RS',
  'sac@torralocal.com.br - www.torralocal.com.br',
];
const FOOTER_SIZE = 17;
const FOOTER_LH = 22;
const BRAND_SIZE = 74;
const BOTTOM = HEIGHT - 28;

function dottedLine(ctx: Ctx, y: number): void {
  for (let x = MARGIN; x < WIDTH - MARGIN; x += 8) ctx.fillRect(x, y, 4, 4);
}

function drawFooter(ctx: Ctx): number {
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  const linesTop = BOTTOM - FOOTER_LINES.length * FOOTER_LH;
  FOOTER_LINES.forEach((text, i) => {
    const { size } = fitTokens(ctx, [{ text, family: REG }], CONTENT_W, FOOTER_SIZE, 12, 1);
    ctx.font = font(REG, size);
    ctx.fillText(text, WIDTH / 2, linesTop + (i + 1) * FOOTER_LH - 6);
  });
  ctx.font = font(DISPLAY, BRAND_SIZE);
  const brandBase = linesTop - 6;
  ctx.fillText('TORRA LOCAL', WIDTH / 2, brandBase);
  ctx.textAlign = 'left';
  return brandBase - BRAND_SIZE * 0.72; // topo aproximado das letras
}

interface InfoLine {
  tokens: Token[];
  maxLines: number;
}

function infoLines(d: DadosRotulo): InfoLine[] {
  const c = d.cafe;
  const labeled = (label: string, value: string, maxLines = 1): InfoLine | null =>
    value.trim()
      ? { tokens: tokenize([{ text: label, family: BOLD }, { text: value, family: REG }]), maxLines }
      : null;
  const bold = (text: string): InfoLine | null =>
    text.trim() ? { tokens: tokenize([{ text, family: BOLD }]), maxLines: 1 } : null;
  return [
    labeled('Notas Sensoriais:', c.notas, 2),
    labeled('Produtor:', c.produtor),
    labeled('Variedade:', c.variedade),
    labeled('Região:', c.regiao),
    bold(c.especie),
    bold(c.torra),
    bold(`Moagem: ${d.moagem}`),
    bold(`DATA DE TORRA: ${d.dataTorra}`),
  ].filter((l): l is InfoLine => l !== null);
}

/** Desenha todo o texto/linhas em preto sobre `ctx` (fundo branco já aplicado). */
function drawContent(ctx: Ctx, d: DadosRotulo): void {
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  const brandTop = drawFooter(ctx);
  const footerSepY = brandTop - 14;

  // Título + peso na mesma linha
  let y = 26;
  ctx.font = font(BOLD, 46);
  const pesoW = ctx.measureText(d.peso).width;
  const titleMax = CONTENT_W - pesoW - 24;
  const title = fitTokens(ctx, tokenize([{ text: d.cafe.nome, family: REG }]), titleMax, 54, 30, 2, 38);
  const titleLH = Math.round(title.size * 1.2);
  title.lines.forEach((line, i) => drawLine(ctx, line, title.size, MARGIN, y + title.size + i * titleLH));
  ctx.font = font(BOLD, 46);
  ctx.textAlign = 'right';
  ctx.fillText(d.peso, WIDTH - MARGIN, y + title.size);
  ctx.textAlign = 'left';
  y += title.size + (title.lines.length - 1) * titleLH + 12;
  ctx.fillRect(MARGIN, y, CONTENT_W, 3);
  y += 3 + 12;

  // Bloco de informações: reduz a fonte até sobrar espaço para "Produzido para"
  const lines = infoLines(d);
  const clientTokens = tokenize([{ text: d.cliente.trim(), family: REG }]);
  const clientFit = clientTokens.length ? fitTokens(ctx, clientTokens, CONTENT_W, 42, 20, 2, 30) : null;
  const clientH = clientFit ? clientFit.lines.length * Math.round(clientFit.size * 1.25) : 0;
  const minClientBlock = Math.max(118, 40 + clientH + 20);
  let layout: Array<{ size: number; lines: Token[][] }> = [];
  let sizeCap = 27;
  for (; sizeCap >= 16; sizeCap -= 1) {
    layout = lines.map((l) => fitTokens(ctx, l.tokens, CONTENT_W, sizeCap, Math.max(sizeCap - 4, 16), l.maxLines, sizeCap - 2));
    const h = layout.reduce((s, l) => s + l.lines.length * Math.round(l.size * 1.42), 0);
    if (footerSepY - (y + h + 12) >= minClientBlock) break;
  }
  for (const item of layout) {
    const lh = Math.round(item.size * 1.42);
    for (const line of item.lines) {
      drawLine(ctx, line, item.size, MARGIN, y + Math.round(item.size * 1.1));
      y += lh;
    }
  }
  y += 10;

  // Produzido para
  dottedLine(ctx, y);
  const areaTop = y + 8;
  const areaBottom = footerSepY;
  ctx.textAlign = 'center';
  ctx.font = font(BOLD, 30);
  ctx.fillText('Produzido para:', WIDTH / 2, areaTop + 30);
  const client = d.cliente.trim();
  if (client) {
    const room = areaBottom - (areaTop + 40) - 8;
    const fit = clientFit!;
    const lh = Math.round(fit.size * 1.25);
    const blockH = fit.lines.length * lh;
    let cy = areaTop + 40 + Math.max(0, (room - blockH) / 2) + fit.size;
    for (const line of fit.lines) {
      ctx.font = font(REG, fit.size);
      ctx.fillText(line.map((t) => t.text).join(' '), WIDTH / 2, cy);
      cy += lh;
    }
  }
  ctx.textAlign = 'left';
  dottedLine(ctx, footerSepY);
}

// ---------------------------------------------------------------- selo + 1 bit

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SEAL_DENSITY = 0.2; // fração de pontos pretos no fundo (cinza claro tracejado)
const SEAL_DIAMETER = 400;
const SEAL_CX = 520;
const SEAL_CY = 215;
const HALO = 3; // área em branco ao redor do texto para o selo não atrapalhar a leitura

function dilate(mask: Uint8Array, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < HEIGHT; y++) {
    let last = -1e9;
    const row = y * WIDTH;
    const fwd = new Int32Array(WIDTH);
    for (let x = 0; x < WIDTH; x++) {
      if (mask[row + x]) last = x;
      fwd[x] = last;
    }
    last = 1e9;
    for (let x = WIDTH - 1; x >= 0; x--) {
      if (mask[row + x]) last = x;
      if (x - fwd[x] <= r || last - x <= r) tmp[row + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < WIDTH; x++) {
    let last = -1e9;
    const fwd = new Int32Array(HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      if (tmp[y * WIDTH + x]) last = y;
      fwd[y] = last;
    }
    last = 1e9;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (tmp[y * WIDTH + x]) last = y;
      if (y - fwd[y] <= r || last - y <= r) out[y * WIDTH + x] = 1;
    }
  }
  return out;
}

/** Desenha o rótulo e devolve a imagem final de 1 bit (a mesma usada na tela e na impressão). */
export async function renderLabelCore(env: RenderEnv, dados: DadosRotulo, opcoes: OpcoesRotulo): Promise<Bitmap1bpp> {

  const text = env.createCanvas(WIDTH, HEIGHT);
  const tctx = text.getContext('2d') as Ctx;
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawContent(tctx, dados);
  const tpx = tctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const ink = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < ink.length; i++) ink[i] = tpx[i * 4] < 150 ? 1 : 0;

  let seal: Uint8Array | null = null;
  if (opcoes.selo) {
    const bg = env.createCanvas(WIDTH, HEIGHT);
    const bctx = bg.getContext('2d') as Ctx;
    bctx.fillStyle = '#fff';
    bctx.fillRect(0, 0, WIDTH, HEIGHT);
    bctx.globalAlpha = SEAL_DENSITY;
    bctx.drawImage(await env.loadSeal(), SEAL_CX - SEAL_DIAMETER / 2, SEAL_CY - SEAL_DIAMETER / 2, SEAL_DIAMETER, SEAL_DIAMETER);
    const bpx = bctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const clear = dilate(ink, HALO);
    seal = new Uint8Array(WIDTH * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = y * WIDTH + x;
        if (clear[i]) continue;
        const darkness = 1 - bpx[i * 4] / 255;
        const threshold = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        if (darkness > threshold) seal[i] = 1;
      }
    }
  }

  const bytesPerRow = Math.ceil(WIDTH / 8);
  const data = new Uint8Array(bytesPerRow * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (ink[i] || (seal && seal[i])) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width: WIDTH, height: HEIGHT, bytesPerRow, data };
}

