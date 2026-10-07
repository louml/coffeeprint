import type { Rotacao } from '../core/label/rotate.js';

export interface Cafe {
  id: string;
  nome: string;
  notas: string;
  produtor: string;
  variedade: string;
  regiao: string;
  especie: string;
  torra: string;
  ativo: boolean;
}
export type CafeInput = Omit<Cafe, 'id'>;

export interface Config {
  selo: boolean;
  /** Em vez de imprimir, baixa o rótulo como imagem PNG (testes). */
  modoSemImpressora: boolean;
  /** Giro aplicado só na impressão (etiqueta deitada no rolo). */
  rotacao: Rotacao;
}

export const CAFE_SEED: Cafe = {
  id: 'arara-da-mogiana',
  nome: 'Arara da Mogiana',
  notas: 'Ameixa e caramelo',
  produtor: 'Luís Sordi',
  variedade: 'Arara',
  regiao: 'Média Mogiana',
  especie: '100% Arábica',
  torra: 'Torra média',
  ativo: true,
};
export const DEFAULT_CONFIG: Config = { selo: true, modoSemImpressora: false, rotacao: 0 };

const KEY_CAFES = 'torralocal.cafes.v1';
const KEY_CONFIG = 'torralocal.config.v1';

/**
 * Onde os dados ficam guardados. Hoje: no próprio navegador deste computador.
 * Para sincronizar na nuvem no futuro, basta outra implementação desta interface.
 */
export interface Repository {
  listCafes(): Cafe[];
  saveCafes(cafes: Cafe[]): void;
  getConfig(): Config;
  saveConfig(config: Config): void;
}

export class BrowserRepository implements Repository {
  /** false se o navegador bloqueou o armazenamento: o app funciona, mas não lembra nada. */
  persistent = true;
  private memory = new Map<string, string>();

  constructor(private readonly store: Storage | null = tryStorage()) {
    if (!store) this.persistent = false;
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.store?.getItem(key) ?? this.memory.get(key) ?? null;
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private write(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    try {
      this.store?.setItem(key, raw);
    } catch {
      this.persistent = false;
    }
  }

  listCafes(): Cafe[] {
    const saved = this.read<Cafe[] | null>(KEY_CAFES, null);
    if (saved) return saved;
    this.saveCafes([CAFE_SEED]);
    return [CAFE_SEED];
  }
  saveCafes(cafes: Cafe[]): void {
    this.write(KEY_CAFES, cafes);
  }
  getConfig(): Config {
    return { ...DEFAULT_CONFIG, ...this.read<Partial<Config>>(KEY_CONFIG, {}) };
  }
  saveConfig(config: Config): void {
    this.write(KEY_CONFIG, config);
  }
}

function tryStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('torralocal.teste', '1');
    s.removeItem('torralocal.teste');
    return s;
  } catch {
    return null;
  }
}

/** crypto.randomUUID só existe em contexto seguro; em alguns navegadores/arquivos locais precisa de plano B. */
export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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

/** Cadastro de cafés sobre qualquer Repository. */
export class CafeBook {
  constructor(private readonly repo: Repository) {}
  list(): Cafe[] {
    return this.repo.listCafes();
  }
  get(id: string): Cafe | undefined {
    return this.list().find((c) => c.id === id);
  }
  create(input: Partial<CafeInput>): Cafe {
    const cafe: Cafe = { id: newId(), ...sanitizeCafe(input) };
    this.repo.saveCafes([...this.list(), cafe]);
    return cafe;
  }
  update(id: string, input: Partial<CafeInput>): Cafe | undefined {
    const all = this.list();
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) return undefined;
    all[i] = { id, ...sanitizeCafe(input) };
    this.repo.saveCafes(all);
    return all[i];
  }
  remove(id: string): boolean {
    const all = this.list();
    const rest = all.filter((c) => c.id !== id);
    if (rest.length === all.length) return false;
    this.repo.saveCafes(rest);
    return true;
  }
}

// ---- cópia de segurança (arquivo .json)

export interface Backup {
  app: 'torralocal-rotulos';
  versao: 1;
  cafes: Cafe[];
  config: Config;
}

export function exportBackup(repo: Repository): Backup {
  return { app: 'torralocal-rotulos', versao: 1, cafes: repo.listCafes(), config: repo.getConfig() };
}

/** Valida e aplica um backup. Lança erro com mensagem em português se o arquivo não servir. */
export function importBackup(repo: Repository, raw: unknown): void {
  const b = raw as Partial<Backup>;
  if (!b || b.app !== 'torralocal-rotulos' || !Array.isArray(b.cafes)) {
    throw new Error('Este arquivo não é uma cópia de segurança do app.');
  }
  const cafes: Cafe[] = b.cafes.map((c, i) => ({
    id: typeof c?.id === 'string' && c.id ? c.id : newId() + i,
    ...sanitizeCafe(c ?? {}),
  }));
  repo.saveCafes(cafes);
  if (b.config) repo.saveConfig({ ...DEFAULT_CONFIG, ...b.config });
}
