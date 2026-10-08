import { formatDate } from './label/format.js';
import type { DadosRotulo } from './label/types.js';
import type { Cafe } from './storage.js';

export interface Pedido {
  cafe?: Cafe;
  cliente: string;
  peso: string;
  moagem: string;
  /** AAAA-MM-DD */
  dataTorra: string;
  copias: number;
}

export const PESOS = ['100g', '250g', '500g', '1kg'];
export const MOAGENS = ['Grão', 'Moído'];

/** Nomes dos campos obrigatórios que ainda faltam. */
export function camposFaltando(p: Pedido): string[] {
  const f: string[] = [];
  if (!p.cliente.trim()) f.push('Cliente');
  if (!p.cafe) f.push('Café');
  if (!PESOS.includes(p.peso)) f.push('Peso');
  if (!MOAGENS.includes(p.moagem)) f.push('Moagem');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dataTorra)) f.push('Data de torra');
  if (!Number.isInteger(p.copias) || p.copias < 1 || p.copias > 500) f.push('Número de cópias (1 a 500)');
  return f;
}

export function dadosDoPedido(p: Pedido): DadosRotulo | null {
  if (!p.cafe) return null;
  const { id: _id, ativo: _ativo, ...cafe } = p.cafe;
  return { cafe, cliente: p.cliente.trim(), peso: p.peso, moagem: p.moagem, dataTorra: p.dataTorra ? formatDate(p.dataTorra) : '' };
}

/** Cafés em ordem alfabética (e, no mesmo nome, por torra). */
export function ordenarCafes<T extends Pick<Cafe, 'nome' | 'torra'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.torra.localeCompare(b.torra, 'pt-BR'));
}

/**
 * Texto de cada café na lista da tela. Cafés com o mesmo nome (por exemplo, o mesmo café em duas torras)
 * recebem a torra entre parênteses para poderem ser distinguidos. O que é impresso no rótulo não muda.
 */
export function textoNaLista(cafe: Pick<Cafe, 'id' | 'nome' | 'torra'>, todos: Array<Pick<Cafe, 'id' | 'nome'>>): string {
  const igual = (n: string) => n.trim().toLocaleLowerCase('pt-BR');
  const repetido = todos.some((c) => c.id !== cafe.id && igual(c.nome) === igual(cafe.nome));
  return repetido && cafe.torra ? `${cafe.nome} (${cafe.torra})` : cafe.nome;
}
