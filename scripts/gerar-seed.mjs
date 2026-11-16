// Gera supabase/migrations/0002_seed_cafes.sql a partir dos cafés iniciais do app (src/label/cafes-iniciais.ts).
// Uso: npx tsc && node scripts/gerar-seed.mjs
import fs from 'node:fs';
import { CAFES_INICIAIS, semDesde } from '../build/label/cafes-iniciais.js';

const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const linhas = CAFES_INICIAIS.map(semDesde).map(
  (c) => `  (${[c.id, c.nome, c.notas, c.produtor, c.rotuloProdutor ?? '', c.variedade, c.regiao, c.especie, c.torra].map(q).join(', ')}, ${c.ativo !== false})`,
);
const sql = `-- Cafés iniciais do app (gerado por scripts/gerar-seed.mjs; não edite à mão).
insert into public.cafes (legacy_id, nome, notas, produtor, rotulo_produtor, variedade, regiao, especie, torra, ativo)
values
${linhas.join(',\n')}
on conflict (legacy_id) do nothing;
`;
fs.writeFileSync(new URL('../supabase/migrations/0002_seed_cafes.sql', import.meta.url), sql);
console.log(`${linhas.length} cafés`);
