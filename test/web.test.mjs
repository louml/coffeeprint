import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRepository, CafeBook, exportBackup, importBackup } from '../site/js/web/storage.js';
import { camposFaltando, dadosDoPedido } from '../site/js/web/request.js';

class FakeStorage {
  m = new Map();
  getItem(k) { return this.m.get(k) ?? null; }
  setItem(k, v) { this.m.set(k, v); }
  removeItem(k) { this.m.delete(k); }
}

test('web: vem com o café da imagem e persiste entre "reaberturas" do navegador', () => {
  const store = new FakeStorage();
  const a = new CafeBook(new BrowserRepository(store));
  assert.equal(a.list()[0].nome, 'Arara da Mogiana');
  const novo = a.create({ nome: 'Catuaí', notas: 'Mel' });
  const b = new CafeBook(new BrowserRepository(store));
  assert.ok(b.get(novo.id));
  b.update(novo.id, { nome: 'Catuaí', ativo: false });
  assert.equal(new CafeBook(new BrowserRepository(store)).get(novo.id).ativo, false);
  assert.ok(b.remove(novo.id));
  assert.throws(() => b.create({ nome: '  ' }), /nome/);
});

test('web: sem armazenamento o app continua funcionando (só não lembra)', () => {
  const repo = new BrowserRepository(null);
  assert.equal(repo.persistent, false);
  const book = new CafeBook(repo);
  book.create({ nome: 'Teste' });
  assert.equal(book.list().length, 2);
});

test('web: cópia de segurança vai e volta; arquivo inválido é recusado', () => {
  const origem = new BrowserRepository(new FakeStorage());
  new CafeBook(origem).create({ nome: 'Bourbon' });
  origem.saveConfig({ selo: false, modoSemImpressora: true, rotacao: 90 });
  const backup = JSON.parse(JSON.stringify(exportBackup(origem)));

  const destino = new BrowserRepository(new FakeStorage());
  importBackup(destino, backup);
  assert.deepEqual(destino.listCafes().map((c) => c.nome), ['Arara da Mogiana', 'Bourbon']);
  assert.equal(destino.getConfig().rotacao, 90);
  assert.throws(() => importBackup(destino, { qualquer: 'coisa' }), /cópia de segurança/);
  assert.throws(() => importBackup(destino, null), /cópia de segurança/);
});

test('web: validação lista o que falta e monta os dados do rótulo', () => {
  const cafe = new CafeBook(new BrowserRepository(new FakeStorage())).list()[0];
  const vazio = { cliente: '', peso: '', moagem: '', dataTorra: '', copias: 1 };
  assert.deepEqual(camposFaltando(vazio), ['Cliente', 'Café', 'Peso', 'Moagem', 'Data de torra']);
  assert.ok(camposFaltando({ ...vazio, cafe, cliente: 'X', peso: '1kg', moagem: 'Grão', dataTorra: '2026-10-05', copias: 0 })[0].startsWith('Número'));
  const ok = { cafe, cliente: ' Padaria ', peso: '250g', moagem: 'Moído', dataTorra: '2026-10-05', copias: 3 };
  assert.deepEqual(camposFaltando(ok), []);
  const d = dadosDoPedido(ok);
  assert.equal(d.dataTorra, '05/10/2026');
  assert.equal(d.cliente, 'Padaria');
  assert.equal(d.cafe.id, undefined);
});

test('index.html (arquivo único) está atualizado em relação ao código', async () => {
  const { buildSingle } = await import('../scripts/single.mjs');
  const fs = await import('node:fs');
  const atual = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(atual, await buildSingle(), 'index.html está desatualizado: rode "npm run build:single" e faça o commit.');
});
