import { HEIGHT, WIDTH } from './geometry.js';
import type { Bitmap1bpp, DadosRotulo, OpcoesRotulo } from './types.js';

/**
 * Desenho do rótulo independente de plataforma: roda igual no Node (servidor) e no navegador.
 * Quem usa informa como criar um canvas e carregar o selo, e registra as fontes abaixo.
 */
type Ctx = CanvasRenderingContext2D;

/** Fonte do rótulo: Inter, em três pesos. Cada ambiente registra os arquivos com estes nomes. */
export const REG = 'TLInter'; // 400
export const SEMI = 'TLInterSemi'; // 600
export const BOLD = 'TLInterBold'; // 700

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
// Medidas tiradas do modelo de referência (imagem 945x1181 reduzida para 640x800 pontos, 203 dpi).

const LEFT = 46;
const RIGHT = 591;
const CW = RIGHT - LEFT;
const RULE4_Y = 659; // última linha: o rodapé fica fixo abaixo dela
const RULE_H = 2;

// O nome do café (título) e o do cliente têm o mesmo tamanho e o mesmo peso (semibold), como no modelo.
const NAME_SIZE = 43.8;
const SIZE = { title: NAME_SIZE, peso: 38.8, label: 22.6, value: 28, row: 22.4, date: 22.9, produzido: 28.1, client: NAME_SIZE, footer: 17.1 };

const FOOTER_LINES = [
  'Produto artesanal. Conservar em local fresco e arejado.',
  'Validade de 6 meses a partir da data de torra.',
  'G. Gomes de Carvalho Ltda - CNPJ 36530500000182 - Porto Alegre, RS',
  'sac@torralocal.com.br - www.torralocal.com.br',
];
const FOOTER_BASELINES = [702, 722, 742, 762];
const FOOTER_MAX_W = WIDTH - 2 * 24;

type Op =
  | { t: 'rule'; y: number }
  | { t: 'text'; text: string; family: string; size: number; x: number; y: number; align: 'left' | 'right' | 'center' };

const text = (text: string, family: string, size: number, x: number, y: number, align: 'left' | 'right' | 'center' = 'left'): Op => ({ t: 'text', text, family, size, x, y, align });

const lineText = (line: Token[]) => line.map((t) => t.text).join(' ');

/** Posições dos itens da linha "espécie / torra / moagem": espaços iguais entre eles, de ponta a ponta. */
function spreadRow(ctx: Ctx, items: string[], baseline: number): Op[] {
  if (!items.length) return [];
  let size = SIZE.row;
  let widths: number[] = [];
  for (; size >= 14; size -= 0.5) {
    ctx.font = font(BOLD, size);
    widths = items.map((t) => ctx.measureText(t).width);
    if (items.length === 1 || (CW - widths.reduce((a, b) => a + b, 0)) / (items.length - 1) >= 14) break;
  }
  const gap = items.length > 1 ? (CW - widths.reduce((a, b) => a + b, 0)) / (items.length - 1) : 0;
  let x = LEFT;
  return items.map((t, i) => {
    const op = text(t, BOLD, size, x, baseline);
    x += widths[i] + gap;
    return op;
  });
}

/** Calcula onde cada texto e linha vai ficar, com tudo reduzido na escala `s` (1 = tamanho do modelo). */
function plan(ctx: Ctx, d: DadosRotulo, s: number) {
  const ops: Op[] = [];
  const c = d.cafe;

  // Título (esquerda) e peso (direita) na mesma linha
  ctx.font = font(SEMI, SIZE.peso);
  const pesoW = ctx.measureText(d.peso).width;
  const title = fitTokens(ctx, tokenize([{ text: c.nome, family: SEMI }]), CW - pesoW - 24, SIZE.title, 22, 2, 30);
  const base1 = 49 + 0.757 * title.size;
  title.lines.forEach((line, i) => ops.push(text(lineText(line), SEMI, title.size, LEFT, base1 + i * Math.round(title.size * 1.15))));
  ops.push(text(d.peso, SEMI, SIZE.peso, RIGHT, base1 - 3.3, 'right')); // o peso fica um pouco acima da linha de base do título, como no modelo
  const rule1 = base1 + (title.lines.length - 1) * Math.round(title.size * 1.15) + 24;
  ops.push({ t: 'rule', y: rule1 });

  // Rótulo em negrito numa linha e valor na linha de baixo
  const fields: Array<[string, string]> = [
    ['Notas sensoriais:', c.notas],
    [`${c.rotuloProdutor?.trim() || 'Produtor'}:`, c.produtor],
    ['Variedade:', c.variedade],
    ['Região:', c.regiao],
  ];
  let lb = rule1 + 40.5 * s;
  let lastBase = rule1;
  for (const [label, value] of fields) {
    if (!value.trim()) continue;
    ops.push(text(label, BOLD, SIZE.label * s, LEFT, lb));
    const vs = SIZE.value * s;
    const fit = fitTokens(ctx, tokenize([{ text: value, family: REG }]), CW, vs, vs * 0.8, 2, vs * 0.86);
    const vlh = Math.round(fit.size * 1.25);
    let vb = lb + 34.7 * s;
    for (const line of fit.lines) {
      ops.push(text(lineText(line), REG, fit.size, LEFT, vb));
      lastBase = vb;
      vb += vlh;
    }
    lb = lastBase + 38.7 * s;
  }
  const rule2 = lastBase + 21.6 * s;
  ops.push({ t: 'rule', y: rule2 });

  const rowBase = rule2 + 43.5 * s;
  ops.push(...spreadRow(ctx, [c.especie, c.torra, `Moagem: ${d.moagem}`].filter((t) => t.trim()), rowBase));
  const dateBase = rowBase + 38.8 * s;
  ops.push(text(`Data de torra: ${d.dataTorra}`, BOLD, SIZE.date * s, LEFT, dateBase));
  const upperEnd = dateBase + 29.5 * s; // onde a linha 3 ficaria logo depois da data

  // Bloco "Produzido para": ancorado na última linha, para o rodapé não se mexer
  const client = tokenize([{ text: d.cliente.trim(), family: SEMI }]);
  const cfit = client.length ? fitTokens(ctx, client, CW, SIZE.client, 20, 2, 30) : { size: SIZE.client, lines: [] as Token[][] };
  const clh = Math.round(cfit.size * 1.2);
  const nLines = Math.max(1, cfit.lines.length);
  const clientSpan = 0.757 * cfit.size + (nLines - 1) * clh;
  const lowerH = 42.1 * s + 22.8 * s + clientSpan + 27 * s;
  const rule3 = RULE4_Y - lowerH;
  const prodBase = rule3 + 42.1 * s;
  const lowerOps: Op[] = [{ t: 'rule', y: rule3 }, text('Produzido para:', REG, SIZE.produzido * s, LEFT, prodBase)];
  cfit.lines.forEach((line, i) => lowerOps.push(text(lineText(line), SEMI, cfit.size, LEFT, prodBase + 22.8 * s + 0.757 * cfit.size + i * clh)));
  return { ops: [...ops, ...lowerOps], overflow: upperEnd - rule3 };
}

function drawContent(ctx: Ctx, d: DadosRotulo): void {
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  // reduz a escala só se o conteúdo não couber (textos muito longos); com textos normais s = 1
  let s = 1;
  let p = plan(ctx, d, s);
  while (p.overflow > 3 && s > 0.6) {
    s = Math.round((s - 0.02) * 100) / 100;
    p = plan(ctx, d, s);
  }
  for (const op of p.ops) {
    if (op.t === 'rule') {
      ctx.fillRect(LEFT + 2, Math.round(op.y), CW - 2, RULE_H);
    } else {
      ctx.font = font(op.family, op.size);
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  ctx.fillRect(LEFT + 2, RULE4_Y, CW - 2, RULE_H);

  // Rodapé fixo
  ctx.textAlign = 'center';
  FOOTER_LINES.forEach((line, i) => {
    const { size } = fitTokens(ctx, [{ text: line, family: REG }], FOOTER_MAX_W, SIZE.footer, 11, 1);
    ctx.font = font(REG, size);
    ctx.fillText(line, WIDTH / 2, FOOTER_BASELINES[i]);
  });
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- selo + 1 bit

const SEAL_DENSITY = 0.2; // fração de pontos pretos no fundo (cinza claro pontilhado)
const DITHER_NOISE = 0.35; // ruído no limiar da difusão de erro (quebra padrões regulares)
const SEAL_DIAMETER = 370;
const SEAL_CX = 437;
const SEAL_CY = 316;
const INK_THRESHOLD = 170; // cinza abaixo do qual o ponto vira preto (mais alto = traço um pouco mais grosso)
const HALO = 3; // área em branco ao redor do texto para o selo não atrapalhar a leitura

/** Gerador pseudoaleatório com semente fixa: o mesmo rótulo sai sempre idêntico (tela e impressão). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Transforma o selo (tons de cinza) em pontos pretos com aspecto orgânico: difusão de erro (Floyd-Steinberg,
 * varrendo em zigue-zague) com um pouco de ruído no limiar para não formar padrões repetidos.
 * Pontos em `clear` (ao redor do texto) ficam em branco e não espalham erro.
 */
function ditherSeal(dark: Float32Array, clear: Uint8Array): Uint8Array {
  const rand = mulberry32(11);
  const err = Float32Array.from(dark);
  const out = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const dir = y % 2 === 0 ? 1 : -1;
    for (let k = 0; k < WIDTH; k++) {
      const x = dir === 1 ? k : WIDTH - 1 - k;
      const i = y * WIDTH + x;
      if (clear[i]) continue;
      const old = err[i];
      const v = old >= 0.5 + (rand() - 0.5) * DITHER_NOISE ? 1 : 0;
      out[i] = v;
      const e = old - v;
      const ahead = x + dir >= 0 && x + dir < WIDTH;
      const behind = x - dir >= 0 && x - dir < WIDTH;
      if (ahead) err[i + dir] += (e * 7) / 16;
      if (y + 1 < HEIGHT) {
        if (behind) err[i + WIDTH - dir] += (e * 3) / 16;
        err[i + WIDTH] += (e * 5) / 16;
        if (ahead) err[i + WIDTH + dir] += e / 16;
      }
    }
  }
  return out;
}

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
  for (let i = 0; i < ink.length; i++) ink[i] = tpx[i * 4] < INK_THRESHOLD ? 1 : 0;

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
    const dark = new Float32Array(WIDTH * HEIGHT);
    for (let i = 0; i < dark.length; i++) dark[i] = 1 - bpx[i * 4] / 255;
    seal = ditherSeal(dark, clear);
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

