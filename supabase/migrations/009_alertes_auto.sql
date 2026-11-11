-- Vérification automatique des alertes (fonction serveur « alertes ») :
-- à chaque relevé de prix du groupe, et toutes les heures (prix Kamamaster, alertes de craft).
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.lancer_alertes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'https://jvzwoialynhvhwkccgba.supabase.co/functions/v1/alertes',
                        headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
  return null;
end $$;

drop trigger if exists alertes_apres_releve on public.price_obs;
create trigger alertes_apres_releve after insert or update on public.price_obs
  for each statement execute function public.lancer_alertes();

select cron.unschedule('alertes-horaire') where exists (select 1 from cron.job where jobname = 'alertes-horaire');
select cron.schedule('alertes-horaire', '7 * * * *', $$
  select net.http_post(url := 'https://jvzwoialynhvhwkccgba.supabase.co/functions/v1/alertes',
                       headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
$$);
