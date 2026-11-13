-- XP par récolte (ressource, viande, poisson rare, sac), lue en jeu dans la fenêtre des métiers.
-- Partagée par le groupe : une valeur par ressource, la dernière mise à jour fait foi. Sans valeur, l'appli garde son estimation.
create table if not exists public.harvest_xp (
  item_id integer primary key,
  xp integer not null check (xp >= 0 and xp <= 100000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.harvest_xp enable row level security;
drop policy if exists "xp de récolte lisible par les membres" on public.harvest_xp;
create policy "xp de récolte lisible par les membres" on public.harvest_xp for select to authenticated using (true);
drop policy if exists "xp de récolte modifiable par les membres" on public.harvest_xp;
create policy "xp de récolte modifiable par les membres" on public.harvest_xp for all to authenticated using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table public.harvest_xp;
exception when duplicate_object then null; end $$;
