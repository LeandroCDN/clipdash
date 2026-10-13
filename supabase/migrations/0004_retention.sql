-- Retención: los snapshots de 15 min se resumen por día en campaign_daily.
-- El borrado de snapshots de más de 7 días lo hace la Edge Function `collect`
-- en la corrida de las 03:00 UTC (ver retention() en index.ts).

create table if not exists campaign_daily (
    provider             text not null,
    campaign_id          text not null,
    day                  date not null,
    budget_usd           numeric,
    spent_usd            numeric,   -- último valor del día
    creators             integer,
    approved_submissions integer,
    total_views          bigint,
    snapshots            integer,   -- cuántos snapshots resumió
    primary key (provider, campaign_id, day),
    foreign key (provider, campaign_id) references campaigns (provider, id) on delete cascade
);

alter table campaign_daily enable row level security;
create policy "public read" on campaign_daily for select using (true);

create index if not exists idx_snap_taken_at on campaign_snapshots (taken_at);

-- Resume cada día con su último snapshot (idempotente).
create or replace function rollup_daily()
returns void
language sql
security definer
set search_path = public
as $$
    insert into campaign_daily as d
        (provider, campaign_id, day, budget_usd, spent_usd, creators, approved_submissions, total_views, snapshots)
    select distinct on (provider, campaign_id, (taken_at at time zone 'utc')::date)
           provider, campaign_id, (taken_at at time zone 'utc')::date,
           budget_usd, spent_usd, creators, approved_submissions, total_views,
           count(*) over (partition by provider, campaign_id, (taken_at at time zone 'utc')::date)
    from campaign_snapshots
    order by provider, campaign_id, (taken_at at time zone 'utc')::date, taken_at desc
    on conflict (provider, campaign_id, day) do update set
        budget_usd           = excluded.budget_usd,
        spent_usd            = excluded.spent_usd,
        creators             = excluded.creators,
        approved_submissions = excluded.approved_submissions,
        total_views          = excluded.total_views,
        snapshots            = greatest(d.snapshots, excluded.snapshots);
$$;

revoke execute on function rollup_daily() from public, anon, authenticated;
grant execute on function rollup_daily() to service_role;
