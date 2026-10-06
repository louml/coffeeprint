import { formatDate } from '../core/label/format.js';
import type { DadosRotulo } from '../core/label/types.js';
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
