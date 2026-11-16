-- FF100 is the shop's own tooling, which takes 4" off the coil (a 21" coil
-- makes a 17" panel), not NTM's published 4-1/16". Matches the built-in
-- catalog in supabase/functions/_shared/catalog.mjs. Applied to the live
-- database as 20261116155042.
update public.catalog_items
set data = jsonb_set(data, '{takeup}', '4'::jsonb), updated_at = now()
where kind = 'profile' and key = 'FF100 – 1" Snap-Lock, Slotted Flange' and (data->>'takeup')::numeric = 4.0625;
