-- Burn rate solo con al menos 1 h de historia (antes salía $0 con snapshots de 15 min).
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
      and s.taken_at <= l.taken_at - interval '1 hour'
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
       case when e.taken_at is not null
            then (l.spent_usd - e.spent_usd) / (extract(epoch from (l.taken_at - e.taken_at)) / 3600)
       end                                                     as burn_usd_per_hour
from campaigns c
join latest l on l.provider = c.provider and l.campaign_id = c.id
left join earlier e on e.provider = c.provider and e.campaign_id = c.id
left join rates r on r.provider = c.provider and r.campaign_id = c.id;
