-- takeoff_runs: the run log names the reader that read each report. The
-- takeoff tool now reads HOVER and AppliCad XML exports, EagleView's DXF, and
-- Roofr, Instant Roofer, rooforders, iRoofing and SketchMyRoof PDFs, so their
-- file types and readers join the allowed values (none are removed).
alter table public.takeoff_runs drop constraint takeoff_runs_file_type_check;
alter table public.takeoff_runs add constraint takeoff_runs_file_type_check check (
  file_type = any (array[
    'eagleview-pdf', 'eagleview-xml', 'eagleview-dxf', 'hover-xml', 'applicad-xml',
    'roofr-pdf', 'instantroofer-pdf', 'rooforders-pdf', 'iroofing-pdf', 'sketchmyroof-pdf',
    'roofscope-pdf', 'other', 'walls'
  ])
);

alter table public.takeoff_runs drop constraint takeoff_runs_parser_check;
alter table public.takeoff_runs add constraint takeoff_runs_parser_check check (
  parser = any (array[
    'eagleview', 'eagleview-xml', 'eagleview-dxf', 'hover', 'applicad',
    'roofr', 'instantroofer', 'rooforders', 'iroofing', 'sketchmyroof',
    'ai', 'none', 'walls'
  ])
);

-- The usage page's EagleView column counts EagleView's CAD (DXF) export too.
-- Same view otherwise; replacing it keeps its grants.
create or replace view public.takeoff_usage_by_user with (security_invoker = true) as
select user_id,
    max(email) as email,
    count(*) as runs,
    count(*) filter (where outcome = 'ok') as ok_runs,
    count(*) filter (where parser in ('eagleview', 'eagleview-xml', 'eagleview-dxf')) as eagleview_runs,
    count(*) filter (where parser = 'ai') as ai_reads,
    round(coalesce(sum(ai_cost_usd), 0::numeric), 4) as ai_cost_usd,
    round(coalesce(sum(roof_area_sqft) filter (where outcome = 'ok'), 0::numeric)) as roof_sqft_total,
    min(created_at) as first_run,
    max(created_at) as last_run,
    count(*) filter (where parser = 'walls') as wall_runs,
    round(coalesce(sum(wall_area_sqft) filter (where outcome = 'ok'), 0::numeric)) as wall_sqft_total
from public.takeoff_runs
group by user_id;
