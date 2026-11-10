-- takeoff_runs: the takeoff tool now reads FirstMate (1m8.ai) reports from
-- their pictures (takeoff-web: parser 'firstmate', file type 'firstmate-pdf'),
-- so they join the allowed values. None of the earlier values are removed.
alter table public.takeoff_runs drop constraint takeoff_runs_file_type_check;
alter table public.takeoff_runs add constraint takeoff_runs_file_type_check check (file_type = any (array[
  'eagleview-pdf', 'eagleview-xml', 'eagleview-dxf', 'hover-xml', 'applicad-xml', 'roofr-pdf', 'instantroofer-pdf',
  'rooforders-pdf', 'iroofing-pdf', 'sketchmyroof-pdf', 'roofscope-pdf', 'firstmate-pdf', 'roof-plan', 'other', 'walls'
]::text[]));
alter table public.takeoff_runs drop constraint takeoff_runs_parser_check;
alter table public.takeoff_runs add constraint takeoff_runs_parser_check check (parser = any (array[
  'eagleview', 'eagleview-xml', 'eagleview-dxf', 'hover', 'applicad', 'roofr', 'instantroofer', 'rooforders',
  'iroofing', 'sketchmyroof', 'firstmate', 'plan-trace', 'ai', 'none', 'walls'
]::text[]));
