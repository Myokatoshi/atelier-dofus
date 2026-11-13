-- Quantités échangées à l'HDV (achetées par les joueurs) sur 24 h, 7 jours et 30 jours, relevées en jeu.
-- Partagées par le groupe ; un relevé par objet et par jour (le plus récent du jour fait foi), l'historique est gardé.
create table if not exists public.item_volume (
  item_id integer not null,
  day date not null default current_date,
  d1 integer check (d1 >= 0),
  d7 integer check (d7 >= 0),
  d30 integer check (d30 >= 0),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (item_id, day)
);
alter table public.item_volume enable row level security;
drop policy if exists "volumes lisibles par les membres" on public.item_volume;
create policy "volumes lisibles par les membres" on public.item_volume for select to authenticated using (true);
drop policy if exists "volumes modifiables par les membres" on public.item_volume;
create policy "volumes modifiables par les membres" on public.item_volume for all to authenticated using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table public.item_volume;
exception when duplicate_object then null; end $$;
