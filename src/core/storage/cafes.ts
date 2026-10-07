import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CAFES_INICIAIS, semDesde } from '../label/cafes-iniciais.js';
import type { Cafe } from '../label/types.js';
import { readJson, writeJson } from './json-file.js';

export type CafeInput = Omit<Cafe, 'id'>;

export const CAFE_SEED: Cafe = semDesde(CAFES_INICIAIS[0]);

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function sanitizeCafe(raw: Partial<CafeInput>): CafeInput {
  const nome = str(raw.nome);
  if (!nome) throw new Error('Informe o nome do café.');
  return {
    nome,
    notas: str(raw.notas),
    produtor: str(raw.produtor),
    variedade: str(raw.variedade),
    regiao: str(raw.regiao),
    especie: str(raw.especie),
    torra: str(raw.torra),
    ativo: raw.ativo !== false,
  };
}

export class CafeStore {
  private readonly file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'cafes.json');
  }

  private load(): Cafe[] {
    return readJson<Cafe[]>(this.file, () => CAFES_INICIAIS.map(semDesde));
  }

  list(): Cafe[] {
    return this.load();
  }

  get(id: string): Cafe | undefined {
    return this.load().find((c) => c.id === id);
  }

  create(input: Partial<CafeInput>): Cafe {
    const cafe: Cafe = { id: randomUUID(), ...sanitizeCafe(input) };
    writeJson(this.file, [...this.load(), cafe]);
    return cafe;
  }

  update(id: string, input: Partial<CafeInput>): Cafe | undefined {
    const all = this.load();
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) return undefined;
    all[i] = { id, ...sanitizeCafe(input) };
    writeJson(this.file, all);
    return all[i];
  }

  remove(id: string): boolean {
    const all = this.load();
    const rest = all.filter((c) => c.id !== id);
    if (rest.length === all.length) return false;
    writeJson(this.file, rest);
    return true;
  }
}
