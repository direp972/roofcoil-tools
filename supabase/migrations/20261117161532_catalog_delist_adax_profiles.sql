-- The shop offers New Tech Machinery panel profiles only. The Adax Ultra Seam
-- (US-) profiles leave the offer: delisted, not deleted, so an order or estimate
-- that names one still resolves. Matches the built-in catalog in
-- supabase/functions/_shared/catalog.mjs. Applied to the live database as
-- 20261117161532 (catalog_delist_adax_profiles).
update public.catalog_items
set delisted = true, updated_at = now()
where kind = 'profile' and data->>'vendor' = 'adax' and key like 'US-%' and delisted = false;
