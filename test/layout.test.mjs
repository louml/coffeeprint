import test from 'node:test';
import assert from 'node:assert/strict';
import { letraEntrega, moagemNoRotulo } from '../build/label/draw.js';
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
  // 4 réguas de 3 pontos de espessura, de margem a margem
  for (const y of [128, 471, 602, 670]) for (const dy of [0, 1, 2]) assert.ok(pontosNaLinha(bmp, y + dy) >= 540, `régua em y=${y + dy} deveria cruzar a etiqueta`);
  assert.ok(pontosNaLinha(bmp, 131) < 300 && pontosNaLinha(bmp, 125) < 300, 'a régua tem só 3 pontos de espessura');
  assert.ok(pontosNaLinha(bmp, 300) < 300, 'no meio do bloco de informações não há linha contínua');
});

test('textos muito longos cabem sem sair da área nem quebrar', async () => {
  const longo = {
    ...arara,
    cafe: { ...arara.cafe, nome: 'Bourbon Amarelo Fazenda Santa Inês Lote Especial', notas: 'Chocolate ao leite, damasco seco, mel, flor de laranjeira e um final longo de caramelo', produtor: 'Cooperativa dos Produtores de Café da Alta Mogiana' },
    cliente: 'Cafeteria e Empório Dona Maria Aparecida de Albuquerque Ltda',
  };
  const bmp = await renderLabel(longo, { selo: false });
  for (const y of [670]) assert.ok(pontosNaLinha(bmp, y) >= 540);
  for (let y = 0; y < 800; y++) for (let b = 0; b < 3; b++) assert.equal(bmp.data[y * 80 + b], 0, `esquerda y=${y}`);
  // sem texto no rodapé acima da última linha: o cliente não invade a área abaixo dela
  assert.ok(pontosNaLinha(bmp, 680) < 10);
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
  for (let y = 170; y < 440; y++) for (let x = 335; x < 600; x++) {
    if (!a.selo(x, y)) continue;
    pretos++;
    if (a.selo(x + 4, y)) repete4++;
    if (a.selo(x + 8, y)) repete8++;
  }
  assert.ok(pretos > 2000, `o selo tem pontos (${pretos})`);
  assert.ok(repete4 / pretos < 0.45, `padrão a 4 px não pode repetir como grade (${(repete4 / pretos).toFixed(2)})`);
  assert.ok(repete8 / pretos < 0.45, `padrão a 8 px não pode repetir como grade (${(repete8 / pretos).toFixed(2)})`);
});

test('selo: densidade de pontos próxima à configurada (cinza claro)', async () => {
  const { selo } = await soSelo();
  // dentro das letras de TORRA LOCAL, a janela mais cheia deve ter ~20% de pontos pretos
  const W = 9;
  let maior = 0;
  for (let y = 175; y < 435; y += W) for (let x = 335; x < 600; x += W) {
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
  const titulo = tinta(20, 75), cliente = tinta(540, 592);
  assert.ok(Math.abs(titulo - cliente) / cliente < 0.03, `título ${titulo} x cliente ${cliente}`);
});

test('moagem: logo abaixo do título, só "Em grãos" ou "Moído" (sem a legenda "Moagem:")', async () => {
  assert.equal(moagemNoRotulo('Grão'), 'Em grãos');
  assert.equal(moagemNoRotulo('Moído'), 'Moído');
  assert.equal(moagemNoRotulo(''), '');
  const grao = await renderLabel({ ...arara, moagem: 'Grão' }, { selo: false });
  const moido = await renderLabel({ ...arara, moagem: 'Moído' }, { selo: false });
  const sem = await renderLabel({ ...arara, moagem: '' }, { selo: false });
  assert.notDeepEqual(grao.data, moido.data);
  assert.notDeepEqual(moido.data, sem.data);
  // a linha logo abaixo do título (y 76-124): espécie colada na esquerda e moagem colada na direita
  const pontaEsquerda = (b) => { for (let x = 0; x < 320; x++) for (let y = 76; y < 124; y++) if (b.data[y * 80 + (x >> 3)] & (0x80 >> (x & 7))) return x; return -1; };
  const pontaDireita = (b) => { let max = -1; for (let y = 76; y < 124; y++) for (let x = 330; x < 640; x++) if (b.data[y * 80 + (x >> 3)] & (0x80 >> (x & 7))) max = Math.max(max, x); return max; };
  for (const b of [grao, moido]) {
    assert.ok(pontaEsquerda(b) >= 44 && pontaEsquerda(b) <= 50, `espécie começa na margem esquerda (${pontaEsquerda(b)})`);
    assert.ok(pontaDireita(b) >= 594 && pontaDireita(b) <= 600, `moagem termina na margem direita (${pontaDireita(b)})`);
  }
  // sem moagem escolhida (pré-visualização) não aparece nada à direita nessa linha
  assert.ok(pontaDireita(sem) < 330 || pontaDireita(sem) === -1, 'sem moagem, o lado direito da linha fica vazio');
  // e a moagem não aparece mais na linha da data de torra (lá fica só a torra)
  const tintaDireita = (b, y0, y1, x0, x1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (b.data[y * 80 + (x >> 3)] & (0x80 >> (x & 7))) n++; return n; };
  assert.equal(tintaDireita(grao, 625, 655, 330, 640), tintaDireita(moido, 625, 655, 330, 640), 'a linha da data não depende da moagem');
});

const tinta2 = (b, x0, y0, x1, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (b.data[y * 80 + (x >> 3)] & (0x80 >> (x & 7))) n++; return n; };
const primeiraELtimaLinhaComTinta = (b) => { let a = -1, z = -1; for (let y = 0; y < 800; y++) if (pontosNaLinha(b, y) > 0) { if (a < 0) a = y; z = y; } return [a, z]; };

test('margens: do título à borda de cima é igual à da última linha à borda de baixo', async () => {
  const bmp = await renderLabel(arara, { selo: false });
  const [a, z] = primeiraELtimaLinhaComTinta(bmp);
  const cima = a, baixo = 799 - z;
  assert.ok(Math.abs(cima - baixo) <= 1, `cima ${cima} x baixo ${baixo}`);
  assert.ok(cima >= 20, 'margem segura para a impressora');
});

test('seções: "Produzido para" vem antes dos dados da torra (data e nível de torra)', async () => {
  const bmp = await renderLabel(arara, { selo: false });
  const banda = (y0, y1) => tinta2(bmp, 40, y0, 400, y1);
  assert.ok(banda(491, 530) > 0 && banda(547, 582) > 300, 'Produzido para e cliente logo abaixo da linha 2 (y 471)');
  assert.ok(banda(629, 651) > 300, 'data de torra depois do cliente');
  assert.equal(banda(606, 626), 0, 'espaço livre entre a linha do cliente e a da data');
});

test('tag de entrega: círculo na linha do "Produzido para" (U, C ou E); sem entrega não aparece', async () => {
  const sem = await renderLabel({ ...arara, entrega: '' }, { selo: false });
  const area = (b) => tinta2(b, 560, 488, 600, 528);
  assert.equal(area(sem), 0, 'sem tag');
  const imgs = {};
  for (const e of ['Uber', 'Coleta', 'Motoboy']) {
    imgs[e] = await renderLabel({ ...arara, entrega: e }, { selo: false });
    // disco de ~33 pontos de diâmetro: pelo menos ~500 pontos pretos (a letra em branco tira uma parte)
    assert.ok(area(imgs[e]) > 500 && area(imgs[e]) < 860, `${e}: ${area(imgs[e])}`);
    // o resto da etiqueta não muda
    assert.equal(tinta2(imgs[e], 0, 0, 640, 480), tinta2(sem, 0, 0, 640, 480));
  }
  assert.notDeepEqual(imgs.Uber.data, imgs.Coleta.data);
  assert.notDeepEqual(imgs.Coleta.data, imgs.Motoboy.data);
  assert.notDeepEqual(imgs.Uber.data, imgs.Motoboy.data);
  assert.equal(letraEntrega('Uber'), 'U');
  assert.equal(letraEntrega('Coleta'), 'C');
  assert.equal(letraEntrega('Motoboy'), 'E');
  assert.equal(letraEntrega(''), '');
  // com cliente de nome longo (2 linhas) a tag continua na linha do "Produzido para"
  const longo = await renderLabel({ ...arara, entrega: 'Uber', cliente: 'Cafeteria e Empório Dona Maria Aparecida de Albuquerque Ltda' }, { selo: false });
  assert.ok(tinta2(longo, 560, 380, 600, 528) > 500);
});

test('selo (1,1x maior) não cobre o texto: o fundo cinza só aparece onde não há tinta', async () => {
  const com = await renderLabel(arara, { selo: true });
  const sem = await renderLabel(arara, { selo: false });
  // toda a tinta do texto continua presente com o selo
  for (let i = 0; i < sem.data.length; i++) assert.equal(sem.data[i] & ~com.data[i], 0, 'o selo nunca apaga tinta do texto');
  // o selo ocupa a área à direita (x 310-600) entre as linhas 1 e 2
  assert.ok(tinta2(com, 310, 150, 600, 450) - tinta2(sem, 310, 150, 600, 450) > 2500);
  assert.equal(tinta2(com, 310, 480, 600, 790), tinta2(sem, 310, 480, 600, 790), 'o selo não passa da linha 2');
});
