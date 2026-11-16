import { newId } from './storage.js';

/**
 * Estoque de café torrado, em kg, por lote de torra. Cada torra cria um lote (com a data de torra) e o saldo
 * do lote é a soma dos seus movimentos. A data impressa na etiqueta é a do lote mais antigo que ainda tem saldo (FIFO).
 */
export type TipoMovimento = 'torra' | 'venda' | 'perda' | 'ajuste';
export const TIPOS_MOVIMENTO: TipoMovimento[] = ['torra', 'venda', 'perda', 'ajuste'];

export interface Lote {
  id: string;
  cafeId: string;
  /** AAAA-MM-DD */
  dataTorra: string;
  /** Desempata lotes torrados no mesmo dia (o que foi cadastrado primeiro sai primeiro). */
  criadoEm: string;
  saldoKg: number;
}

export interface Movimento {
  id: string;
  loteId: string;
  tipo: TipoMovimento;
  /** Com sinal: torra > 0, venda/perda < 0, ajuste qualquer. */
  quantidadeKg: number;
  /** AAAA-MM-DD */
  data: string;
  observacao: string;
}

export type NovoMovimento = Omit<Movimento, 'id'>;

/** Arredonda para 3 casas (gramas), como o banco (numeric(10,3)). */
export const arredondarKg = (kg: number): number => Math.round(kg * 1000) / 1000;

/** Lê um peso digitado ("0,5", "1.250,5", "2 kg"). Devolve kg positivos ou null se não for um número válido. */
export function parseKg(texto: string): number | null {
  let t = texto.trim().toLowerCase().replace(/\s*kg$/, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // 1.250,5 -> 1250.5
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const kg = arredondarKg(Number(t));
  return kg > 0 ? kg : null;
}

/** Confere o sinal e o valor do movimento (as mesmas regras do banco). Devolve a mensagem de erro ou null. */
export function erroDoMovimento(tipo: TipoMovimento, quantidadeKg: number): string | null {
  if (!Number.isFinite(quantidadeKg) || quantidadeKg === 0) return 'Informe uma quantidade diferente de zero.';
  if (tipo === 'torra' && quantidadeKg < 0) return 'Uma torra precisa ter quantidade positiva.';
  if ((tipo === 'venda' || tipo === 'perda') && quantidadeKg > 0) return 'Venda e perda reduzem o estoque (quantidade negativa).';
  return null;
}

/** Mais antigo primeiro: por data de torra e, na mesma data, por ordem de cadastro. */
const antesDe = (a: Lote, b: Lote) => a.dataTorra.localeCompare(b.dataTorra) || a.criadoEm.localeCompare(b.criadoEm);

/** Lote "em uso" (FIFO): o mais antigo que ainda tem saldo. Sem saldo em nenhum lote, devolve undefined. */
export function loteAtual(lotes: Lote[]): Lote | undefined {
  return lotes.filter((l) => l.saldoKg > 0).sort(antesDe)[0];
}

export interface SaidaDistribuida {
  /** Movimentos negativos já divididos entre os lotes, do mais antigo para o mais novo. */
  movimentos: Array<{ loteId: string; quantidadeKg: number }>;
  /** Quanto não coube no estoque disponível (> 0 = a saída é maior que o saldo total). */
  faltaKg: number;
}

/** Reparte uma saída (kg positivos) pelos lotes em ordem FIFO: esgota o mais antigo e segue para o próximo. */
export function distribuirSaida(lotes: Lote[], kg: number): SaidaDistribuida {
  let resta = arredondarKg(kg);
  const movimentos: SaidaDistribuida['movimentos'] = [];
  for (const l of lotes.filter((x) => x.saldoKg > 0).sort(antesDe)) {
    if (resta <= 0) break;
    const tira = arredondarKg(Math.min(l.saldoKg, resta));
    movimentos.push({ loteId: l.id, quantidadeKg: -tira });
    resta = arredondarKg(resta - tira);
  }
  return { movimentos, faltaKg: Math.max(0, resta) };
}

/** Estoque, assíncrono (navegador de testes em memória hoje; Supabase depois). */
export interface EstoqueRepository {
  /** Lotes de um café (ou de todos) com o saldo atual. */
  lotes(cafeId?: string): Promise<Lote[]>;
  /** Cria o lote e o movimento de entrada de uma vez só. */
  registrarTorra(cafeId: string, dataTorra: string, quantidadeKg: number, observacao?: string): Promise<Lote>;
  /** Grava movimentos já prontos (a saída FIFO chega aqui dividida por lote). */
  registrarMovimentos(movimentos: NovoMovimento[]): Promise<void>;
  movimentos(filtro?: { cafeId?: string; limite?: number }): Promise<Movimento[]>;
}

/** Estoque só em memória (testes). */
export class MemoryEstoqueRepository implements EstoqueRepository {
  private lotesBase: Array<Omit<Lote, 'saldoKg'>> = [];
  private movs: Movimento[] = [];
  private seq = 0;

  private saldo(loteId: string): number {
    return arredondarKg(this.movs.filter((m) => m.loteId === loteId).reduce((s, m) => s + m.quantidadeKg, 0));
  }

  async lotes(cafeId?: string): Promise<Lote[]> {
    return this.lotesBase.filter((l) => !cafeId || l.cafeId === cafeId).map((l) => ({ ...l, saldoKg: this.saldo(l.id) }));
  }

  async registrarTorra(cafeId: string, dataTorra: string, quantidadeKg: number, observacao = ''): Promise<Lote> {
    const erro = erroDoMovimento('torra', quantidadeKg);
    if (erro) throw new Error(erro);
    const lote = { id: newId(), cafeId, dataTorra, criadoEm: `${Date.now()}-${String(++this.seq).padStart(6, '0')}` };
    this.lotesBase.push(lote);
    this.movs.push({ id: newId(), loteId: lote.id, tipo: 'torra', quantidadeKg: arredondarKg(quantidadeKg), data: dataTorra, observacao });
    return { ...lote, saldoKg: arredondarKg(quantidadeKg) };
  }

  async registrarMovimentos(movimentos: NovoMovimento[]): Promise<void> {
    for (const m of movimentos) {
      const erro = erroDoMovimento(m.tipo, m.quantidadeKg);
      if (erro) throw new Error(erro);
      if (!this.lotesBase.some((l) => l.id === m.loteId)) throw new Error('Lote não encontrado.');
    }
    for (const m of movimentos) this.movs.push({ ...m, id: newId(), quantidadeKg: arredondarKg(m.quantidadeKg) });
  }

  async movimentos(filtro: { cafeId?: string; limite?: number } = {}): Promise<Movimento[]> {
    const doCafe = (m: Movimento) => !filtro.cafeId || this.lotesBase.find((l) => l.id === m.loteId)?.cafeId === filtro.cafeId;
    const lista = this.movs.filter(doCafe).reverse();
    return filtro.limite ? lista.slice(0, filtro.limite) : lista;
  }
}
