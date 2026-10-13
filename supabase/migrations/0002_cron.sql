-- Secreto compartido entre pg_cron y la Edge Function. RLS sin políticas: solo service role lo lee.
create table if not exists app_secrets (
    name  text primary key,
    value text not null
);
alter table app_secrets enable row level security;
insert into app_secrets (name, value)
values ('cron', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Recolector cada 15 minutos.
select cron.schedule(
    'collect-every-15m',
    '*/15 * * * *',
    $$
    select net.http_post(
        url     := 'https://ovzbipyiemgpkphajyep.supabase.co/functions/v1/collect',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select value from public.app_secrets where name = 'cron')
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 140000
    );
    $$
);
