import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseCafeRepository, cafeDeLinha, erroDoBanco, linhaDeCafe } from '../build/supabase-cafes.js';
import { SupabaseTorraRepository, torraDeLinha } from '../build/supabase-torras.js';

const cafe = { nome: 'Geisha', notas: 'Mel', produtor: 'Daniela', rotuloProdutor: 'Produtora', variedade: 'Geisha', regiao: 'Mogiana', especie: '100% Arábica', torra: 'Torra média', ativo: true };

test('banco: café vai e volta entre o formato do app e o da tabela', () => {
  const linha = linhaDeCafe(cafe);
  assert.equal(linha.rotulo_produtor, 'Produtora');
  assert.deepEqual(cafeDeLinha({ id: 'u1', ...linha }), { id: 'u1', ...cafe });
  assert.equal(linhaDeCafe({ ...cafe, rotuloProdutor: undefined }).rotulo_produtor, '', 'sem título do produtor vira texto vazio');
});

test('banco: erros do Supabase viram mensagens para a equipe', () => {
  assert.match(erroDoBanco({ message: 'x', code: '23503' }).message, /lotes de estoque.*Desativar/);
  assert.match(erroDoBanco({ message: 'new row violates row-level security policy' }).message, /Sem permissão/);
  assert.match(erroDoBanco({ message: 'Failed to fetch' }).message, /Sem conexão/);
  assert.equal(erroDoBanco({ message: 'outro erro' }).message, 'outro erro');
});

test('banco: torra e seus cafés (numeric chega como texto ou número)', () => {
  const t = torraDeLinha({ id: 't1', data_torra: '2026-11-18', torrador: 'Ana', created_at: 'x', torra_itens: [{ cafe_id: 'c1', quantidade_kg: '7.500' }, { cafe_id: 'c2', quantidade_kg: 4 }] });
  assert.deepEqual(t, { id: 't1', dataTorra: '2026-11-18', torrador: 'Ana', criadoEm: 'x', itens: [{ cafeId: 'c1', quantidadeKg: 7.5 }, { cafeId: 'c2', quantidadeKg: 4 }] });
  assert.deepEqual(torraDeLinha({ id: 't2', data_torra: '2026-11-18', torrador: 'Ana', created_at: 'x', torra_itens: null }).itens, []);
});

// cliente de mentira que grava as chamadas e devolve respostas prontas
const falso = (resposta) => {
  const chamadas = [];
  const q = (nome) => new Proxy({}, {
    get: (_, prop) => prop === 'then' ? (ok) => ok(resposta(nome, chamadas)) : (...args) => { chamadas.push([nome, prop, ...args]); return q(nome); },
  });
  return { chamadas, db: { from: (t) => { chamadas.push(['from', t]); return q(t); }, rpc: (...a) => { chamadas.push(['rpc', ...a]); return q('rpc'); } } };
};

test('banco: importar só acrescenta cafés (upsert por legacy_id, ignorando os que já existem)', async () => {
  const { db, chamadas } = falso(() => ({ data: null, error: null }));
  await new SupabaseCafeRepository(db).importar([{ id: 'geisha', ...cafe }]);
  const up = chamadas.find((c) => c[1] === 'upsert');
  assert.equal(up[2][0].legacy_id, 'geisha');
  assert.deepEqual(up[3], { onConflict: 'legacy_id', ignoreDuplicates: true });
});

test('banco: registrar torra chama a função atômica e recusa dados incompletos antes de ir à rede', async () => {
  const { db, chamadas } = falso(() => ({ data: 'torra-nova', error: null }));
  const repo = new SupabaseTorraRepository(db);
  const t = await repo.registrar({ dataTorra: '2026-11-18', torrador: ' Ana ', itens: [{ cafeId: 'c1', quantidadeKg: 7.5 }, { cafeId: 'c2', quantidadeKg: 4 }] });
  assert.equal(t.id, 'torra-nova');
  assert.deepEqual(chamadas.find((c) => c[0] === 'rpc'), ['rpc', 'registrar_torra', { p_data_torra: '2026-11-18', p_torrador: 'Ana', p_itens: [{ cafe_id: 'c1', quantidade_kg: 7.5 }, { cafe_id: 'c2', quantidade_kg: 4 }] }]);
  const antes = chamadas.length;
  await assert.rejects(() => repo.registrar({ dataTorra: '2026-11-18', torrador: '', itens: [{ cafeId: 'c1', quantidadeKg: 1 }] }), /quem torrou/);
  assert.equal(chamadas.length, antes, 'nada foi enviado ao banco');
});
