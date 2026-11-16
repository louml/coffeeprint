# Plano: banco de dados (Supabase TorraLocal360) + estoque de café torrado por lote + data de torra automática nas etiquetas

> **Status: plano salvo para leitura posterior — NÃO implementar agora.** Quando for executado, todo o trabalho vai numa **nova branch `v2`** (criada a partir da `v1`); `main` (MVP) e `v1` não são alteradas.

## Context
O gerador de etiquetas (branch `v1`, arquivo único `index.html`, TypeScript sem framework, dados em `localStorage`) vai virar uma plataforma maior de controle de suprimentos, principalmente café torrado. Os cafés passam a ser cadastrados no banco (Supabase) e compartilhados entre computadores/navegadores; uma tabela separada controla o estoque de cada café **por lote de torra** (cada lote tem sua data de torra), e a **data de torra impressa na etiqueta passa a vir do estoque**, sem o usuário escolher a data.

Decisões do usuário:
- **Estoque:** livro de movimentações em **kg**, agrupado por **lote** (cada torra cria um lote com data; saldo do lote = soma dos seus movimentos).
- **Data na etiqueta:** regra **FIFO** — usa-se o lote **mais antigo que ainda tem saldo > 0**; quando ele acaba, passa para o próximo. Ex.: o café A tem um lote quase no fim e outro torrado depois → a etiqueta usa a data do lote antigo até zerar, depois a do novo.
- **Acesso:** **um login compartilhado** da equipe (Supabase Auth, cadastro público desligado).
- **Fila de impressão e configurações da impressora:** continuam **locais** em cada computador.
- **Imprimir etiqueta não baixa estoque** nesta fase. Consequência: o saldo do lote só diminui quando alguém registra uma venda/perda/ajuste na aba Estoque; se isso não for feito, a etiqueta continua com a data do lote antigo. A interface deixa isso claro (mostra "Lote de DD/MM, X kg restantes" no formulário).

Base de código reaproveitada: toda persistência passa por `Repository` (`src/storage.ts`) e `FilaDeImpressao` (`src/fila.ts`); desenho (`src/label/draw.ts`), impressão (`src/print.ts`), validação (`src/request.ts`) e UI não mudam. O desenho já recebe a data pronta (`DadosRotulo.dataTorra`), então só muda **de onde a data vem** (hoje o campo `#data` em `src/index.html`/`pedido()` em `src/app.ts`).

## 1. Banco de dados (Supabase) — `supabase/migrations/0001_cafes_estoque.sql`
Aplicado pelo usuário no SQL Editor do projeto (o agente não acessa o Supabase). Estrutura:

- **`cafes`**: `id uuid pk default gen_random_uuid()`, `legacy_id text unique` (id antigo para migração), `nome text not null`, `notas`, `produtor`, `rotulo_produtor`, `variedade`, `regiao`, `especie`, `torra` (text, default ''), `ativo boolean default true`, `created_at`, `updated_at` (trigger). Espelha `Cafe` de `src/label/types.ts`.
- **`lotes_torra`**: `id uuid pk`, `cafe_id uuid not null references cafes on delete restrict`, `data_torra date not null`, `observacao text`, `created_at`. Um lote por torra (mesmo café pode ter vários, inclusive na mesma data). Índice `(cafe_id, data_torra, created_at)`.
- **`estoque_movimentos`** (livro-razão): `id uuid pk`, `lote_id uuid not null references lotes_torra on delete restrict`, `tipo text check (tipo in ('torra','venda','perda','ajuste'))`, `quantidade_kg numeric(10,3) not null check (quantidade_kg <> 0)` com sinal (`torra` > 0; `venda`/`perda` < 0; `ajuste` qualquer; check por tipo), `data date default current_date`, `observacao`, `created_at`. Registrar uma torra = criar o lote + o movimento `torra` na mesma operação (função SQL `registrar_torra(cafe_id, data_torra, kg)` chamada via `rpc`, atômica).
- **View `lotes_com_saldo`** (`security_invoker = true`): `lote_id, cafe_id, data_torra, saldo_kg = sum(quantidade_kg)`.
- **View `estoque_atual`** (`security_invoker = true`): por café, `saldo_kg` = soma dos lotes, `lote_atual_id`/`data_torra_atual` = lote mais antigo com saldo > 0 (`order by data_torra, created_at`), com `left join` para mostrar cafés sem lote.
- **RLS ligado** em todas as tabelas; políticas `to authenticated using (true) with check (true)`; nada para `anon`. Login único criado no painel (Authentication → Users), cadastro público desligado.
- Cafés/lotes com movimentos não podem ser apagados (`restrict`); a interface usa "Desativar".
- Saldo negativo não é bloqueado no banco; a interface avisa antes de registrar uma saída maior que o saldo do lote.
- **Carga inicial:** `supabase/seed.sql` gerado por `scripts/gerar-seed.mjs` a partir de `CAFES_INICIAIS` (`src/label/cafes-iniciais.ts`), com `legacy_id` = id atual. `SEED_VERSION`/`desde` deixam de existir no app.

## 2. Camada de dados do app (refatoração)
- Dividir `src/storage.ts`:
  - `LocalStore` (síncrono, como hoje): configurações da impressora (`rotacao`, `ajusteVertical`, `modoSemImpressora`, `selo`) e fila (`getFila/saveFila`); reusa `read/write/persistent` do `BrowserRepository`.
  - `CafeRepository` **assíncrono e por registro**: `list/create/update/remove` (Supabase + Memory para testes).
  - `EstoqueRepository`: `saldosPorCafe()`, `lotes(cafeId)`, `registrarTorra`, `registrarSaida` (venda/perda/ajuste, já distribuída FIFO), `movimentos(filtro)` (Supabase + Memory).
- `CafeBook`/`sanitizeCafe` permanecem (validação reaproveitada); `CafeBook` vira assíncrono; `FilaDeImpressao` só troca o tipo do repositório.
- Novo `src/estoque.ts` (funções puras, testáveis): sinais por tipo, parse de kg ("0,5"), **`loteAtual(lotes)`** (FIFO: mais antigo com saldo > 0), **`distribuirSaida(lotes, kg)`** (uma venda maior que o saldo do lote antigo vira 2+ movimentos, esgotando o antigo e seguindo para o próximo), aviso de saldo insuficiente.
- Novo `src/supabase.ts`: cliente (`@supabase/supabase-js`, empacotado pelo esbuild), login/logout, sessão, mapeamento `snake_case` ↔ `camelCase`.
- `src/app.ts`: chamadas a `book.*` (≈ 15 pontos) passam a `await`, com estados "carregando"/erro; cache em memória de cafés **e do lote atual por café** (carregado ao abrir, ao trocar de aba e a cada 60 s/ao focar a janela) para a pré-visualização continuar instantânea.
- Backup (`exportBackup/importBackup`): cafés do banco + configurações locais.

## 3. Data de torra automática nas etiquetas
- `src/index.html`/`src/app.ts`: o campo **Data de torra** (`#data`) deixa de ser editável; no lugar, uma linha informativa: "**Lote de 05/10/2026 · 3,2 kg restantes**" (ou "Sem estoque deste café — registre uma torra" em vermelho). `pedido()` passa a pegar `dataTorra` do lote atual do café escolhido.
- Validação (`src/request.ts` → `camposFaltando`): sem lote com saldo > 0 o botão **Imprimir/Adicionar à fila** é bloqueado com a mensagem "Este café não tem estoque. Registre uma torra na aba Estoque." Escape controlado: link "usar outra data" abre o seletor manual (para reimpressões e para a transição, enquanto o estoque ainda não foi cadastrado).
- A fila guarda a **data do lote no momento em que o item entra** (já é um snapshot, `ItemFila.dataTorra`), então o que foi visto é o que sai mesmo que o lote esgote depois.
- Teste de impressão (Configurações) e `dadosDoPedido` continuam recebendo a data pronta.

## 4. Interface nova
- **Login** (e-mail + senha compartilhados), sessão persistida; "Sair" em Configurações. Sem internet/sem login: mensagem clara; cache local da última lista de cafés/lotes permite seguir imprimindo (com aviso de "dados de DD/MM HH:MM").
- **Nova aba "Estoque"** (Emitir rótulo | Cafés | **Estoque** | Configurações): por café, saldo total e lista de lotes (data, saldo, o lote "em uso" destacado); botões **Registrar torra** (café, data, kg), **Registrar saída** (café, tipo venda/perda/ajuste, kg → aplicada FIFO) e histórico filtrável. Reaproveita `dialog`, `.cafe-item` e o estilo compacto de `src/style.css`.
- Aba **Cafés**: mesma tela, gravando no banco; "Remover" bloqueado com orientação para "Desativar" se houver lotes.
- Configurações: **"Enviar cafés deste navegador para o banco"** (upsert por `legacy_id`/nome, sem duplicar).

## 5. Configuração, segredos e build
- URL do projeto e chave pública (anon/publishable) entram por variáveis (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) lidas em `scripts/build.mjs` (esbuild `define`). **Senha do login nunca no Git** (repositório público); a chave anon é pública por design e a proteção real é RLS + login.
- Teste "index.html está atualizado" (`test/app.test.mjs`): passar a construir com valores de teste fixos; o `index.html` gerado continua commitado com a chave pública.

## 6. Etapas de entrega (cada uma testável, commit na `v1`)
1. SQL (tabelas, views, função `registrar_torra`, RLS, seed) + passo a passo para o usuário aplicar no painel e criar o login; validar com consultas de teste.
2. Refatoração assíncrona da camada de dados com repositórios em memória; `estoque.ts` com testes (FIFO, distribuição de saída).
3. `SupabaseCafeRepository` + login + build com variáveis; cafés vindos do banco.
4. Aba Estoque (lotes, torra, saída, histórico).
5. Data de torra automática no formulário/etiqueta + bloqueio sem estoque + "usar outra data".
6. Migração dos cafés locais, backup, README.

## Verificação
- `npm test` (tsc + node --test): novos testes para `estoque.ts` (sinais, kg, `loteAtual` FIFO, `distribuirSaida` atravessando dois lotes), repositórios em memória e `CafeBook` assíncrono; os 33 atuais continuam passando (ajustando os que usam `dataTorra`).
- SQL no painel: criar 2 lotes do mesmo café (10 kg em 01/11 e 8 kg em 08/11), venda −9 kg → `estoque_atual` mostra data atual 01/11 com 1 kg restante; nova venda −3 kg → lote antigo zera e `data_torra_atual` passa a 08/11 com 6 kg; `venda` positiva ou `quantidade_kg = 0` → erro de check; apagar café/lote com movimentos → erro `restrict`.
- Segurança: com a chave anon **sem login**, `select` nas tabelas/views é negado/vazio; com login funciona.
- Navegador (Playwright, como nas rodadas anteriores): login, cadastrar café, registrar torra, ver o lote em uso no formulário, imprimir (`window.print` simulado, PDF com `pdfinfo` = 80×100 mm) e conferir a data na etiqueta; registrar saída até esgotar o lote e ver a etiqueta passar para a data do próximo; abrir um segundo navegador (contexto separado) e ver os mesmos dados.
- Manual: teste em papel na L42 (fluxo de impressão inalterado).

## Pendências / riscos
- O usuário precisa fornecer (fora do chat) URL e chave pública do projeto e criar o login; senha nunca no repositório.
- Como imprimir não baixa estoque, a data automática depende de alguém registrar as saídas; baixa automática por etiqueta fica como fase futura (o desenho por lote já a comporta).
- Plano gratuito do Supabase pausa projetos inativos; avaliar o plano.
- Login compartilhado = sem rastreio por pessoa; migrar depois para contas individuais (coluna de autoria com `default auth.uid()` + políticas).
- Fora deste plano: estoque por embalagem (peso × moagem), fila compartilhada.
