-- Captures : la pierre d'âme adaptée au niveau du monstre est déduite automatiquement (désactivable par objet)
alter table public.item_obtain add column if not exists auto_stone boolean not null default true;
