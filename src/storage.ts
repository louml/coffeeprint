import { CAFES_INICIAIS, SEED_VERSION, semDesde } from './label/cafes-iniciais.js';
import type { Cafe } from './label/types.js';
import type { Rotacao } from './label/rotate.js';
import type { ItemFila } from './fila.js';

export type { Cafe };
export type CafeInput = Omit<Cafe, 'id'>;

export interface Config {
  selo: boolean;
  /** Em vez de imprimir, baixa o rótulo como imagem PNG (testes). */
  modoSemImpressora: boolean;
  /** Giro aplicado só na impressão (etiqueta deitada no rolo). */
  rotacao: Rotacao;
  /** Ajuste vertical da impressão em mm: positivo sobe o conteúdo na etiqueta (compensa onde a impressora começa a imprimir). */
  ajusteVertical: number;
}

export const DEFAULT_CONFIG: Config = { selo: true, modoSemImpressora: false, rotacao: 0, ajusteVertical: 1 };

const KEY_CAFES = 'torralocal.cafes.v1';
const KEY_CONFIG = 'torralocal.config.v1';
const KEY_SEED = 'torralocal.seed.v1';
const KEY_FILA = 'torralocal.fila.v1';
const KEY_CACHE_CAFES = 'torralocal.cache.cafes.v1';

/**
 * Dados que ficam só neste computador/navegador: configurações da impressora e fila de impressão.
 * (Os cafés e o estoque vão para o banco: veja CafeRepository e EstoqueRepository.)
 */
export interface LocalStore {
  getConfig(): Config;
  saveConfig(config: Config): void;
  /** Fila de impressão (itens ainda por imprimir). Não entra na cópia de segurança. */
  getFila(): ItemFila[];
  saveFila(fila: ItemFila[]): void;
}

/**
 * Cadastro de cafés, assíncrono e por registro (serve tanto para o navegador quanto para o banco de dados).
 * Quem usa nunca grava "a lista inteira": cada operação mexe só no café indicado.
 */
export interface CafeRepository {
  list(): Promise<Cafe[]>;
  create(input: CafeInput): Promise<Cafe>;
  update(id: string, input: CafeInput): Promise<Cafe | undefined>;
  remove(id: string): Promise<boolean>;
  /** Aplica uma lista de cafés vinda de cópia de segurança ou de outro lugar. No navegador substitui tudo; no banco só acrescenta o que falta. */
  importar(cafes: Cafe[]): Promise<void>;
}

export class BrowserRepository implements LocalStore {
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
    if (!saved) {
      const todos = CAFES_INICIAIS.map(semDesde);
      this.saveCafes(todos);
      return todos;
    }
    // Quem já tinha cafés salvos recebe só os que entraram na lista depois (versão ausente = 1).
    const versao = this.read<number>(KEY_SEED, 1);
    if (versao < SEED_VERSION) {
      const ids = new Set(saved.map((c) => c.id));
      const novos = CAFES_INICIAIS.filter((c) => c.desde > versao && !ids.has(c.id)).map(semDesde);
      const lista = [...saved, ...novos];
      this.saveCafes(lista);
      return lista;
    }
    return saved;
  }
  saveCafes(cafes: Cafe[]): void {
    this.write(KEY_CAFES, cafes);
    this.write(KEY_SEED, SEED_VERSION); // a lista salva passa a ser a que vale (inclusive ao restaurar um backup)
  }
  getConfig(): Config {
    return { ...DEFAULT_CONFIG, ...this.read<Partial<Config>>(KEY_CONFIG, {}) };
  }
  saveConfig(config: Config): void {
    this.write(KEY_CONFIG, config);
  }
  /** Última lista de cafés vinda do banco: deixa o app consultável quando não há internet. */
  lerCacheCafes(): { em: string; cafes: Cafe[] } | null {
    const c = this.read<{ em?: string; cafes?: Cafe[] } | null>(KEY_CACHE_CAFES, null);
    return c && typeof c.em === 'string' && Array.isArray(c.cafes) ? { em: c.em, cafes: c.cafes } : null;
  }
  salvarCacheCafes(cafes: Cafe[]): void {
    this.write(KEY_CACHE_CAFES, { em: new Date().toISOString(), cafes });
  }
  limparCacheCafes(): void {
    this.write(KEY_CACHE_CAFES, null);
  }
  getFila(): ItemFila[] {
    const fila = this.read<ItemFila[]>(KEY_FILA, []);
    return Array.isArray(fila) ? fila : [];
  }
  saveFila(fila: ItemFila[]): void {
    this.write(KEY_FILA, fila);
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
    rotuloProdutor: str(raw.rotuloProdutor),
    variedade: str(raw.variedade),
    regiao: str(raw.regiao),
    especie: str(raw.especie),
    torra: str(raw.torra),
    ativo: raw.ativo !== false,
  };
}

/** Cafés guardados no navegador (localStorage), com a lista de cafés iniciais. Provisório: o Supabase substitui isto. */
export class BrowserCafeRepository implements CafeRepository {
  constructor(private readonly store: BrowserRepository) {}
  async list(): Promise<Cafe[]> {
    return this.store.listCafes();
  }
  async create(input: CafeInput): Promise<Cafe> {
    const cafe: Cafe = { id: newId(), ...input };
    this.store.saveCafes([...this.store.listCafes(), cafe]);
    return cafe;
  }
  async update(id: string, input: CafeInput): Promise<Cafe | undefined> {
    const all = this.store.listCafes();
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) return undefined;
    all[i] = { id, ...input };
    this.store.saveCafes(all);
    return all[i];
  }
  async remove(id: string): Promise<boolean> {
    const all = this.store.listCafes();
    const rest = all.filter((c) => c.id !== id);
    if (rest.length === all.length) return false;
    this.store.saveCafes(rest);
    return true;
  }
  async importar(cafes: Cafe[]): Promise<void> {
    this.store.saveCafes(cafes);
  }
}

/** Cafés só em memória (testes). Começa com os cafés iniciais, a menos que se passe outra lista. */
export class MemoryCafeRepository implements CafeRepository {
  private cafes: Cafe[];
  constructor(inicial: Cafe[] = CAFES_INICIAIS.map(semDesde)) {
    this.cafes = inicial.map((c) => ({ ...c }));
  }
  async list(): Promise<Cafe[]> {
    return this.cafes.map((c) => ({ ...c }));
  }
  async create(input: CafeInput): Promise<Cafe> {
    const cafe: Cafe = { id: newId(), ...input };
    this.cafes.push(cafe);
    return { ...cafe };
  }
  async update(id: string, input: CafeInput): Promise<Cafe | undefined> {
    const i = this.cafes.findIndex((c) => c.id === id);
    if (i < 0) return undefined;
    this.cafes[i] = { id, ...input };
    return { ...this.cafes[i] };
  }
  async remove(id: string): Promise<boolean> {
    const n = this.cafes.length;
    this.cafes = this.cafes.filter((c) => c.id !== id);
    return this.cafes.length !== n;
  }
  async importar(cafes: Cafe[]): Promise<void> {
    this.cafes = cafes.map((c) => ({ ...c }));
  }
}

/** Cadastro de cafés: valida os dados (sanitizeCafe) e delega ao repositório. */
export class CafeBook {
  constructor(private readonly repo: CafeRepository) {}
  list(): Promise<Cafe[]> {
    return this.repo.list();
  }
  async get(id: string): Promise<Cafe | undefined> {
    return (await this.list()).find((c) => c.id === id);
  }
  create(input: Partial<CafeInput>): Promise<Cafe> {
    return this.repo.create(sanitizeCafe(input));
  }
  update(id: string, input: Partial<CafeInput>): Promise<Cafe | undefined> {
    return this.repo.update(id, sanitizeCafe(input));
  }
  remove(id: string): Promise<boolean> {
    return this.repo.remove(id);
  }
}

// ---- cópia de segurança (arquivo .json)

export interface Backup {
  app: 'torralocal-rotulos';
  versao: 1;
  cafes: Cafe[];
  config: Config;
}

export function exportBackup(cafes: Cafe[], config: Config): Backup {
  return { app: 'torralocal-rotulos', versao: 1, cafes, config };
}

/** Valida e aplica um backup. Lança erro com mensagem em português se o arquivo não servir. */
export async function importBackup(cafes: CafeRepository, store: LocalStore, raw: unknown): Promise<void> {
  const b = raw as Partial<Backup>;
  if (!b || b.app !== 'torralocal-rotulos' || !Array.isArray(b.cafes)) {
    throw new Error('Este arquivo não é uma cópia de segurança do app.');
  }
  const lista: Cafe[] = b.cafes.map((c, i) => ({
    id: typeof c?.id === 'string' && c.id ? c.id : newId() + i,
    ...sanitizeCafe(c ?? {}),
  }));
  await cafes.importar(lista);
  if (b.config) store.saveConfig({ ...DEFAULT_CONFIG, ...b.config });
}
