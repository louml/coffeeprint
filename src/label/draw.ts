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
// Medidas tiradas do modelo de referência (docs/modelo-do-rotulo.png, reduzido para 640x800 pontos, 203 dpi).

const LEFT = 46;
const RIGHT = 598;
const CW = RIGHT - LEFT;
const RULE4_Y = 670; // última linha: o rodapé fica fixo abaixo dela
const DATE_BASE = RULE4_Y - 22.8; // linha com a data e o nível de torra (acima da última linha)
const MARGEM_V = 25; // distância da tinta até a borda: igual no topo (título) e embaixo (último texto do rodapé)
const RULE_H = 3;
const TAG_D = 33; // tag de entrega: círculo preto com a letra em branco

// O nome do café (título) e o do cliente têm o mesmo tamanho e o mesmo peso (semibold), como no modelo.
const NAME_SIZE = 43.8;
const SIZE = { title: NAME_SIZE, peso: 38.8, label: 22.6, value: 28, sub: 28, row: 22.9, produzido: 28.1, client: NAME_SIZE, footer: 17.1 };

const FOOTER_LINES = [
  'Produto artesanal. Conservar em local fresco e arejado.',
  'Validade de 6 meses a partir da data de torra.',
  'G. Gomes de Carvalho Ltda - CNPJ 36530500000182 - Porto Alegre, RS',
  'sac@torralocal.com.br - www.torralocal.com.br',
];
const FOOTER_BASELINES = [710.5, 730.5, 750.5, 770.5]; // a tinta da última linha termina em 800 - MARGEM_V
const FOOTER_MAX_W = WIDTH - 2 * 24;

type Op =
  | { t: 'rule'; y: number }
  | { t: 'text'; text: string; family: string; size: number; x: number; y: number; align: 'left' | 'right' | 'center' };

const text = (text: string, family: string, size: number, x: number, y: number, align: 'left' | 'right' | 'center' = 'left'): Op => ({ t: 'text', text, family, size, x, y, align });

/** Como a moagem aparece na etiqueta (a lista de escolha do usuário continua com "Grão" e "Moído"). */
export function moagemNoRotulo(moagem: string): string {
  return moagem === 'Grão' ? 'Em grãos' : moagem;
}

/** Letra da tag de entrega: Uber (U), coleta pelo cliente na loja (C) ou motoboy (E). */
export function letraEntrega(entrega?: string): string {
  return ({ Uber: 'U', Coleta: 'C', Motoboy: 'E' } as Record<string, string>)[entrega ?? ''] ?? '';
}

const lineText = (line: Token[]) => line.map((t) => t.text).join(' ');

/**
 * Dois textos na mesma linha: um colado na margem esquerda e o outro na direita. Se não couberem juntos,
 * a fonte diminui um pouco. Um texto vazio simplesmente não aparece.
 */
function duasPontas(ctx: Ctx, esq: string, dir: string, baseline: number, family: string, size: number): Op[] {
  const a = esq.trim();
  const b = dir.trim();
  let tam = size;
  if (a && b) {
    for (; tam >= 14; tam -= 0.5) {
      ctx.font = font(family, tam);
      if (ctx.measureText(a).width + ctx.measureText(b).width + 16 <= CW) break;
    }
  }
  const ops: Op[] = [];
  if (a) ops.push(text(a, family, tam, LEFT, baseline));
  if (b) ops.push(text(b, family, tam, RIGHT + 2, baseline, 'right')); // +2: a tinta termina na margem
  return ops;
}

/** Calcula onde cada texto e linha vai ficar, com tudo reduzido na escala `s` (1 = tamanho do modelo). */
function plan(ctx: Ctx, d: DadosRotulo, s: number) {
  const ops: Op[] = [];
  const c = d.cafe;

  // Título (esquerda) e peso (direita) na mesma linha
  ctx.font = font(SEMI, SIZE.peso);
  const pesoW = ctx.measureText(d.peso).width;
  const title = fitTokens(ctx, tokenize([{ text: c.nome, family: SEMI }]), CW - pesoW - 24, SIZE.title, 22, 2, 30);
  const base1 = MARGEM_V + 0.757 * title.size;
  title.lines.forEach((line, i) => ops.push(text(lineText(line), SEMI, title.size, LEFT, base1 + i * Math.round(title.size * 1.15))));
  ops.push(text(d.peso, SEMI, SIZE.peso, RIGHT + 4, base1 - 3.3, 'right')); // o peso fica um pouco acima da linha de base do título, como no modelo
  const tituloFim = base1 + (title.lines.length - 1) * Math.round(title.size * 1.15);

  // Espécie (esquerda) e moagem (direita) logo abaixo do título: a moagem fica bem à vista
  const temSub = c.especie.trim() !== '' || d.moagem.trim() !== '';
  const subBase = tituloFim + 47.5;
  ops.push(...duasPontas(ctx, c.especie, moagemNoRotulo(d.moagem), subBase, REG, SIZE.sub));
  const rule1 = temSub ? subBase + 22.5 : tituloFim + 24;
  ops.push({ t: 'rule', y: rule1 });

  // Parte de baixo, ancorada de baixo para cima: última linha > data/torra > "Produzido para" > campos do café
  const client = tokenize([{ text: d.cliente.trim(), family: SEMI }]);
  const cfit = client.length ? fitTokens(ctx, client, CW, SIZE.client, 20, 2, 30) : { size: SIZE.client, lines: [] as Token[][] };
  const clh = Math.round(cfit.size * 1.2);
  const nLines = Math.max(1, cfit.lines.length);
  const clientSpan = 0.757 * cfit.size + (nLines - 1) * clh;
  const rule3 = DATE_BASE - 45;
  const lowerH = 53.2 * s + 22.8 * s + clientSpan + 22 * s;
  const rule2 = rule3 - lowerH;

  // Rótulo em negrito numa linha e valor na linha de baixo
  const fields: Array<[string, string]> = [
    ['Notas sensoriais:', c.notas],
    [`${c.rotuloProdutor?.trim() || 'Produtor'}:`, c.produtor],
    ['Variedade:', c.variedade],
    ['Região:', c.regiao],
  ].filter(([, v]) => v.trim()) as Array<[string, string]>;
  const fieldOps: Op[] = [];
  let lb = rule1 + 38.4 * s;
  let lastBase = rule1;
  const gaps: number[] = []; // índices (em fieldOps) onde começa cada campo, para repartir a folga
  for (const [label, value] of fields) {
    gaps.push(fieldOps.length);
    fieldOps.push(text(label, BOLD, SIZE.label * s, LEFT, lb));
    const vs = SIZE.value * s;
    const fit = fitTokens(ctx, tokenize([{ text: value, family: REG }]), CW, vs, vs * 0.8, 2, vs * 0.86);
    const vlh = Math.round(fit.size * 1.25);
    let vb = lb + 34.7 * s;
    for (const line of fit.lines) {
      fieldOps.push(text(lineText(line), REG, fit.size, LEFT, vb));
      lastBase = vb;
      vb += vlh;
    }
    lb = lastBase + 38.7 * s;
  }
  const naturalRule2 = lastBase + 22.5 * s;

  // A folga entre o fim natural dos campos e a linha 2 é repartida entre os espaços (até 6 pontos cada)
  const folga = rule2 - naturalRule2;
  const extra = fields.length && folga > 0 ? Math.min(6, folga / (fields.length + 1)) : 0;
  fields.forEach((_, k) => {
    const from = gaps[k];
    const to = k + 1 < gaps.length ? gaps[k + 1] : fieldOps.length;
    for (let i = from; i < to; i++) {
      const op = fieldOps[i];
      if (op.t === 'text') op.y += extra * (k + 1);
    }
  });
  ops.push(...fieldOps);
  ops.push({ t: 'rule', y: rule2 });

  // "Produzido para" (com a tag de entrega à direita) e o cliente
  const prodBase = rule2 + 53.2 * s;
  ops.push(text('Produzido para:', REG, SIZE.produzido * s, LEFT, prodBase));
  cfit.lines.forEach((line, i) => ops.push(text(lineText(line), SEMI, cfit.size, LEFT, prodBase + 22.8 * s + 0.757 * cfit.size + i * clh)));
  ops.push({ t: 'rule', y: rule3 });

  // Data de torra (esquerda) e nível de torra (direita)
  ops.push(...duasPontas(ctx, `Data de torra: ${d.dataTorra}`, c.torra, DATE_BASE, BOLD, SIZE.row));

  // Quanto o conteúdo passa do espaço disponível (positivo = não cabe)
  const tag = letraEntrega(d.entrega);
  return { ops, overflow: naturalRule2 - rule2, tag: tag ? { letra: tag, cy: prodBase - TAG_D / 2 } : null };
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
      ctx.fillRect(LEFT, Math.round(op.y), CW, RULE_H);
    } else {
      ctx.font = font(op.family, op.size);
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  ctx.fillRect(LEFT, RULE4_Y, CW, RULE_H);

  // Tag de entrega: círculo preto com a letra em branco, na linha do "Produzido para"
  if (p.tag) {
    const cx = RIGHT - TAG_D / 2;
    ctx.beginPath();
    ctx.arc(cx, p.tag.cy, TAG_D / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(BOLD, 22);
    ctx.textAlign = 'center';
    ctx.fillText(p.tag.letra, cx, p.tag.cy + 0.727 * 11);
    ctx.fillStyle = '#000';
  }

  // Rodapé fixo
  ctx.textAlign = 'center';
  FOOTER_LINES.forEach((line, i) => {
    const { size } = fitTokens(ctx, [{ text: line, family: REG }], FOOTER_MAX_W, SIZE.footer, 11, 1);
    ctx.font = font(REG, size);
    ctx.fillText(line, (LEFT + RIGHT) / 2, FOOTER_BASELINES[i]);
  });
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- selo + 1 bit

const SEAL_DENSITY = 0.2; // fração de pontos pretos no fundo (cinza claro pontilhado)
const DITHER_NOISE = 0.35; // ruído no limiar da difusão de erro (quebra padrões regulares)
const SEAL_DIAMETER = 289;
const SEAL_CX = 454;
const SEAL_CY = 305;
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

