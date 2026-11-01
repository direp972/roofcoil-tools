-- Reports saved before settings were recorded don't say what waste, max panel
-- length or fastening they were run with: 20261101134157 filled those in as
-- the page's defaults, which an older takeoff run with waste or a max length
-- would wrongly match (opened as "the same settings", or replaced by a new
-- run). Their settings go back to unknown, which matches nothing. Every row
-- the new API saves carries its file's fingerprint and its real settings; only
-- the older rows have no fingerprint yet.
update public.takeoff_reports
set settings = null
where source_sha256 is null and settings is not null;
