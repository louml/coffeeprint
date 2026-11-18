-- Controle de torra: histórico de torras (data, quem torrou, cafés torrados e kg).
-- Substitui as tabelas de lotes/movimentos de estoque (o estoque real será refeito junto com os pedidos).
-- As torras que já estavam registradas nas tabelas antigas são copiadas (torrador "Não informado").

create table public.torras (
  id uuid primary key default gen_random_uuid(),
  data_torra date not null,
  torrador text not null check (btrim(torrador) <> ''),
  created_at timestamptz not null default now()
);
create index torras_data_idx on public.torras (data_torra desc, created_at desc);

create table public.torra_itens (
  id uuid primary key default gen_random_uuid(),
  torra_id uuid not null references public.torras(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete restrict,
  quantidade_kg numeric(10, 3) not null check (quantidade_kg > 0),
  unique (torra_id, cafe_id)
);
create index torra_itens_cafe_idx on public.torra_itens (cafe_id);

-- Copia o que existia nas tabelas antigas.
insert into public.torras (id, data_torra, torrador, created_at)
select l.id, l.data_torra, 'Não informado', l.created_at from public.lotes_torra l;

insert into public.torra_itens (torra_id, cafe_id, quantidade_kg)
select l.id, l.cafe_id, sum(m.quantidade_kg)
from public.lotes_torra l
join public.estoque_movimentos m on m.lote_id = l.id and m.tipo = 'torra'
group by l.id, l.cafe_id
having sum(m.quantidade_kg) > 0;

drop view public.estoque_atual;
drop view public.lotes_com_saldo;
drop function public.registrar_torra(uuid, date, numeric, text);
drop table public.estoque_movimentos;
drop table public.lotes_torra;

-- Registrar uma torra = a torra e todos os seus cafés, tudo ou nada.
-- p_itens: [{"cafe_id": "<uuid>", "quantidade_kg": 7.5}, ...]
create function public.registrar_torra(p_data_torra date, p_torrador text, p_itens jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_torra uuid;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um café torrado.';
  end if;

  insert into public.torras (data_torra, torrador)
  values (p_data_torra, btrim(p_torrador))
  returning id into v_torra;

  insert into public.torra_itens (torra_id, cafe_id, quantidade_kg)
  select v_torra, x.cafe_id, x.quantidade_kg
  from jsonb_to_recordset(p_itens) as x(cafe_id uuid, quantidade_kg numeric);

  return v_torra;
end;
$$;
revoke execute on function public.registrar_torra(date, text, jsonb) from public, anon;
grant execute on function public.registrar_torra(date, text, jsonb) to authenticated;

-- RLS: só usuários autenticados; torras só podem ser lidas e criadas (sem editar nem apagar, por enquanto).
alter table public.torras enable row level security;
alter table public.torra_itens enable row level security;

create policy torras_select on public.torras
  for select to authenticated using ((select auth.uid()) is not null);
create policy torras_insert on public.torras
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy torra_itens_select on public.torra_itens
  for select to authenticated using ((select auth.uid()) is not null);
create policy torra_itens_insert on public.torra_itens
  for insert to authenticated with check ((select auth.uid()) is not null);

revoke all on public.torras, public.torra_itens from anon;
