import { createClient } from "@supabase/supabase-js";

export type Campaign = {
  provider: string;
  id: string;
  url: string | null;
  name: string | null;
  organizer: string | null;
  organizer_verified: boolean | null;
  categories: string[];
  language: string | null;
  payout_type: string | null;
  platforms: string[];
  requires_application: boolean | null;
  launched_at: string | null;
  first_seen_at: string;
  rates: Record<string, number | null>;
  snapshot_at: string;
  budget_usd: number | null;
  spent_usd: number | null;
  remaining_usd: number;
  creators: number | null;
  total_views: number | null;
  burn_usd_per_hour: number | null;
};

export type Filters = {
  platforms: string[]; // vacío = todas
  language: string;
  category: string;
  provider: string;
  noApply: boolean;
};

export type Scored = Campaign & {
  rate: number;
  score: number;
  hoursLeft: number | null;
  ageHours: number;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadCampaigns(): Promise<Campaign[]> {
  const sb = client();
  const out: Campaign[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("campaign_latest")
      .select("*")
      .eq("status", "active")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Campaign[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function lastRun() {
  const { data } = await client()
    .from("collector_runs")
    .select("provider, finished_at, campaigns, error")
    .order("started_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

/** Puntaje = mejor tasa en las redes elegidas × presupuesto restante ÷ (clippers + 5). */
export function score(rows: Campaign[], f: Filters): Scored[] {
  const now = Date.now();
  const out: Scored[] = [];
  for (const c of rows) {
    if (c.payout_type !== "cpm") continue;
    if (f.language && c.language !== f.language) continue;
    if (f.category && !c.categories.includes(f.category)) continue;
    if (f.provider && c.provider !== f.provider) continue;
    if (f.noApply && c.requires_application) continue;
    const rates = Object.entries(c.rates)
      .filter(([p, v]) => v != null && (f.platforms.length === 0 || f.platforms.includes(p)))
      .map(([, v]) => Number(v));
    if (rates.length === 0) continue;
    const rate = Math.max(...rates);
    const remaining = Number(c.remaining_usd);
    const burn = c.burn_usd_per_hour != null ? Number(c.burn_usd_per_hour) : null;
    out.push({
      ...c,
      rate,
      score: (rate * remaining) / ((c.creators ?? 0) + 5),
      hoursLeft: burn && burn > 0 ? remaining / burn : null,
      ageHours: (now - new Date(c.launched_at ?? c.first_seen_at).getTime()) / 36e5,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function groupSum(rows: Scored[], key: (c: Scored) => string[]) {
  const m = new Map<string, { remaining: number; count: number; rateSum: number }>();
  for (const r of rows) {
    for (const k of key(r)) {
      const g = m.get(k) ?? { remaining: 0, count: 0, rateSum: 0 };
      g.remaining += Number(r.remaining_usd);
      g.count += 1;
      g.rateSum += r.rate;
      m.set(k, g);
    }
  }
  return [...m.entries()]
    .map(([k, g]) => ({ key: k, remaining: g.remaining, count: g.count, avgRate: g.rateSum / g.count }))
    .sort((a, b) => b.remaining - a.remaining);
}
