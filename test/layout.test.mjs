import test from 'node:test';
import assert from 'node:assert/strict';
import { rotateBitmap } from '../build/label/rotate.js';
import { arara, pontosNaLinha, renderLabel } from './helpers/render-node.mjs';

test('rótulo: 640x800 pontos, 1 bit, e o selo muda a imagem', async () => {
  const com = await renderLabel(arara, { selo: true });
  const sem = await renderLabel(arara, { selo: false });
  assert.equal(com.width, 640);
  assert.equal(com.height, 800);
  assert.equal(com.data.length, 80 * 800);
  assert.notDeepEqual(com.data, sem.data);
  // faixa de segurança: nada impresso nos 24 pontos da esquerda (o selo só sangra à direita)
  for (let y = 0; y < 800; y++) for (let b = 0; b < 3; b++) assert.equal(sem.data[y * 80 + b], 0, `esquerda y=${y}`);
});

test('rótulo segue o modelo: linhas horizontais nas posições certas', async () => {
  const bmp = await renderLabel(arara, { selo: false });
  for (const y of [106, 423, 534, 659]) assert.ok(pontosNaLinha(bmp, y) >= 540, `linha em y=${y} deveria cruzar a etiqueta`);
  assert.ok(pontosNaLinha(bmp, 300) < 300, 'no meio do bloco de informações não há linha contínua');
});

test('textos muito longos cabem sem sair da área nem quebrar', async () => {
  const longo = {
    ...arara,
    cafe: { ...arara.cafe, nome: 'Bourbon Amarelo Fazenda Santa Inês Lote Especial', notas: 'Chocolate ao leite, damasco seco, mel, flor de laranjeira e um final longo de caramelo', produtor: 'Cooperativa dos Produtores de Café da Alta Mogiana' },
    cliente: 'Cafeteria e Empório Dona Maria Aparecida de Albuquerque Ltda',
  };
  const bmp = await renderLabel(longo, { selo: false });
  for (const y of [659]) assert.ok(pontosNaLinha(bmp, y) >= 540);
  for (let y = 0; y < 800; y++) for (let b = 0; b < 3; b++) assert.equal(bmp.data[y * 80 + b], 0, `esquerda y=${y}`);
  // sem texto no rodapé acima da última linha: o cliente não invade a área abaixo dela
  assert.ok(pontosNaLinha(bmp, 662) < 10);
});

test('título do campo produtor ("Produtora") muda o rótulo', async () => {
  const a = await renderLabel(arara, { selo: false });
  const b = await renderLabel({ ...arara, cafe: { ...arara.cafe, rotuloProdutor: 'Produtora' } }, { selo: false });
  assert.notDeepEqual(a.data, b.data);
});

test('rotação gira a imagem no sentido horário', () => {
  const b = { width: 3, height: 2, bytesPerRow: 1, data: new Uint8Array([0x80, 0x00]) }; // só (0,0) preto
  const preto = (r, x, y) => (r.data[y * r.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
  const r90 = rotateBitmap(b, 90);
  assert.deepEqual([r90.width, r90.height], [2, 3]);
  assert.ok(preto(r90, 1, 0));
  assert.ok(preto(rotateBitmap(b, 180), 2, 1));
  const r270 = rotateBitmap(b, 270);
  assert.deepEqual([r270.width, r270.height], [2, 3]);
  assert.ok(preto(r270, 0, 2));
  const volta = rotateBitmap(rotateBitmap(rotateBitmap(rotateBitmap(b, 90), 90), 90), 90);
  assert.deepEqual([...volta.data], [...b.data]);
});

/** Pontos pretos que pertencem só ao selo (diferença entre o rótulo com e sem selo). */
async function soSelo() {
  const com = await renderLabel(arara, { selo: true });
  const sem = await renderLabel(arara, { selo: false });
  const preto = (b, x, y) => x >= 0 && x < 640 && y >= 0 && y < 800 && (b.data[y * 80 + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
  return { com, sem, selo: (x, y) => preto(com, x, y) && !preto(sem, x, y) };
}

test('selo: pontilhado orgânico (sem grade regular) e sempre igual para o mesmo rótulo', async () => {
  const a = await soSelo();
  const b = await renderLabel(arara, { selo: true });
  assert.deepEqual(a.com.data, b.data, 'mesmo rótulo, mesma imagem (tela e impressão iguais)');
  // Em grade regular (tramado ordenado), o ponto a 4 pixels de distância repete o padrão quase sempre.
  let pretos = 0, repete4 = 0, repete8 = 0;
  for (let y = 100; y < 560; y++) for (let x = 250; x < 600; x++) {
    if (!a.selo(x, y)) continue;
    pretos++;
    if (a.selo(x + 4, y)) repete4++;
    if (a.selo(x + 8, y)) repete8++;
  }
  assert.ok(pretos > 5000, `o selo tem pontos (${pretos})`);
  assert.ok(repete4 / pretos < 0.45, `padrão a 4 px não pode repetir como grade (${(repete4 / pretos).toFixed(2)})`);
  assert.ok(repete8 / pretos < 0.45, `padrão a 8 px não pode repetir como grade (${(repete8 / pretos).toFixed(2)})`);
});

test('selo: densidade de pontos próxima à configurada (cinza claro)', async () => {
  const { selo } = await soSelo();
  // dentro das letras de TORRA LOCAL, a janela mais cheia deve ter ~20% de pontos pretos
  const W = 9;
  let maior = 0;
  for (let y = 150; y < 320; y += W) for (let x = 270; x < 440; x += W) {
    let n = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) if (selo(x + i, y + j)) n++;
    maior = Math.max(maior, n / (W * W));
  }
  assert.ok(maior > 0.15 && maior < 0.30, `densidade máxima ${maior.toFixed(2)} fora do esperado`);
});

test('nome do café e nome do cliente têm o mesmo tamanho e o mesmo peso', async () => {
  // mesma frase nos dois lugares: a tinta (e portanto tamanho e peso) deve ser igual
  const frase = 'Eliezer Ramos';
  const bmp = await renderLabel({ ...arara, cafe: { ...arara.cafe, nome: frase }, cliente: frase, peso: '' }, { selo: false });
  const tinta = (y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) n += pontosNaLinha(bmp, y); return n; };
  const titulo = tinta(40, 95), cliente = tinta(590, 640);
  assert.ok(Math.abs(titulo - cliente) / cliente < 0.03, `título ${titulo} x cliente ${cliente}`);
});
