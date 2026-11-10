-- Atelier Dofus 3 : journal de ventes (mise à jour du 2026-11).
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  d date not null default current_date,
  kind text not null check (kind in ('vente', 'achat')),
  item_id integer not null,
  qty integer not null check (qty > 0),
  total bigint not null check (total >= 0),
  fee bigint not null default 0 check (fee >= 0),
  cost bigint check (cost >= 0),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists trades_user_d on public.trades (user_id, d);

-- Journal strictement personnel : chacun ne voit et ne modifie que ses opérations
alter table public.trades enable row level security;
drop policy if exists "journal personnel" on public.trades;
create policy "journal personnel" on public.trades for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
