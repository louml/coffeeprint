import path from 'node:path';
import { readJson, writeJson } from './json-file.js';

export interface Config {
  /** IP ou nome da impressora na rede, opcionalmente com :porta (padrão 9100). */
  enderecoImpressora: string;
  /** Selo gráfico de fundo ligado? */
  selo: boolean;
  /** Modo sem impressora: salva o rótulo como imagem na pasta "saida". */
  modoSemImpressora: boolean;
}

export const DEFAULT_CONFIG: Config = { enderecoImpressora: '', selo: true, modoSemImpressora: false };

export class ConfigStore {
  private readonly file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'config.json');
  }

  get(): Config {
    return { ...DEFAULT_CONFIG, ...readJson<Partial<Config>>(this.file, () => DEFAULT_CONFIG) };
  }

  update(patch: Partial<Config>): Config {
    const cur = this.get();
    const next: Config = {
      enderecoImpressora: typeof patch.enderecoImpressora === 'string' ? patch.enderecoImpressora.trim() : cur.enderecoImpressora,
      selo: typeof patch.selo === 'boolean' ? patch.selo : cur.selo,
      modoSemImpressora: typeof patch.modoSemImpressora === 'boolean' ? patch.modoSemImpressora : cur.modoSemImpressora,
    };
    writeJson(this.file, next);
    return next;
  }
}
