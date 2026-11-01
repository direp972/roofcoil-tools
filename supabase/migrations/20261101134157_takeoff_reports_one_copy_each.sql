-- One copy of each measurement file, and one copy of each takeoff, in the
-- report history. The API records with every saved report the SHA-256 of its
-- measurement file and the settings the run was asked for (its panel options,
-- waste, max panel length and job details). The page looks a file up by its
-- hash before uploading it: a file already run is not uploaded again (the
-- run reuses the copy kept the first time), and the same file with the same
-- settings opens the saved takeoff rather than making another. A takeoff run
-- again with the same settings replaces its earlier copy.
alter table public.takeoff_reports add column if not exists source_sha256 text;
alter table public.takeoff_reports add column if not exists settings jsonb;
create index if not exists takeoff_reports_user_source
  on public.takeoff_reports (user_id, source_sha256) where source_sha256 is not null;

-- Reports saved before hashes were kept: the page has the file (the database
-- doesn't), so when the user picks a file whose name matches one, it checks
-- the kept copy byte for byte and fills in the hash. That one column, on the
-- user's own rows, and only where it is still empty.
grant update (source_sha256) on table public.takeoff_reports to authenticated;
drop policy if exists "user fills in own takeoff source hash" on public.takeoff_reports;
create policy "user fills in own takeoff source hash" on public.takeoff_reports
  for update to authenticated
  using (user_id = auth.uid() and source_sha256 is null)
  with check (user_id = auth.uid() and source_sha256 ~ '^[0-9a-f]{64}$');

-- Settings of reports saved before they were recorded: the options from the
-- run's rows; waste and max panel length weren't recorded and are taken as
-- none (the page's defaults).
update public.takeoff_reports r
set settings = s.settings
from (
  select run_id,
         jsonb_build_object(
           'options', jsonb_agg(
             jsonb_build_object(
               'system', system_id,
               'coverageIn', coverage_in,
               'coilWidthIn', coil_width_in,
               'substrate', null,
               'purlinSpacingIn', null
             ) order by option_index),
           'panelWastePct', 0,
           'accessoryWastePct', 0,
           'maxPanelFt', null,
           'jobName', min(job_name),
           'jobNumber', min(job_number),
           'customer', min(customer)
         ) as settings
  from public.takeoff_reports
  where settings is null and run_id is not null
  group by run_id
) s
where r.run_id = s.run_id and r.settings is null;
