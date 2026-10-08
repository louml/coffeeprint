import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('assets/torra-local.ico é um ícone do Windows válido, com vários tamanhos', () => {
  const b = fs.readFileSync(new URL('../assets/torra-local.ico', import.meta.url));
  assert.equal(b.readUInt16LE(0), 0, 'reservado');
  assert.equal(b.readUInt16LE(2), 1, 'tipo: ícone');
  const n = b.readUInt16LE(4);
  assert.ok(n >= 5);
  const tamanhos = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + i * 16;
    tamanhos.push(b[e] || 256);
    const len = b.readUInt32LE(e + 8), off = b.readUInt32LE(e + 12);
    assert.ok(off >= 6 + 16 * n && off + len <= b.length, `entrada ${i} dentro do arquivo`);
  }
  for (const t of [16, 32, 48, 256]) assert.ok(tamanhos.includes(t), `tem o tamanho ${t}`);
});
