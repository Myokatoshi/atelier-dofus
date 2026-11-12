-- Données Kamamaster d'Orukam récupérées par la fonction serveur « kamamaster » (au lieu du workflow GitHub,
-- dont les passages planifiés sont souvent sautés). Une ligne par fichier : orukam, orukam-history,
-- orukam-donjons, orukam-check. Lecture par les membres connectés ; écriture par la fonction seulement.
create table if not exists public.km_data (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.km_data enable row level security;
drop policy if exists "données kamamaster lisibles par les membres" on public.km_data;
create policy "données kamamaster lisibles par les membres" on public.km_data for select to authenticated using (true);

-- Toutes les heures (à la 17e minute) ; la fonction répond tout de suite et travaille en arrière-plan
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobname) from cron.job where jobname in ('kamamaster-2h', 'kamamaster-horaire');
select cron.schedule('kamamaster-horaire', '17 * * * *', $$
  select net.http_post(url := 'https://jvzwoialynhvhwkccgba.supabase.co/functions/v1/kamamaster',
                       headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
$$);
