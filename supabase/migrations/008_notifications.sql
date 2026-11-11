-- Notifications push (appli fermée)
-- Appareils inscrits : chacun ne voit et ne gère que les siens
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "appareils personnels" on public.push_subs;
create policy "appareils personnels" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notifications déjà envoyées (une par alerte et par prix déclencheur) : lue et écrite par la fonction serveur uniquement
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id text not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, alert_id)
);
alter table public.push_sent enable row level security;  -- aucune règle : inaccessible aux membres, seule la fonction (rôle service) y accède
