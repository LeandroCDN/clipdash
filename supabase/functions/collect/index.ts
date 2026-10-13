// Recolector: corre cada 15 min (pg_cron → HTTP). Un adaptador por proveedor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { contentRewards } from "./providers/contentrewards.ts";
import type { Adapter } from "./types.ts";

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

    // first_seen_at: no pisar el existente
    const ids = items.map((i) => i.campaign.id);
    const { data: known } = await supabase
      .from("campaigns").select("id").eq("provider", adapter.name).in("id", ids);
    const knownIds = new Set((known ?? []).map((k) => k.id));

    const campaigns = items.map((i) => ({
      ...i.campaign,
      last_seen_at: takenAt,
      ...(knownIds.has(i.campaign.id) ? {} : { first_seen_at: takenAt }),
    }));
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

Deno.serve(async () => {
  const results = [];
  for (const a of ADAPTERS) results.push(await runAdapter(a)); // uno caído no frena al resto
  return Response.json({ ok: true, results });
});
