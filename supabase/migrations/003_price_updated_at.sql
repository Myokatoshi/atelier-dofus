-- Heure du relevé : pour un même objet et un même jour, le relevé le plus récent fait foi.
alter table public.price_obs add column if not exists updated_at timestamptz not null default now();
update public.price_obs set updated_at = created_at;  -- relevés existants : heure de création
