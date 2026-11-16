-- TorraLocal360: cafés, lotes de torra e livro-razão de estoque (kg).
-- Acesso: somente usuários autenticados (login único da equipe). Nada para o papel anon.

create table public.cafes (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                       -- id antigo (cafés iniciais do app); usado na migração dos navegadores
  nome text not null check (btrim(nome) <> ''),
  notas text not null default '',
  produtor text not null default '',
  rotulo_produtor text not null default '',    -- "Produtor", "Produtora"...
  variedade text not null default '',
  regiao text not null default '',
  especie text not null default '',
  torra text not null default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cafes_set_updated_at before update on public.cafes
  for each row execute function public.set_updated_at();

-- Um lote por torra (um café pode ter vários, inclusive na mesma data).
create table public.lotes_torra (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete restrict,
  data_torra date not null,
  observacao text not null default '',
  created_at timestamptz not null default now()
);
create index lotes_torra_cafe_idx on public.lotes_torra (cafe_id, data_torra, created_at);

-- Livro-razão: o saldo de um lote é a soma dos seus movimentos (kg, com sinal).
create table public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_torra(id) on delete restrict,
  tipo text not null check (tipo in ('torra', 'venda', 'perda', 'ajuste')),
  quantidade_kg numeric(10, 3) not null,
  data date not null default current_date,
  observacao text not null default '',
  created_at timestamptz not null default now(),
  constraint quantidade_nao_zero check (quantidade_kg <> 0),
  constraint sinal_por_tipo check (
    (tipo = 'torra' and quantidade_kg > 0)
    or (tipo in ('venda', 'perda') and quantidade_kg < 0)
    or tipo = 'ajuste'
  )
);
create index estoque_movimentos_lote_idx on public.estoque_movimentos (lote_id);

-- Saldo por lote.
create view public.lotes_com_saldo with (security_invoker = true) as
select
  l.id as lote_id,
  l.cafe_id,
  l.data_torra,
  l.created_at,
  coalesce(sum(m.quantidade_kg), 0)::numeric(12, 3) as saldo_kg
from public.lotes_torra l
left join public.estoque_movimentos m on m.lote_id = l.id
group by l.id;

-- Saldo por café e lote "em uso" (FIFO: o mais antigo que ainda tem saldo).
create view public.estoque_atual with (security_invoker = true) as
select
  c.id as cafe_id,
  c.nome,
  c.torra,
  c.ativo,
  coalesce(sum(s.saldo_kg), 0)::numeric(12, 3) as saldo_kg,
  (array_agg(s.lote_id order by s.data_torra, s.created_at) filter (where s.saldo_kg > 0))[1] as lote_atual_id,
  (array_agg(s.data_torra order by s.data_torra, s.created_at) filter (where s.saldo_kg > 0))[1] as data_torra_atual,
  (array_agg(s.saldo_kg order by s.data_torra, s.created_at) filter (where s.saldo_kg > 0))[1] as saldo_lote_atual_kg
from public.cafes c
left join public.lotes_com_saldo s on s.cafe_id = c.id
group by c.id;

-- Registrar uma torra = criar o lote e o movimento 'torra' na mesma operação.
create function public.registrar_torra(p_cafe_id uuid, p_data_torra date, p_quantidade_kg numeric, p_observacao text default '')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_lote uuid;
begin
  insert into public.lotes_torra (cafe_id, data_torra, observacao)
  values (p_cafe_id, p_data_torra, coalesce(p_observacao, ''))
  returning id into v_lote;

  insert into public.estoque_movimentos (lote_id, tipo, quantidade_kg, data, observacao)
  values (v_lote, 'torra', p_quantidade_kg, p_data_torra, coalesce(p_observacao, ''));

  return v_lote;
end;
$$;
revoke execute on function public.registrar_torra(uuid, date, numeric, text) from public, anon;
grant execute on function public.registrar_torra(uuid, date, numeric, text) to authenticated;

-- RLS: só usuários autenticados. O livro-razão não tem update/delete (correções = movimento 'ajuste').
alter table public.cafes enable row level security;
alter table public.lotes_torra enable row level security;
alter table public.estoque_movimentos enable row level security;

create policy cafes_autenticados on public.cafes
  for all to authenticated
  using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create policy lotes_select on public.lotes_torra
  for select to authenticated using ((select auth.uid()) is not null);
create policy lotes_insert on public.lotes_torra
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy lotes_update on public.lotes_torra
  for update to authenticated
  using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create policy movimentos_select on public.estoque_movimentos
  for select to authenticated using ((select auth.uid()) is not null);
create policy movimentos_insert on public.estoque_movimentos
  for insert to authenticated with check ((select auth.uid()) is not null);

-- Nada para anon nas tabelas e views.
revoke all on public.cafes, public.lotes_torra, public.estoque_movimentos, public.lotes_com_saldo, public.estoque_atual from anon;
