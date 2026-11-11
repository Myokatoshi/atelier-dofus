-- Atelier Dofus 3 : schéma Supabase.
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.

-- Pseudos des membres (affichés à côté des relevés de prix)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null default '' check (char_length(pseudo) <= 30)
);

-- Relevés de prix HDV : un relevé par objet, par membre et par jour
create table if not exists public.price_obs (
  item_id integer not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  d date not null,
  lo integer not null check (lo >= 0),
  hi integer not null check (hi >= lo),
  cur integer check (cur >= 0),  -- prix actuel, facultatif
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),  -- le relevé le plus récent d'un jour fait foi
  primary key (item_id, user_id, d)
);
create index if not exists price_obs_item on public.price_obs (item_id);

-- Données personnelles : stock, plan de craft, choix de farm, builds
create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  stock jsonb not null default '{}',
  plan jsonb not null default '{}',
  builds jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Sécurité : seuls les membres connectés (invités) accèdent aux données
alter table public.profiles enable row level security;
alter table public.price_obs enable row level security;
alter table public.user_state enable row level security;

drop policy if exists "profils lisibles par les membres" on public.profiles;
create policy "profils lisibles par les membres" on public.profiles for select to authenticated using (true);
drop policy if exists "chacun gère son profil" on public.profiles;
create policy "chacun gère son profil" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "prix lisibles par les membres" on public.price_obs;
create policy "prix lisibles par les membres" on public.price_obs for select to authenticated using (true);
drop policy if exists "chacun ajoute ses relevés" on public.price_obs;
create policy "chacun ajoute ses relevés" on public.price_obs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "chacun modifie ses relevés" on public.price_obs;
create policy "chacun modifie ses relevés" on public.price_obs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "chacun supprime ses relevés" on public.price_obs;
create policy "chacun supprime ses relevés" on public.price_obs for delete to authenticated using (user_id = auth.uid());

drop policy if exists "données personnelles privées" on public.user_state;
create policy "données personnelles privées" on public.user_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Profil créé automatiquement à l'inscription (pseudo = début de l'adresse e-mail)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, pseudo) values (new.id, split_part(new.email, '@', 1)) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Temps réel : diffuser les nouveaux relevés à tous les membres connectés
do $$ begin
  alter publication supabase_realtime add table public.price_obs;
exception when duplicate_object then null; end $$;

-- Journal de ventes (identique à supabase/migrations/002_journal.sql)
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

-- Obtention des objets (identique à supabase/migrations/004_prix_actuel_obtention.sql)
create table if not exists public.item_obtain (
  item_id integer primary key,
  minutes numeric check (minutes > 0),                -- durée moyenne pour une obtention (facultative)
  qty integer not null default 1 check (qty > 0),     -- quantité obtenue à chaque fois
  inputs jsonb not null default '[]',                 -- objets consommés : [{"item": id, "qty": n}]
  extra bigint not null default 0 check (extra >= 0), -- frais divers en kamas
  auto_stone boolean not null default true,          -- captures : pierre d'âme déduite automatiquement
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

-- Coefficients de brisage (identique à supabase/migrations/007_coef_brisage.sql)
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
