-- La durée moyenne d'obtention devient facultative (le bénéfice par heure n'est calculé que si elle est connue)
alter table public.item_obtain alter column minutes drop not null;
