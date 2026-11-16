import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseCafeRepository, cafeDeLinha, erroDoBanco, linhaDeCafe } from '../build/supabase-cafes.js';
import { SupabaseEstoqueRepository, loteDeLinha, movimentoDeLinha } from '../build/supabase-estoque.js';

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

test('banco: lotes e movimentos (numeric chega como texto ou número)', () => {
  assert.deepEqual(loteDeLinha({ lote_id: 'l1', cafe_id: 'c1', data_torra: '2026-11-01', created_at: 't', saldo_kg: '8.500' }), { id: 'l1', cafeId: 'c1', dataTorra: '2026-11-01', criadoEm: 't', saldoKg: 8.5 });
  const m = movimentoDeLinha({ id: 'm1', lote_id: 'l1', tipo: 'venda', quantidade_kg: -2.5, data: '2026-11-02', observacao: '', lotes_torra: { cafe_id: 'c1', data_torra: '2026-11-01' } });
  assert.equal(m.quantidadeKg, -2.5);
  assert.equal(m.cafeId, 'c1');
  assert.equal(m.dataTorra, '2026-11-01');
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

test('banco: registrar torra chama a função atômica e recusa quantidade inválida antes de ir à rede', async () => {
  const { db, chamadas } = falso(() => ({ data: 'lote-novo', error: null }));
  const est = new SupabaseEstoqueRepository(db);
  const lote = await est.registrarTorra('c1', '2026-11-01', 10, 'obs');
  assert.equal(lote.id, 'lote-novo');
  assert.deepEqual(chamadas.find((c) => c[0] === 'rpc'), ['rpc', 'registrar_torra', { p_cafe_id: 'c1', p_data_torra: '2026-11-01', p_quantidade_kg: 10, p_observacao: 'obs' }]);
  const antes = chamadas.length;
  await assert.rejects(() => est.registrarTorra('c1', '2026-11-01', -1), /positiva/);
  await assert.rejects(() => est.registrarMovimentos([{ loteId: 'l', tipo: 'venda', quantidadeKg: 1, data: '2026-11-01', observacao: '' }]), /reduzem/);
  assert.equal(chamadas.length, antes, 'nada foi enviado ao banco');
});
