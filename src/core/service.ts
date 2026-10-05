import fs from 'node:fs';
import path from 'node:path';
import { renderLabel, bitmapToPng } from './label/render.js';
import { MOAGENS, PESOS, type Bitmap1bpp, type DadosRotulo } from './label/types.js';
import { rotateBitmap } from './label/rotate.js';
import { bitmapToZpl } from './printer/zpl.js';
import { parseAddress, sendRaw } from './printer/send.js';
import type { CafeStore } from './storage/cafes.js';
import type { ConfigStore } from './storage/config.js';

/** Pedido de rótulo, como vem do formulário (ou de qualquer sistema futuro). */
export interface PedidoRotulo {
  cafeId?: string;
  cliente?: string;
  peso?: string;
  moagem?: string;
  /** Data no formato AAAA-MM-DD */
  dataTorra?: string;
  copias?: number;
}

export class ValidationError extends Error {
  constructor(public readonly campos: string[]) {
    super(`Faltam campos obrigatórios: ${campos.join(', ')}.`);
  }
}

export interface ResultadoImpressao {
  modo: 'impressora' | 'arquivo';
  copias: number;
  arquivo?: string;
  mensagem: string;
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Núcleo do app: gera e imprime rótulos. A interface web é só uma das formas de chamá-lo;
 * outros sistemas (ERP, lote, histórico) podem usar esta mesma classe no futuro.
 */
export class LabelService {
  constructor(
    private readonly cafes: CafeStore,
    private readonly config: ConfigStore,
    private readonly outDir: string,
  ) {}

  /** Valida o pedido e devolve os dados do rótulo. `strict=false` tolera campos vazios (pré-visualização). */
  buildData(p: PedidoRotulo, strict: boolean): DadosRotulo | null {
    const cafe = p.cafeId ? this.cafes.get(p.cafeId) : undefined;
    const faltando: string[] = [];
    if (!p.cliente?.trim()) faltando.push('Cliente');
    if (!cafe) faltando.push('Café');
    if (!p.peso || !(PESOS as readonly string[]).includes(p.peso)) faltando.push('Peso');
    if (!p.moagem || !(MOAGENS as readonly string[]).includes(p.moagem)) faltando.push('Moagem');
    if (!p.dataTorra || !/^\d{4}-\d{2}-\d{2}$/.test(p.dataTorra)) faltando.push('Data de torra');
    if (strict && faltando.length) throw new ValidationError(faltando);
    if (!cafe) return null;
    const { id: _id, ativo: _ativo, ...cafeData } = cafe;
    return {
      cafe: cafeData,
      cliente: p.cliente?.trim() ?? '',
      peso: p.peso ?? '',
      moagem: p.moagem ?? '',
      dataTorra: p.dataTorra ? formatDate(p.dataTorra) : '',
    };
  }

  render(dados: DadosRotulo): Promise<Bitmap1bpp> {
    return renderLabel(dados, { selo: this.config.get().selo });
  }

  async preview(p: PedidoRotulo): Promise<Buffer | null> {
    const dados = this.buildData(p, false);
    return dados ? bitmapToPng(await this.render(dados)) : null;
  }

  async print(p: PedidoRotulo): Promise<ResultadoImpressao> {
    const dados = this.buildData(p, true)!;
    const copias = Number(p.copias ?? 1);
    if (!Number.isInteger(copias) || copias < 1 || copias > 500) throw new ValidationError(['Número de cópias (1 a 500)']);
    return this.output(await this.render(dados), copias);
  }

  /** Imprime uma etiqueta de teste, opcionalmente em outro endereço (ainda não salvo). */
  async printTest(enderecoImpressora?: string): Promise<ResultadoImpressao> {
    const cafe = this.cafes.list()[0];
    const base = cafe ? (({ id: _i, ativo: _a, ...r }) => r)(cafe) : {
      nome: 'Café de teste', notas: 'Chocolate e laranja', produtor: 'Produtor', variedade: 'Variedade',
      regiao: 'Região', especie: '100% Arábica', torra: 'Torra Média',
    };
    const dados: DadosRotulo = {
      cafe: base,
      cliente: 'ETIQUETA DE TESTE',
      peso: '250g',
      moagem: 'Grão',
      dataTorra: formatDate(new Date().toISOString().slice(0, 10)),
    };
    return this.output(await this.render(dados), 1, enderecoImpressora);
  }

  private async output(bmp: Bitmap1bpp, copias: number, enderecoOverride?: string): Promise<ResultadoImpressao> {
    const cfg = this.config.get();
    const plural = copias === 1 ? '1 etiqueta' : `${copias} etiquetas`;
    if (cfg.modoSemImpressora) {
      fs.mkdirSync(this.outDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const arquivo = path.join(this.outDir, `rotulo-${stamp}-${Math.random().toString(36).slice(2, 6)}.png`);
      fs.writeFileSync(arquivo, bitmapToPng(bmp));
      return { modo: 'arquivo', copias, arquivo, mensagem: `Modo sem impressora: o rótulo foi salvo como imagem em ${arquivo}.` };
    }
    const addr = parseAddress(enderecoOverride?.trim() || cfg.enderecoImpressora);
    await sendRaw(addr, bitmapToZpl(rotateBitmap(bmp, cfg.rotacao), copias));
    return { modo: 'impressora', copias, mensagem: `${plural} enviada${copias === 1 ? '' : 's'} para a impressora.` };
  }
}
