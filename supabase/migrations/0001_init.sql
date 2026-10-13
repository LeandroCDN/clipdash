-- clipdash: esquema común para campañas de clipping de varios proveedores.

create table if not exists campaigns (
    provider             text not null,
    id                   text not null,
    url                  text,
    name                 text,
    organizer            text,
    organizer_verified   boolean,
    description          text,
    categories           text[] not null default '{}',
    language             text,
    payout_type          text,
    platforms            text[] not null default '{}',
    rate_min_usd         numeric,
    rate_max_usd         numeric,
    budget_usd           numeric,
    requires_application boolean,
    status               text,
    created_at           timestamptz,
    launched_at          timestamptz,
    first_seen_at        timestamptz not null default now(),
    last_seen_at         timestamptz not null default now(),
    raw                  jsonb,
    primary key (provider, id)
);

create table if not exists campaign_payouts (
    provider        text not null,
    campaign_id     text not null,
    platform        text not null,
    rate_usd        numeric,
    min_payout_usd  numeric,
    max_payout_usd  numeric,
    primary key (provider, campaign_id, platform),
    foreign key (provider, campaign_id) references campaigns (provider, id) on delete cascade
);

create table if not exists campaign_snapshots (
    provider             text not null,
    campaign_id          text not null,
    taken_at             timestamptz not null,
    budget_usd           numeric,
    spent_usd            numeric,
    creators             integer,
    approved_submissions integer,
    total_views          bigint,
    status               text,
    primary key (provider, campaign_id, taken_at),
    foreign key (provider, campaign_id) references campaigns (provider, id) on delete cascade
);

create table if not exists collector_runs (
    id          bigserial primary key,
    provider    text not null,
    started_at  timestamptz not null default now(),
    finished_at timestamptz,
    campaigns   integer,
    error       text
);

-- Vista principal del dashboard: estado más reciente + burn rate de las últimas ~24 h.
create or replace view campaign_latest with (security_invoker = true) as
with latest as (
    select distinct on (provider, campaign_id) *
    from campaign_snapshots
    order by provider, campaign_id, taken_at desc
),
earlier as (
    select distinct on (s.provider, s.campaign_id)
           s.provider, s.campaign_id, s.taken_at, s.spent_usd
    from campaign_snapshots s
    join latest l on l.provider = s.provider and l.campaign_id = s.campaign_id
    where s.taken_at >= l.taken_at - interval '24 hours'
      and s.taken_at <  l.taken_at
    order by s.provider, s.campaign_id, s.taken_at
),
rates as (
    select provider, campaign_id, jsonb_object_agg(platform, rate_usd) as rates
    from campaign_payouts
    group by provider, campaign_id
)
select c.provider, c.id, c.url, c.name, c.organizer, c.organizer_verified,
       c.categories, c.language, c.payout_type, c.platforms,
       c.rate_min_usd, c.rate_max_usd, c.requires_application, c.status,
       c.created_at, c.launched_at, c.first_seen_at,
       coalesce(r.rates, '{}'::jsonb)                          as rates,
       l.taken_at                                              as snapshot_at,
       l.budget_usd, l.spent_usd,
       greatest(coalesce(l.budget_usd, 0) - coalesce(l.spent_usd, 0), 0) as remaining_usd,
       l.creators, l.approved_submissions, l.total_views,
       case when e.taken_at is not null and l.taken_at > e.taken_at
            then (l.spent_usd - e.spent_usd) / (extract(epoch from (l.taken_at - e.taken_at)) / 3600)
       end                                                     as burn_usd_per_hour
from campaigns c
join latest l on l.provider = c.provider and l.campaign_id = c.id
left join earlier e on e.provider = c.provider and e.campaign_id = c.id
left join rates r on r.provider = c.provider and r.campaign_id = c.id;

-- Los datos son públicos (vienen de directorios públicos): lectura abierta, escritura solo service role.
alter table campaigns          enable row level security;
alter table campaign_payouts   enable row level security;
alter table campaign_snapshots enable row level security;
alter table collector_runs     enable row level security;

create policy "public read" on campaigns          for select using (true);
create policy "public read" on campaign_payouts   for select using (true);
create policy "public read" on campaign_snapshots for select using (true);
create policy "public read" on collector_runs     for select using (true);
