-- Métiers des membres (niveau de chaque métier, visible par tout le groupe) et commandes entre membres.
create table if not exists public.member_jobs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id integer not null,
  level integer not null check (level between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.member_jobs enable row level security;
drop policy if exists "métiers lisibles par les membres" on public.member_jobs;
create policy "métiers lisibles par les membres" on public.member_jobs for select to authenticated using (true);
drop policy if exists "chacun gère ses métiers" on public.member_jobs;
create policy "chacun gère ses métiers" on public.member_jobs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Commande : un membre demande une quantité d'un objet ; un autre la prend en charge puis la livre.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  item_id integer not null,
  qty integer not null check (qty > 0),
  note text check (char_length(note) <= 300),
  price integer check (price >= 0),
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_by uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'taken', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
drop policy if exists "commandes lisibles par les membres" on public.orders;
create policy "commandes lisibles par les membres" on public.orders for select to authenticated using (true);
drop policy if exists "commander pour soi" on public.orders;
create policy "commander pour soi" on public.orders for insert to authenticated with check (requested_by = auth.uid());
drop policy if exists "suivre une commande" on public.orders;
-- le demandeur gère sa commande ; un autre membre peut prendre une commande ouverte, ou suivre celle qu'il a prise
create policy "suivre une commande" on public.orders for update to authenticated
  using (requested_by = auth.uid() or taken_by = auth.uid() or (status = 'open' and taken_by is null))
  with check (requested_by = auth.uid() or taken_by = auth.uid());
drop policy if exists "supprimer sa commande" on public.orders;
create policy "supprimer sa commande" on public.orders for delete to authenticated using (requested_by = auth.uid());
do $$ begin
  alter publication supabase_realtime add table public.member_jobs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
