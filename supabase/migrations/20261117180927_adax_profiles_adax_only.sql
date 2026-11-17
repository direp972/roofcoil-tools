-- Adax Metals rolls its licensed Ultra Seam (US-) profiles, which the platform keeps off so
-- the main tool and every other fabricator show New Tech Machinery profiles only.
-- 1. The platform marks them as Adax's own (data.shop = Adax's shop id): only a shop's own
--    marked profiles can be switched on by its catalog selection, and a profile marked with
--    another shop is off everywhere else (resolveCatalog, supabase/functions/_shared/catalog.mjs).
-- 2. Adax's catalog selection switches on the six it rolls, merged into any selection it has.
-- Fails, changing nothing, unless the shop exists and exactly its 8 profile rows are marked.
-- Applied to the live database as 20261117180927 (adax_profiles_adax_only).
do $$
declare
  adax uuid;
  marked int;
begin
  select id into adax from public.shops where slug = 'adax-metals';
  if adax is null then raise exception 'no shop with slug adax-metals'; end if;

  update public.catalog_items
  set data = data || jsonb_build_object('shop', adax::text), updated_at = now()
  where kind = 'profile' and data->>'vendor' = 'adax';
  get diagnostics marked = row_count;
  if marked <> 8 then raise exception 'expected 8 Adax profile rows, marked %', marked; end if;

  insert into public.shop_settings (shop_id, key, value, updated_at)
  values (adax, 'catalog', jsonb_build_object('profiles', jsonb_build_object(
      'US-100NS – 1" Nail Strip', true,
      'US-150 – 1.5" Mechanical Seam', true,
      'US-150LS – 1.5" Snap-Lock', true,
      'US-175LS – 1.75" Snap-Lock', true,
      'US-200 – 2" Mechanical Seam', true,
      'US-100FP – 1" Flush Wall / Soffit', true)), now())
  on conflict (shop_id, key) do update
  set value = (case when jsonb_typeof(public.shop_settings.value) = 'object' then public.shop_settings.value else '{}'::jsonb end)
        || jsonb_build_object('profiles',
             (case when jsonb_typeof(public.shop_settings.value->'profiles') = 'object' then public.shop_settings.value->'profiles' else '{}'::jsonb end)
             || (excluded.value->'profiles')),
      updated_at = now();
end $$;
