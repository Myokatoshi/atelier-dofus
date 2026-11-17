-- Élevage partagé par le groupe : recettes de croisement notées en jeu (Muldos, Volkornes surtout)
-- et générations des monocolores confirmées ou corrigées en jeu.
create table if not exists public.breed_recipes (
  mount_id integer not null,
  parent_a integer not null,
  parent_b integer not null,
  noted_by uuid default auth.uid() references auth.users(id) on delete set null,
  noted_at timestamptz not null default now(),
  primary key (mount_id, parent_a, parent_b),
  check (parent_a <= parent_b)
);
alter table public.breed_recipes enable row level security;
drop policy if exists "recettes lisibles par les membres" on public.breed_recipes;
create policy "recettes lisibles par les membres" on public.breed_recipes for select to authenticated using (true);
drop policy if exists "recettes modifiables par les membres" on public.breed_recipes;
create policy "recettes modifiables par les membres" on public.breed_recipes for all to authenticated using (true) with check (true);

-- Génération d'une couleur monocolore (famille = type d'objet 331 / 332 / 333), confirmée telle quelle ou corrigée
create table if not exists public.breed_gens (
  family integer not null,
  color text not null check (char_length(color) <= 40),
  gen integer not null check (gen between 1 and 20),
  noted_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (family, color)
);
alter table public.breed_gens enable row level security;
drop policy if exists "générations lisibles par les membres" on public.breed_gens;
create policy "générations lisibles par les membres" on public.breed_gens for select to authenticated using (true);
drop policy if exists "générations modifiables par les membres" on public.breed_gens;
create policy "générations modifiables par les membres" on public.breed_gens for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.breed_recipes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.breed_gens;
exception when duplicate_object then null; end $$;
