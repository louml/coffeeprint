import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryTorraRepository, erroDaTorra, parseKg } from '../build/torras.js';

const ok = { dataTorra: '2026-11-18', torrador: 'Ana', itens: [{ cafeId: 'a', quantidadeKg: 7.5 }, { cafeId: 'b', quantidadeKg: 4 }] };

test('torra: parseKg lê pesos digitados em português', () => {
  assert.equal(parseKg('0,5'), 0.5);
  assert.equal(parseKg('2'), 2);
  assert.equal(parseKg('1.250,5'), 1250.5);
  assert.equal(parseKg(' 3,25 kg '), 3.25);
  for (const ruim of ['', 'abc', '0', '-1', '1,2,3', '1e3']) assert.equal(parseKg(ruim), null, ruim);
});

test('torra: todos os campos são obrigatórios (data, quem torrou, café e quantidade de cada linha)', () => {
  assert.equal(erroDaTorra(ok), null);
  assert.match(erroDaTorra({ ...ok, dataTorra: '' }), /data/);
  assert.match(erroDaTorra({ ...ok, dataTorra: '18/11/2026' }), /data/);
  assert.match(erroDaTorra({ ...ok, torrador: '   ' }), /quem torrou/);
  assert.match(erroDaTorra({ ...ok, itens: [] }), /ao menos um café/);
  assert.match(erroDaTorra({ ...ok, itens: [{ cafeId: '', quantidadeKg: 1 }] }), /café da linha 1/);
  assert.match(erroDaTorra({ ...ok, itens: [{ cafeId: 'a', quantidadeKg: 1 }, { cafeId: 'b', quantidadeKg: 0 }] }), /quantidade.*linha 2/);
  assert.match(erroDaTorra({ ...ok, itens: [{ cafeId: 'a', quantidadeKg: NaN }] }), /quantidade/);
  assert.match(erroDaTorra({ ...ok, itens: [{ cafeId: 'a', quantidadeKg: 1 }, { cafeId: 'a', quantidadeKg: 2 }] }), /duas vezes/);
});

test('torra (em memória): registra, lista a mais recente primeiro e recusa torra incompleta', async () => {
  const repo = new MemoryTorraRepository();
  await repo.registrar({ ...ok, dataTorra: '2026-11-10' });
  await repo.registrar({ ...ok, dataTorra: '2026-11-18', torrador: ' Bruno ' });
  await repo.registrar({ ...ok, dataTorra: '2026-11-18', torrador: 'Carla' });
  const lista = await repo.listar();
  assert.deepEqual(lista.map((t) => [t.dataTorra, t.torrador]), [['2026-11-18', 'Carla'], ['2026-11-18', 'Bruno'], ['2026-11-10', 'Ana']]);
  assert.equal(lista[0].itens.length, 2);
  assert.equal((await repo.listar(1)).length, 1);
  await assert.rejects(() => repo.registrar({ ...ok, torrador: '' }), /quem torrou/);
  assert.equal((await repo.listar()).length, 3, 'a torra inválida não foi gravada');
});
