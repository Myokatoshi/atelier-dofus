-- Prix actuel (facultatif) à côté de la fourchette basse / haute
alter table public.price_obs add column if not exists cur integer check (cur >= 0);

-- Obtention d'un objet (farm, capture...) : partagée par le groupe, la dernière mise à jour fait foi
create table if not exists public.item_obtain (
  item_id integer primary key,
  minutes numeric not null check (minutes > 0),       -- durée moyenne pour une obtention
  qty integer not null default 1 check (qty > 0),     -- quantité obtenue à chaque fois
  inputs jsonb not null default '[]',                 -- objets consommés : [{"item": id, "qty": n}]
  extra bigint not null default 0 check (extra >= 0), -- frais divers en kamas
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.item_obtain enable row level security;
drop policy if exists "obtention lisible par les membres" on public.item_obtain;
create policy "obtention lisible par les membres" on public.item_obtain for select to authenticated using (true);
drop policy if exists "obtention modifiable par les membres" on public.item_obtain;
create policy "obtention modifiable par les membres" on public.item_obtain for all to authenticated using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table public.item_obtain;
exception when duplicate_object then null; end $$;
