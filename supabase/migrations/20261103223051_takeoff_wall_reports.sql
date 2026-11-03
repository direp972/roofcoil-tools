-- Wall takeoffs: walls entered by hand (from drawings or the field) and laid
-- out with panels, saved in the same report history as roof takeoffs. A wall
-- run is logged as file_type and parser 'walls' (not 'none', which flags a run
-- for the desk as having no reader), and both tables keep the net wall area it
-- covers in a column of its own.
alter table public.takeoff_runs drop constraint if exists takeoff_runs_file_type_check;
alter table public.takeoff_runs add constraint takeoff_runs_file_type_check
  check (file_type in ('eagleview-pdf', 'eagleview-xml', 'roofscope-pdf', 'other', 'walls'));
alter table public.takeoff_runs drop constraint if exists takeoff_runs_parser_check;
alter table public.takeoff_runs add constraint takeoff_runs_parser_check
  check (parser in ('eagleview', 'eagleview-xml', 'ai', 'none', 'walls'));

alter table public.takeoff_runs add column if not exists wall_area_sqft numeric;
alter table public.takeoff_reports add column if not exists wall_area_sqft numeric;
comment on column public.takeoff_runs.wall_area_sqft is 'a wall takeoff: the net siding area it covers (walls less doors and windows), sq ft';
comment on column public.takeoff_reports.wall_area_sqft is 'a wall report (file_type ''walls''): the net siding area it covers, sq ft';

-- the per-person rollup counts wall runs and their area too (new columns at the end)
create or replace view public.takeoff_usage_by_user
  with (security_invoker = true) as
select
  user_id,
  max(email) as email,
  count(*) as runs,
  count(*) filter (where outcome = 'ok') as ok_runs,
  count(*) filter (where parser = 'eagleview' or parser = 'eagleview-xml') as eagleview_runs,
  count(*) filter (where parser = 'ai') as ai_reads,
  round(coalesce(sum(ai_cost_usd), 0), 4) as ai_cost_usd,
  round(coalesce(sum(roof_area_sqft) filter (where outcome = 'ok'), 0)) as roof_sqft_total,
  min(created_at) as first_run,
  max(created_at) as last_run,
  count(*) filter (where parser = 'walls') as wall_runs,
  round(coalesce(sum(wall_area_sqft) filter (where outcome = 'ok'), 0)) as wall_sqft_total
from public.takeoff_runs
group by user_id;
revoke all on public.takeoff_usage_by_user from public, anon;
grant select on public.takeoff_usage_by_user to authenticated;
