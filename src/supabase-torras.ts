import type { SupabaseClient } from '@supabase/supabase-js';
import { erroDoBanco } from './supabase-cafes.js';
import { arredondarKg, erroDaTorra, type NovaTorra, type Torra, type TorraRepository } from './torras.js';

interface LinhaTorra {
  id: string;
  data_torra: string;
  torrador: string;
  created_at: string;
  torra_itens: Array<{ cafe_id: string; quantidade_kg: number | string }>;
}

export const torraDeLinha = (r: LinhaTorra): Torra => ({
  id: r.id,
  dataTorra: r.data_torra,
  torrador: r.torrador,
  criadoEm: r.created_at,
  itens: (r.torra_itens ?? []).map((i) => ({ cafeId: i.cafe_id, quantidadeKg: arredondarKg(Number(i.quantidade_kg)) })),
});

/** Torras no Supabase: tabelas `torras` e `torra_itens`; a gravação usa a função `registrar_torra` (tudo ou nada). */
export class SupabaseTorraRepository implements TorraRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listar(limite = 200): Promise<Torra[]> {
    const { data, error } = await this.db
      .from('torras')
      .select('id, data_torra, torrador, created_at, torra_itens(cafe_id, quantidade_kg)')
      .order('data_torra', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw erroDoBanco(error);
    return (data as unknown as LinhaTorra[]).map(torraDeLinha);
  }

  async registrar(nova: NovaTorra): Promise<Torra> {
    const erro = erroDaTorra(nova);
    if (erro) throw new Error(erro);
    const itens = nova.itens.map((i) => ({ cafe_id: i.cafeId, quantidade_kg: arredondarKg(i.quantidadeKg) }));
    const { data, error } = await this.db.rpc('registrar_torra', { p_data_torra: nova.dataTorra, p_torrador: nova.torrador.trim(), p_itens: itens });
    if (error) throw erroDoBanco(error);
    return { id: data as string, criadoEm: new Date().toISOString(), dataTorra: nova.dataTorra, torrador: nova.torrador.trim(), itens: nova.itens.map((i) => ({ ...i, quantidadeKg: arredondarKg(i.quantidadeKg) })) };
  }
}
