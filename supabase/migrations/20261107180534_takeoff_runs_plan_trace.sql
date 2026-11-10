-- takeoff_runs: a roof plan traced by hand over a picture or a drawing set's
-- page is logged with parser 'plan-trace' and file type 'roof-plan' (takeoff-web).
-- Applied to the live database on 2026-11-07; recorded here to keep the
-- migration history in step. None of the earlier values are removed.
alter table public.takeoff_runs drop constraint takeoff_runs_file_type_check;
alter table public.takeoff_runs add constraint takeoff_runs_file_type_check check (file_type = any (array[
  'eagleview-pdf', 'eagleview-xml', 'eagleview-dxf', 'hover-xml', 'applicad-xml', 'roofr-pdf', 'instantroofer-pdf',
  'rooforders-pdf', 'iroofing-pdf', 'sketchmyroof-pdf', 'roofscope-pdf', 'roof-plan', 'other', 'walls'
]::text[]));
alter table public.takeoff_runs drop constraint takeoff_runs_parser_check;
alter table public.takeoff_runs add constraint takeoff_runs_parser_check check (parser = any (array[
  'eagleview', 'eagleview-xml', 'eagleview-dxf', 'hover', 'applicad', 'roofr', 'instantroofer', 'rooforders',
  'iroofing', 'sketchmyroof', 'plan-trace', 'ai', 'none', 'walls'
]::text[]));
