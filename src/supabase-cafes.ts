import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cafe, CafeInput, CafeRepository } from './storage.js';

interface LinhaCafe {
  id: string;
  nome: string;
  notas: string;
  produtor: string;
  rotulo_produtor: string;
  variedade: string;
  regiao: string;
  especie: string;
  torra: string;
  ativo: boolean;
}

export const cafeDeLinha = (r: LinhaCafe): Cafe => ({
  id: r.id,
  nome: r.nome,
  notas: r.notas,
  produtor: r.produtor,
  rotuloProdutor: r.rotulo_produtor,
  variedade: r.variedade,
  regiao: r.regiao,
  especie: r.especie,
  torra: r.torra,
  ativo: r.ativo,
});

export const linhaDeCafe = (c: CafeInput) => ({
  nome: c.nome,
  notas: c.notas,
  produtor: c.produtor,
  rotulo_produtor: c.rotuloProdutor ?? '',
  variedade: c.variedade,
  regiao: c.regiao,
  especie: c.especie,
  torra: c.torra,
  ativo: c.ativo,
});

/** Transforma o erro do banco em uma mensagem para a equipe. */
export function erroDoBanco(e: { message: string; code?: string }): Error {
  if (e.code === '23503') return new Error('Este café já tem lotes de estoque e não pode ser removido. Use "Desativar".');
  if (e.code === '42501' || /row-level security|permission denied|jwt/i.test(e.message)) return new Error('Sem permissão: entre de novo com o login da equipe.');
  if (/failed to fetch|network|load failed/i.test(e.message)) return new Error('Sem conexão com a internet.');
  return new Error(e.message);
}

/** Cafés guardados no Supabase (tabela `cafes`). */
export class SupabaseCafeRepository implements CafeRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<Cafe[]> {
    const { data, error } = await this.db.from('cafes').select('*').order('nome');
    if (error) throw erroDoBanco(error);
    return (data as LinhaCafe[]).map(cafeDeLinha);
  }

  async create(input: CafeInput): Promise<Cafe> {
    const { data, error } = await this.db.from('cafes').insert(linhaDeCafe(input)).select().single();
    if (error) throw erroDoBanco(error);
    return cafeDeLinha(data as LinhaCafe);
  }

  async update(id: string, input: CafeInput): Promise<Cafe | undefined> {
    const { data, error } = await this.db.from('cafes').update(linhaDeCafe(input)).eq('id', id).select().maybeSingle();
    if (error) throw erroDoBanco(error);
    return data ? cafeDeLinha(data as LinhaCafe) : undefined;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from('cafes').delete().eq('id', id).select('id');
    if (error) throw erroDoBanco(error);
    return (data?.length ?? 0) > 0;
  }

  /** Adiciona os cafés que ainda não existem (pelo id antigo, `legacy_id`); nunca apaga nem sobrescreve o que já está no banco. */
  async importar(cafes: Cafe[]): Promise<void> {
    const linhas = cafes.map((c) => ({ legacy_id: c.id, ...linhaDeCafe(c) }));
    if (!linhas.length) return;
    const { error } = await this.db.from('cafes').upsert(linhas, { onConflict: 'legacy_id', ignoreDuplicates: true });
    if (error) throw erroDoBanco(error);
  }
}
