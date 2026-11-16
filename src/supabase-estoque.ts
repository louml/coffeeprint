import type { SupabaseClient } from '@supabase/supabase-js';
import { erroDoBanco } from './supabase-cafes.js';
import { arredondarKg, erroDoMovimento, type EstoqueRepository, type Lote, type Movimento, type NovoMovimento, type TipoMovimento } from './estoque.js';

interface LinhaLote {
  lote_id: string;
  cafe_id: string;
  data_torra: string;
  created_at: string;
  saldo_kg: number | string;
}

interface LinhaMovimento {
  id: string;
  lote_id: string;
  tipo: TipoMovimento;
  quantidade_kg: number | string;
  data: string;
  observacao: string;
  lotes_torra?: { cafe_id: string; data_torra: string } | null;
}

export const loteDeLinha = (r: LinhaLote): Lote => ({ id: r.lote_id, cafeId: r.cafe_id, dataTorra: r.data_torra, criadoEm: r.created_at, saldoKg: arredondarKg(Number(r.saldo_kg)) });

export const movimentoDeLinha = (r: LinhaMovimento): Movimento => ({
  id: r.id,
  loteId: r.lote_id,
  tipo: r.tipo,
  quantidadeKg: arredondarKg(Number(r.quantidade_kg)),
  data: r.data,
  observacao: r.observacao,
  cafeId: r.lotes_torra?.cafe_id,
  dataTorra: r.lotes_torra?.data_torra,
});

/** Estoque no Supabase: tabelas `lotes_torra` e `estoque_movimentos`, view `lotes_com_saldo`, função `registrar_torra`. */
export class SupabaseEstoqueRepository implements EstoqueRepository {
  constructor(private readonly db: SupabaseClient) {}

  async lotes(cafeId?: string): Promise<Lote[]> {
    let q = this.db.from('lotes_com_saldo').select('*').order('data_torra').order('created_at');
    if (cafeId) q = q.eq('cafe_id', cafeId);
    const { data, error } = await q;
    if (error) throw erroDoBanco(error);
    return (data as LinhaLote[]).map(loteDeLinha);
  }

  async registrarTorra(cafeId: string, dataTorra: string, quantidadeKg: number, observacao = ''): Promise<Lote> {
    const erro = erroDoMovimento('torra', quantidadeKg);
    if (erro) throw new Error(erro);
    const { data, error } = await this.db.rpc('registrar_torra', { p_cafe_id: cafeId, p_data_torra: dataTorra, p_quantidade_kg: quantidadeKg, p_observacao: observacao });
    if (error) throw erroDoBanco(error);
    return { id: data as string, cafeId, dataTorra, criadoEm: new Date().toISOString(), saldoKg: arredondarKg(quantidadeKg) };
  }

  async registrarMovimentos(movimentos: NovoMovimento[]): Promise<void> {
    for (const m of movimentos) {
      const erro = erroDoMovimento(m.tipo, m.quantidadeKg);
      if (erro) throw new Error(erro);
    }
    if (!movimentos.length) return;
    const linhas = movimentos.map((m) => ({ lote_id: m.loteId, tipo: m.tipo, quantidade_kg: arredondarKg(m.quantidadeKg), data: m.data, observacao: m.observacao }));
    const { error } = await this.db.from('estoque_movimentos').insert(linhas); // uma única instrução: tudo ou nada
    if (error) throw erroDoBanco(error);
  }

  async movimentos(filtro: { cafeId?: string; limite?: number } = {}): Promise<Movimento[]> {
    let q = this.db
      .from('estoque_movimentos')
      .select('id, lote_id, tipo, quantidade_kg, data, observacao, lotes_torra!inner(cafe_id, data_torra)')
      .order('created_at', { ascending: false });
    if (filtro.cafeId) q = q.eq('lotes_torra.cafe_id', filtro.cafeId);
    if (filtro.limite) q = q.limit(filtro.limite);
    const { data, error } = await q;
    if (error) throw erroDoBanco(error);
    return (data as unknown as LinhaMovimento[]).map(movimentoDeLinha);
  }
}
