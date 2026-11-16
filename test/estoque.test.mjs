import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryEstoqueRepository, distribuirSaida, erroDoMovimento, loteAtual, parseKg } from '../build/estoque.js';
import { CafeBook, MemoryCafeRepository } from '../build/storage.js';

const lote = (id, dataTorra, saldoKg, criadoEm = '1') => ({ id, cafeId: 'a', dataTorra, criadoEm, saldoKg });

test('estoque: parseKg lê pesos digitados em português', () => {
  assert.equal(parseKg('0,5'), 0.5);
  assert.equal(parseKg('2'), 2);
  assert.equal(parseKg('1.250,5'), 1250.5);
  assert.equal(parseKg(' 3,25 kg '), 3.25);
  assert.equal(parseKg('1.5'), 1.5);
  for (const ruim of ['', 'abc', '0', '-1', '1,2,3', '1e3']) assert.equal(parseKg(ruim), null, ruim);
});

test('estoque: sinal por tipo de movimento (as mesmas regras do banco)', () => {
  assert.equal(erroDoMovimento('torra', 10), null);
  assert.match(erroDoMovimento('torra', -1), /positiva/);
  assert.equal(erroDoMovimento('venda', -2), null);
  assert.match(erroDoMovimento('venda', 2), /reduzem/);
  assert.match(erroDoMovimento('perda', 0.5), /reduzem/);
  assert.equal(erroDoMovimento('ajuste', 1), null);
  assert.equal(erroDoMovimento('ajuste', -1), null);
  assert.match(erroDoMovimento('ajuste', 0), /zero/);
});

test('estoque: o lote em uso é o mais antigo que ainda tem saldo (FIFO)', () => {
  const novo = lote('novo', '2026-11-08', 8);
  const antigo = lote('antigo', '2026-11-01', 1);
  assert.equal(loteAtual([novo, antigo]).id, 'antigo');
  assert.equal(loteAtual([novo, lote('antigo', '2026-11-01', 0)]).id, 'novo', 'lote zerado é pulado');
  assert.equal(loteAtual([lote('x', '2026-11-01', 0)]), undefined, 'sem saldo em nenhum lote');
  assert.equal(loteAtual([]), undefined);
  // mesma data: o cadastrado primeiro sai primeiro
  assert.equal(loteAtual([lote('b', '2026-11-01', 5, '2'), lote('a', '2026-11-01', 5, '1')]).id, 'a');
});

test('estoque: uma saída maior que o lote antigo é dividida entre os lotes', () => {
  const lotes = [lote('novo', '2026-11-08', 8), lote('antigo', '2026-11-01', 1)];
  const { movimentos, faltaKg } = distribuirSaida(lotes, 3);
  assert.deepEqual(movimentos, [{ loteId: 'antigo', quantidadeKg: -1 }, { loteId: 'novo', quantidadeKg: -2 }]);
  assert.equal(faltaKg, 0);
  const so = distribuirSaida(lotes, 0.5);
  assert.deepEqual(so.movimentos, [{ loteId: 'antigo', quantidadeKg: -0.5 }]);
  const demais = distribuirSaida(lotes, 10);
  assert.equal(demais.faltaKg, 1, 'sobram 1 kg que não existem em estoque');
  assert.deepEqual(demais.movimentos.map((m) => m.quantidadeKg), [-1, -8]);
  assert.equal(distribuirSaida([], 2).faltaKg, 2);
});

test('estoque (em memória): torras, vendas FIFO e a data da etiqueta passando para o lote seguinte', async () => {
  const est = new MemoryEstoqueRepository();
  await est.registrarTorra('geisha', '2026-11-01', 10);
  await est.registrarTorra('geisha', '2026-11-08', 8);
  await est.registrarTorra('outro', '2026-10-01', 5);
  const dataAtual = async () => loteAtual(await est.lotes('geisha'))?.dataTorra;
  assert.equal(await dataAtual(), '2026-11-01');

  const vende = async (kg) => {
    const r = distribuirSaida(await est.lotes('geisha'), kg);
    await est.registrarMovimentos(r.movimentos.map((m) => ({ ...m, tipo: 'venda', data: '2026-11-10', observacao: '' })));
    return r;
  };
  await vende(9);
  const apos9 = await est.lotes('geisha');
  assert.deepEqual(apos9.map((l) => l.saldoKg), [1, 8]);
  assert.equal(await dataAtual(), '2026-11-01');
  const r = await vende(3); // 1 kg do antigo + 2 kg do novo
  assert.equal(r.movimentos.length, 2);
  assert.equal(await dataAtual(), '2026-11-08');
  assert.deepEqual((await est.lotes('geisha')).map((l) => l.saldoKg), [0, 6]);
  assert.equal((await est.lotes('outro'))[0].saldoKg, 5, 'outros cafés não são afetados');
  assert.equal((await est.movimentos({ cafeId: 'geisha' })).length, 5);
  assert.equal((await est.movimentos({ limite: 2 })).length, 2);
});

test('estoque (em memória): recusa movimentos inválidos', async () => {
  const est = new MemoryEstoqueRepository();
  await assert.rejects(() => est.registrarTorra('a', '2026-11-01', -1), /positiva/);
  const l = await est.registrarTorra('a', '2026-11-01', 2);
  await assert.rejects(() => est.registrarMovimentos([{ loteId: l.id, tipo: 'venda', quantidadeKg: 1, data: '2026-11-01', observacao: '' }]), /reduzem/);
  await assert.rejects(() => est.registrarMovimentos([{ loteId: 'nao-existe', tipo: 'venda', quantidadeKg: -1, data: '2026-11-01', observacao: '' }]), /Lote/);
  assert.equal((await est.lotes())[0].saldoKg, 2, 'nada foi gravado');
});

test('cafés (em memória): o mesmo CafeBook funciona com qualquer repositório', async () => {
  const book = new CafeBook(new MemoryCafeRepository());
  assert.equal((await book.list()).length, 19);
  const c = await book.create({ nome: 'Novo' });
  assert.equal((await book.get(c.id)).nome, 'Novo');
  await book.update(c.id, { nome: 'Novo', ativo: false });
  assert.equal((await book.get(c.id)).ativo, false);
  assert.equal(await book.remove(c.id), true);
  assert.equal(await book.remove(c.id), false);
  await assert.rejects(async () => book.create({ nome: ' ' }), /nome/);
});
