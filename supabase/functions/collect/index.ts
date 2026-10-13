// Recolector: corre cada 15 min (pg_cron → HTTP). Un adaptador por proveedor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { contentRewards } from "./providers/contentrewards.ts";
import type { Adapter } from "./types.ts";

// Vyro (providers/vyro.ts) está escrito pero desactivado: su catálogo exige login (HTTP 401).
const ADAPTERS: Adapter[] = [contentRewards];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function runAdapter(adapter: Adapter) {
  const { data: run } = await supabase
    .from("collector_runs").insert({ provider: adapter.name }).select("id").single();
  const takenAt = new Date().toISOString();
  try {
    const items = await adapter.fetchAll();

    // first_seen_at no va en el payload: lo pone el default al insertar y el upsert no lo pisa.
    const campaigns = items.map((i) => ({ ...i.campaign, last_seen_at: takenAt }));
    for (const chunk of chunks(campaigns, 200)) {
      const { error } = await supabase.from("campaigns").upsert(chunk, { onConflict: "provider,id" });
      if (error) throw error;
    }
    const payouts = items.flatMap((i) => i.payouts);
    for (const chunk of chunks(payouts, 500)) {
      const { error } = await supabase.from("campaign_payouts")
        .upsert(chunk, { onConflict: "provider,campaign_id,platform" });
      if (error) throw error;
    }
    const snaps = items.map((i) => ({ ...i.snapshot, taken_at: takenAt }));
    for (const chunk of chunks(snaps, 500)) {
      const { error } = await supabase.from("campaign_snapshots").insert(chunk);
      if (error) throw error;
    }
    await supabase.from("collector_runs")
      .update({ finished_at: new Date().toISOString(), campaigns: items.length }).eq("id", run?.id);
    return { provider: adapter.name, campaigns: items.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    await supabase.from("collector_runs")
      .update({ finished_at: new Date().toISOString(), error: msg }).eq("id", run?.id);
    return { provider: adapter.name, error: msg };
  }
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Solo pg_cron conoce el secreto: vive en public.app_secrets (RLS sin políticas, solo service role).
async function authorized(req: Request) {
  const given = req.headers.get("x-cron-secret");
  if (!given) return false;
  const { data } = await supabase.from("app_secrets").select("value").eq("name", "cron").single();
  return !!data && data.value === given;
}

// Retención: snapshots de 15 min solo 7 días; antes de borrar, se resumen en campaign_daily.
const KEEP_DAYS = 7;

async function retention() {
  const { error: rollupError } = await supabase.rpc("rollup_daily");
  if (rollupError) return { retention: `rollup falló: ${rollupError.message}` };
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
  const { error, count } = await supabase
    .from("campaign_snapshots").delete({ count: "exact" }).lt("taken_at", cutoff);
  return { retention: error ? `borrado falló: ${error.message}` : `${count ?? 0} snapshots borrados` };
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return new Response("unauthorized", { status: 401 });
  const results: unknown[] = [];
  for (const a of ADAPTERS) results.push(await runAdapter(a)); // uno caído no frena al resto
  // Una vez por día, en la corrida de las 03:00 UTC.
  const now = new Date();
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 15) results.push(await retention());
  return Response.json({ ok: true, results });
});
