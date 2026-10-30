import test from 'node:test';
import assert from 'node:assert/strict';
import { FilaDeImpressao, LIMITE_ETIQUETAS, dadosDoItem, totalEtiquetas } from '../build/fila.js';
import { dadosDoPedido } from '../build/request.js';
import { BrowserRepository, CafeBook, exportBackup } from '../build/storage.js';

class FakeStorage {
  m = new Map();
  getItem(k) { return this.m.get(k) ?? null; }
  setItem(k, v) { this.m.set(k, v); }
  removeItem(k) { this.m.delete(k); }
}
const novo = () => { const store = new FakeStorage(); const repo = new BrowserRepository(store); return { store, repo, fila: new FilaDeImpressao(repo), cafes: repo.listCafes() }; };
const pedido = (cafe, extra = {}) => ({ cafe, cliente: 'Padaria Pão Quente', peso: '250g', moagem: 'Grão', entrega: '', dataTorra: '2026-10-05', copias: 3, ...extra });

test('fila: adiciona itens em ordem e soma as etiquetas', () => {
  const { fila, cafes } = novo();
  fila.adicionar(pedido(cafes[0], { cliente: 'Ana', copias: 2 }));
  fila.adicionar(pedido(cafes[1], { cliente: 'Bia', copias: 3 }));
  fila.adicionar(pedido(cafes[2], { cliente: 'Cris', copias: 1 }));
  assert.deepEqual(fila.list().map((i) => i.cliente), ['Ana', 'Bia', 'Cris']);
  assert.equal(fila.total(), 6);
  assert.equal(totalEtiquetas(fila.list()), 6);
});

test('fila: sobrevive a fechar e reabrir o navegador (mesmo armazenamento)', () => {
  const { store, fila, cafes } = novo();
  fila.adicionar(pedido(cafes[0], { cliente: 'Ana' }));
  const depois = new FilaDeImpressao(new BrowserRepository(store));
  assert.deepEqual(depois.list().map((i) => i.cliente), ['Ana']);
});

test('fila: o item guarda o rótulo como foi visto (editar o café depois não muda o item)', () => {
  const { repo, fila, cafes } = novo();
  const item = fila.adicionar(pedido(cafes[0]));
  new CafeBook(repo).update(cafes[0].id, { ...cafes[0], nome: 'Nome novo', notas: 'Outras notas' });
  const d = dadosDoItem(fila.list()[0]);
  assert.equal(d.cafe.nome, cafes[0].nome);
  assert.equal(d.dataTorra, '05/10/2026');
  assert.deepEqual(d, dadosDoPedido(pedido(cafes[0])), 'igual ao que a pré-visualização desenhou');
  assert.equal(item.cafeId, cafes[0].id);
});

test('fila: cópias por item (mínimo 1) e limite total de etiquetas', () => {
  const { fila, cafes } = novo();
  const a = fila.adicionar(pedido(cafes[0], { copias: 300 }));
  assert.throws(() => fila.adicionar(pedido(cafes[1], { copias: 201 })), new RegExp(String(LIMITE_ETIQUETAS)));
  assert.equal(fila.list().length, 1, 'o que passou do limite não entra');
  const b = fila.adicionar(pedido(cafes[1], { copias: 200 }));
  assert.equal(fila.total(), LIMITE_ETIQUETAS);
  assert.equal(fila.alterarCopias(b.id, 999), 200, 'não passa do limite');
  assert.equal(fila.alterarCopias(a.id, 0), 1, 'mínimo 1');
  assert.equal(fila.alterarCopias(a.id, 5), 5);
  assert.equal(fila.alterarCopias('inexistente', 2), undefined);
  assert.throws(() => fila.adicionar(pedido(cafes[1], { copias: 0 })), /cópias/);
});

test('fila: remover devolve o item (para editar) e limpar esvazia', () => {
  const { fila, cafes } = novo();
  const a = fila.adicionar(pedido(cafes[0], { cliente: 'Ana' }));
  fila.adicionar(pedido(cafes[1], { cliente: 'Bia' }));
  const tirado = fila.remover(a.id);
  assert.equal(tirado.cliente, 'Ana');
  assert.deepEqual(fila.list().map((i) => i.cliente), ['Bia']);
  assert.equal(fila.remover(a.id), undefined);
  fila.limpar();
  assert.deepEqual(fila.list(), []);
});

test('fila: depois de enviada, adicionar começa uma fila nova', () => {
  const { fila, cafes } = novo();
  fila.adicionar(pedido(cafes[0], { cliente: 'Ana' }));
  fila.adicionar(pedido(cafes[1], { cliente: 'Bia' }));
  fila.marcarEnviadas();
  assert.ok(fila.list().every((i) => i.enviado), 'ficam na lista, marcados');
  assert.equal(fila.list().length, 2);
  fila.adicionar(pedido(cafes[2], { cliente: 'Cris' }));
  assert.deepEqual(fila.list().map((i) => i.cliente), ['Cris']);
  assert.equal(fila.list()[0].enviado, undefined);
});

test('fila: armazenamento corrompido vira fila vazia, e a fila fica fora da cópia de segurança', () => {
  const { store, repo, fila } = novo();
  store.setItem('torralocal.fila.v1', '{isso não é json');
  assert.deepEqual(fila.list(), []);
  store.setItem('torralocal.fila.v1', JSON.stringify({ nao: 'é lista' }));
  assert.deepEqual(fila.list(), []);
  assert.deepEqual(Object.keys(exportBackup(repo)).sort(), ['app', 'cafes', 'config', 'versao']);
});

test('fila: sem armazenamento o app funciona (a fila só dura até fechar a página)', () => {
  const repo = new BrowserRepository(null);
  const fila = new FilaDeImpressao(repo);
  fila.adicionar(pedido(repo.listCafes()[0]));
  assert.equal(fila.list().length, 1);
});
