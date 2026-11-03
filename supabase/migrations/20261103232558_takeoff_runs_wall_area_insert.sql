-- takeoff_runs grants INSERT column by column: the wall area added in
-- 20261103223051 needs its own, or every wall run's log row is refused.
grant insert (wall_area_sqft) on public.takeoff_runs to authenticated;
