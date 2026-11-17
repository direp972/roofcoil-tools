-- Adax Metals rolls its licensed Ultra Seam (US-) profiles, which the platform keeps off so
-- the main tool and every other fabricator show New Tech Machinery profiles only. Adax's own
-- catalog selection switches them on for Adax (profiles: { name: true }, resolveCatalog in
-- supabase/functions/_shared/catalog.mjs). Merges into a selection the shop may already have.
insert into public.shop_settings (shop_id, key, value, updated_at)
select s.id, 'catalog', jsonb_build_object('profiles', jsonb_build_object(
    'US-100NS – 1" Nail Strip', true,
    'US-150 – 1.5" Mechanical Seam', true,
    'US-150LS – 1.5" Snap-Lock', true,
    'US-175LS – 1.75" Snap-Lock', true,
    'US-200 – 2" Mechanical Seam', true,
    'US-100FP – 1" Flush Wall / Soffit', true)), now()
from public.shops s where s.slug = 'adax-metals'
on conflict (shop_id, key) do update
set value = jsonb_set(coalesce(public.shop_settings.value, '{}'::jsonb), '{profiles}',
      coalesce(public.shop_settings.value->'profiles', '{}'::jsonb) || (excluded.value->'profiles')),
    updated_at = now();
