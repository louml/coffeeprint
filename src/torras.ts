import { newId } from './storage.js';

/**
 * Controle de torra: histórico de torras. Cada torra tem a data, quem torrou e os cafés torrados com a quantidade (kg) de cada um.
 * Todos esses campos são obrigatórios.
 */
export interface ItemTorra {
  cafeId: string;
  quantidadeKg: number;
}

export interface NovaTorra {
  /** AAAA-MM-DD */
  dataTorra: string;
  torrador: string;
  itens: ItemTorra[];
}

export interface Torra extends NovaTorra {
  id: string;
  criadoEm: string;
}

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

/** Confere os campos obrigatórios da torra. Devolve a mensagem do primeiro problema ou null se estiver tudo certo. */
export function erroDaTorra(t: NovaTorra): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dataTorra)) return 'Informe a data da torra.';
  if (!t.torrador.trim()) return 'Informe quem torrou.';
  if (!t.itens.length) return 'Informe ao menos um café torrado.';
  const vistos = new Set<string>();
  for (const [i, it] of t.itens.entries()) {
    if (!it.cafeId) return `Escolha o café da linha ${i + 1}.`;
    if (!Number.isFinite(it.quantidadeKg) || it.quantidadeKg <= 0) return `Informe a quantidade em kg da linha ${i + 1}.`;
    if (vistos.has(it.cafeId)) return 'O mesmo café aparece duas vezes. Some as quantidades em uma linha só.';
    vistos.add(it.cafeId);
  }
  return null;
}

/** Histórico de torras (assíncrono: Supabase no app, memória nos testes). */
export interface TorraRepository {
  /** Mais recentes primeiro. */
  listar(limite?: number): Promise<Torra[]>;
  registrar(torra: NovaTorra): Promise<Torra>;
}

/** Torras só em memória (testes). */
export class MemoryTorraRepository implements TorraRepository {
  private torras: Torra[] = [];
  async listar(limite = 200): Promise<Torra[]> {
    return [...this.torras]
      .sort((a, b) => b.dataTorra.localeCompare(a.dataTorra) || b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, limite)
      .map((t) => ({ ...t, itens: t.itens.map((i) => ({ ...i })) }));
  }
  async registrar(nova: NovaTorra): Promise<Torra> {
    const erro = erroDaTorra(nova);
    if (erro) throw new Error(erro);
    const torra: Torra = {
      id: newId(),
      criadoEm: `${Date.now()}-${String(this.torras.length).padStart(6, '0')}`,
      dataTorra: nova.dataTorra,
      torrador: nova.torrador.trim(),
      itens: nova.itens.map((i) => ({ cafeId: i.cafeId, quantidadeKg: arredondarKg(i.quantidadeKg) })),
    };
    this.torras.push(torra);
    return torra;
  }
}
