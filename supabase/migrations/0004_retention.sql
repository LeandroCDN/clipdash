-- Retención: snapshots de 15 min solo 7 días; después queda un resumen diario por campaña.

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

-- Resume cada día con su último snapshot y borra lo que tenga más de 7 días.
create or replace function rollup_and_prune(keep_days integer default 7)
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

    delete from campaign_snapshots
    where taken_at < now() - make_interval(days => keep_days);
$$;

revoke execute on function rollup_and_prune(integer) from public, anon, authenticated;

-- Todos los días a las 03:10 UTC.
select cron.schedule('rollup-and-prune-daily', '10 3 * * *', $$ select public.rollup_and_prune(); $$);
