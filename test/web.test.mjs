import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRepository, CafeBook, exportBackup, importBackup } from '../site/js/web/storage.js';
import { camposFaltando, dadosDoPedido, ordenarCafes, textoNaLista } from '../site/js/web/request.js';

class FakeStorage {
  m = new Map();
  getItem(k) { return this.m.get(k) ?? null; }
  setItem(k, v) { this.m.set(k, v); }
  removeItem(k) { this.m.delete(k); }
}

test('web: vem com o café da imagem e persiste entre "reaberturas" do navegador', () => {
  const store = new FakeStorage();
  const a = new CafeBook(new BrowserRepository(store));
  assert.deepEqual(a.list().map((c) => c.nome), ['Arara da Mogiana', 'Blend Imperador', 'Blend Dois Catuaís', 'Bourbon Vermelho', 'Campeão', 'Catuaí da Mogiana', 'Catucaí', 'Doce Cerrado', 'Doce Cerrado', 'Fermentado Cacau', 'Moca Arara', 'Mundo Novo', 'Paulista Amarelo', 'Fermentado Framboesa', 'Geisha', 'Laurina', 'Paulista Vermelho', 'Topázio Fermentado', 'Topázio']);
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
  assert.equal(book.list().length, 20);
});

test('web: cópia de segurança vai e volta; arquivo inválido é recusado', () => {
  const origem = new BrowserRepository(new FakeStorage());
  new CafeBook(origem).create({ nome: 'Bourbon' });
  origem.saveConfig({ selo: false, modoSemImpressora: true, rotacao: 90 });
  const backup = JSON.parse(JSON.stringify(exportBackup(origem)));

  const destino = new BrowserRepository(new FakeStorage());
  importBackup(destino, backup);
  assert.equal(destino.listCafes().at(-1).nome, 'Bourbon');
  assert.equal(destino.listCafes().length, 20);
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

test('web: quem já usava o app recebe os cafés novos sem perder nem recriar nada', () => {
  const store = new FakeStorage();
  // estado de uma versão antiga: Arara editada + um café próprio, sem marcação de versão
  store.setItem('torralocal.cafes.v1', JSON.stringify([
    { id: 'arara-da-mogiana', nome: 'Arara (editada)', notas: '', produtor: '', variedade: '', regiao: '', especie: '', torra: '', ativo: true },
    { id: 'meu-cafe', nome: 'Meu café', notas: '', produtor: '', variedade: '', regiao: '', especie: '', torra: '', ativo: false },
  ]));
  const repo = new BrowserRepository(store);
  const nomes = repo.listCafes().map((c) => c.nome);
  assert.equal(nomes.length, 20);
  assert.deepEqual(nomes.slice(0, 3), ['Arara (editada)', 'Meu café', 'Blend Imperador']);
  assert.equal(repo.listCafes().find((c) => c.id === 'meu-cafe').ativo, false);
  // depois da migração, o que o usuário apagar fica apagado
  new CafeBook(repo).remove('campeao');
  assert.equal(new BrowserRepository(store).listCafes().some((c) => c.id === 'campeao'), false);
  assert.equal(new BrowserRepository(store).listCafes().length, 19);
});

test('web: quem tinha apagado a Arara não a recebe de volta', () => {
  const store = new FakeStorage();
  store.setItem('torralocal.cafes.v1', JSON.stringify([{ id: 'x', nome: 'Só este', notas: '', produtor: '', variedade: '', regiao: '', especie: '', torra: '', ativo: true }]));
  const ids = new BrowserRepository(store).listCafes().map((c) => c.id);
  assert.equal(ids.includes('arara-da-mogiana'), false);
  assert.equal(ids.includes('blend-imperador'), true);
});

test('web: de qualquer versão anterior da lista, o usuário recebe só os cafés que faltam, sem duplicar', async () => {
  const { CAFES_INICIAIS, SEED_VERSION } = await import('../site/js/core/label/cafes-iniciais.js');
  assert.equal(CAFES_INICIAIS.length, 19);
  for (let v = 1; v < SEED_VERSION; v++) {
    const store = new FakeStorage();
    const tinha = CAFES_INICIAIS.filter((c) => c.desde <= v).map(({ desde, ...c }) => c);
    store.setItem('torralocal.cafes.v1', JSON.stringify(tinha));
    if (v > 1) store.setItem('torralocal.seed.v1', String(v));
    const ids = new BrowserRepository(store).listCafes().map((c) => c.id);
    assert.equal(ids.length, 19, `da versão ${v}`);
    assert.equal(new Set(ids).size, 19, `sem duplicados, da versão ${v}`);
  }
});

test('web: o título do campo produtor ("Produtora") vai do cadastro ao rótulo e sobrevive ao backup', () => {
  const repo = new BrowserRepository(new FakeStorage());
  const geisha = repo.listCafes().find((c) => c.id === 'geisha');
  assert.equal(geisha.rotuloProdutor, 'Produtora');
  assert.equal(dadosDoPedido({ cafe: geisha, cliente: 'X', peso: '250g', moagem: 'Grão', dataTorra: '2026-10-05', copias: 1 }).cafe.rotuloProdutor, 'Produtora');
  const outro = new BrowserRepository(new FakeStorage());
  importBackup(outro, JSON.parse(JSON.stringify(exportBackup(repo))));
  assert.equal(outro.listCafes().find((c) => c.id === 'geisha').rotuloProdutor, 'Produtora');
  // um café editado sem preencher o título volta ao padrão "Produtor"
  const book = new CafeBook(repo);
  book.update('geisha', { ...geisha, rotuloProdutor: '' });
  assert.equal(book.get('geisha').rotuloProdutor, '');
});

test('web: cafés de mesmo nome se distinguem pela torra na lista e a lista é ordenada', () => {
  const lista = new BrowserRepository(new FakeStorage()).listCafes();
  const medias = lista.filter((c) => c.nome === 'Doce Cerrado');
  assert.deepEqual(medias.map((c) => textoNaLista(c, lista)).sort(), ['Doce Cerrado (Torra média clara)', 'Doce Cerrado (Torra média)']);
  assert.equal(textoNaLista(lista.find((c) => c.id === 'campeao'), lista), 'Campeão');
  assert.deepEqual(ordenarCafes(lista).slice(0, 3).map((c) => c.nome), ['Arara da Mogiana', 'Blend Dois Catuaís', 'Blend Imperador']);
});
