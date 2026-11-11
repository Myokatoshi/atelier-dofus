-- Coefficient de brisage par objet (100 % par défaut), partagé par le groupe : la dernière mise à jour fait foi
create table if not exists public.item_coef (
  item_id integer primary key,
  coef numeric not null check (coef >= 0 and coef <= 1000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.item_coef enable row level security;
drop policy if exists "coefficients lisibles par les membres" on public.item_coef;
create policy "coefficients lisibles par les membres" on public.item_coef for select to authenticated using (true);
drop policy if exists "coefficients modifiables par les membres" on public.item_coef;
create policy "coefficients modifiables par les membres" on public.item_coef for all to authenticated using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table public.item_coef;
exception when duplicate_object then null; end $$;
