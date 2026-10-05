import fs from 'node:fs';
import path from 'node:path';

/** Lê um JSON; se não existir, grava e devolve `fallback`. Arquivo corrompido vira .corrompido-<data>. */
export function readJson<T>(file: string, fallback: () => T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      fs.renameSync(file, `${file}.corrompido-${Date.now()}`);
      console.error(`Arquivo ${file} estava corrompido; guardei uma cópia e recomecei com os valores padrão.`);
    }
    const value = fallback();
    writeJson(file, value);
    return value;
  }
}

/** Grava de forma atômica (arquivo temporário + rename) para não corromper se faltar energia. */
export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
