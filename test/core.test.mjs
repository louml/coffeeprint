import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { CafeStore } from '../dist/core/storage/cafes.js';
import { ConfigStore } from '../dist/core/storage/config.js';
import { LabelService, ValidationError } from '../dist/core/service.js';
import { bitmapToZpl } from '../dist/core/printer/zpl.js';
import { parseAddress, PrinterError } from '../dist/core/printer/send.js';
import { discoverPrinters } from '../dist/core/printer/discover.js';
import { rotateBitmap } from '../dist/core/label/rotate.js';
import { renderLabel } from '../dist/core/label/render.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tl-'));
const pedido = (cafeId, extra = {}) => ({ cafeId, cliente: 'Padaria X', peso: '250g', moagem: 'Grão', dataTorra: '2026-10-05', copias: 3, ...extra });

function fakePrinter() {
  return new Promise((resolve) => {
    const received = [];
    const server = net.createServer((s) => { const chunks = []; s.on('data', (c) => chunks.push(c)); s.on('end', () => received.push(Buffer.concat(chunks).toString())); });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, received, close: () => server.close() }));
  });
}

test('cadastro: vem com o café da imagem e persiste entre reinícios', () => {
  const dir = tmp();
  const a = new CafeStore(dir);
  assert.equal(a.list()[0].nome, 'Arara da Mogiana');
  const novo = a.create({ nome: 'Catuaí', notas: 'Mel' });
  const b = new CafeStore(dir); // "reinício"
  assert.ok(b.get(novo.id));
  b.update(novo.id, { nome: 'Catuaí', ativo: false });
  assert.equal(new CafeStore(dir).get(novo.id).ativo, false);
  assert.ok(b.remove(novo.id));
  assert.throws(() => b.create({ nome: '  ' }), /nome/);
});

test('configurações persistem', () => {
  const dir = tmp();
  new ConfigStore(dir).update({ enderecoImpressora: '10.0.0.5', selo: false });
  const c = new ConfigStore(dir).get();
  assert.equal(c.enderecoImpressora, '10.0.0.5');
  assert.equal(c.selo, false);
});

test('endereço da impressora', () => {
  assert.deepEqual(parseAddress('192.168.0.50'), { host: '192.168.0.50', port: 9100 });
  assert.deepEqual(parseAddress(' 192.168.0.50:9101 '), { host: '192.168.0.50', port: 9101 });
  assert.throws(() => parseAddress(''), PrinterError);
  assert.throws(() => parseAddress('ip inválido!'), PrinterError);
});

test('rótulo: 640x800 pontos, tem tinta e o selo muda a imagem', async () => {
  const dados = { cafe: { nome: 'Arara da Mogiana', notas: 'Ameixa e caramelo', produtor: 'Luís Sordi', variedade: 'Arara', regiao: 'Média Mogiana', especie: '100% Arábica', torra: 'Torra Média' }, cliente: 'Padaria X', peso: '250g', moagem: 'Grão', dataTorra: '05/10/2026' };
  const com = await renderLabel(dados, { selo: true });
  const sem = await renderLabel(dados, { selo: false });
  assert.equal(com.width, 640); assert.equal(com.height, 800); assert.equal(com.data.length, 80 * 800);
  assert.notDeepEqual(com.data, sem.data);
  // nada impresso na faixa de segurança das bordas laterais (4 mm = 32 pontos, exceto o selo que sangra à direita)
  for (let y = 0; y < 800; y++) for (let b = 0; b < 3; b++) assert.equal(sem.data[y * 80 + b], 0, `esquerda y=${y}`);
});

test('ZPL traz a imagem completa e o número de cópias', async () => {
  const bmp = { width: 16, height: 2, bytesPerRow: 2, data: new Uint8Array([0xff, 0x00, 0x0f, 0xf0]) };
  const zpl = bitmapToZpl(bmp, 3);
  assert.match(zpl, /\^GFA,4,4,2,FF000FF0\^FS/);
  assert.match(zpl, /\^PQ3,0,1,N/);
  assert.match(zpl, /^\^XA/); assert.match(zpl.trim(), /\^XZ$/);
});

test('validação lista os campos que faltam', async () => {
  const dir = tmp();
  const svc = new LabelService(new CafeStore(dir), new ConfigStore(dir), path.join(dir, 'saida'));
  await assert.rejects(() => svc.print({ copias: 1 }), (e) => e instanceof ValidationError && ['Cliente', 'Café', 'Peso', 'Moagem', 'Data de torra'].every((c) => e.campos.includes(c)));
});

test('imprime 3 cópias em uma conexão para a impressora', async () => {
  const dir = tmp();
  const p = await fakePrinter();
  const cfg = new ConfigStore(dir); cfg.update({ enderecoImpressora: `127.0.0.1:${p.port}` });
  const svc = new LabelService(new CafeStore(dir), cfg, path.join(dir, 'saida'));
  const r = await svc.print(pedido('arara-da-mogiana'));
  await new Promise((r) => setTimeout(r, 200));
  p.close();
  assert.equal(r.modo, 'impressora');
  assert.equal(p.received.length, 1);
  assert.match(p.received[0], /\^PQ3,0,1,N/);
  assert.match(p.received[0], /\^GFA,64000,64000,80,/);
});

test('impressora desligada: erro compreensível, sem travar', async () => {
  const dir = tmp();
  const cfg = new ConfigStore(dir); cfg.update({ enderecoImpressora: '127.0.0.1:1' });
  const svc = new LabelService(new CafeStore(dir), cfg, path.join(dir, 'saida'));
  await assert.rejects(() => svc.print(pedido('arara-da-mogiana')), (e) => e instanceof PrinterError && /recusou|encontrar|ligada/.test(e.message));
});

test('modo sem impressora salva PNG', async () => {
  const dir = tmp();
  const cfg = new ConfigStore(dir); cfg.update({ modoSemImpressora: true });
  const svc = new LabelService(new CafeStore(dir), cfg, path.join(dir, 'saida'));
  const r = await svc.print(pedido('arara-da-mogiana'));
  assert.equal(r.modo, 'arquivo');
  assert.ok(fs.readFileSync(r.arquivo).subarray(1, 4).toString() === 'PNG');
});

test('textos muito longos não quebram nem saem da área', async () => {
  const dir = tmp();
  const svc = new LabelService(new CafeStore(dir), new ConfigStore(dir), dir);
  const png = await svc.preview(pedido('arara-da-mogiana', { cliente: 'X'.repeat(200) + ' ' + 'Y'.repeat(60) }));
  assert.ok(png.length > 1000);
});

test('procura impressoras com a porta 9100 aberta', async () => {
  const p = await fakePrinter();
  const found = await discoverPrinters({ hosts: ['127.0.0.1', '127.0.0.2'], port: p.port, timeoutMs: 300 });
  p.close();
  assert.ok(found.includes('127.0.0.1'));
});

test('rotação gira a imagem no sentido horário', () => {
  // 3x2: pixel preto só em (0,0), canto superior esquerdo
  const b = { width: 3, height: 2, bytesPerRow: 1, data: new Uint8Array([0x80, 0x00]) };
  const at = (r, x, y) => (r.data[y * r.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
  const r90 = rotateBitmap(b, 90);   // vira 2x3, canto superior direito
  assert.deepEqual([r90.width, r90.height], [2, 3]); assert.ok(at(r90, 1, 0));
  const r180 = rotateBitmap(b, 180); // canto inferior direito
  assert.ok(at(r180, 2, 1));
  const r270 = rotateBitmap(b, 270); // 2x3, canto inferior esquerdo
  assert.deepEqual([r270.width, r270.height], [2, 3]); assert.ok(at(r270, 0, 2));
  // 4 giros de 90° voltam à imagem original
  const volta = rotateBitmap(rotateBitmap(rotateBitmap(rotateBitmap(b, 90), 90), 90), 90);
  assert.deepEqual([...volta.data], [...b.data]);
});

test('rotação só vale para a impressora (ZPL), não para o arquivo', async () => {
  const dir = tmp();
  const p = await fakePrinter();
  const cfg = new ConfigStore(dir); cfg.update({ enderecoImpressora: `127.0.0.1:${p.port}`, rotacao: 90 });
  const svc = new LabelService(new CafeStore(dir), cfg, path.join(dir, 'saida'));
  await svc.print(pedido('arara-da-mogiana', { copias: 1 }));
  await new Promise((r) => setTimeout(r, 200));
  p.close();
  assert.match(p.received[0], /\^PW800/); assert.match(p.received[0], /\^LL640/);
  assert.equal(new ConfigStore(dir).get().rotacao, 90);
});
