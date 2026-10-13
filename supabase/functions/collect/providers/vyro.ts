// Vyro (app.vyro.com): catálogo de campañas, JSON paginado por número de página.
// Diferencias con Content Rewards: trae idioma explícito y fecha de fin, pero no cantidad de clippers.
import type { Adapter, Normalized } from "../types.ts";

const NAME = "vyro";
const BASE = "https://api.vyro.com/catalog/campaigns";
const PAGE = 50;
const DELAY_MS = 1500;
const MAX_PAGES = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const stripHtml = (s: unknown) =>
  typeof s === "string" ? s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim() : null;

// deno-lint-ignore no-explicit-any
function normalize(c: any): Normalized {
  const t = c.targeting ?? {};
  const b = c.budget ?? {};
  const pm = c.payoutModel ?? {};
  const isCpm = String(pm.model ?? "").toUpperCase() === "CPM";
  const rate = num(pm.payRate) ?? num(c.headlineRate);
  const platforms: string[] = t.platforms ?? [];
  const budget = num(b.value);
  const spent = num(b.spent) ?? (budget != null && num(b.remaining) != null ? budget - b.remaining : null);
  const status = c.status?.id ?? null;
  return {
    campaign: {
      provider: NAME,
      id: c.id,
      url: c.slug ? `https://app.vyro.com/campaigns/${c.slug}` : "https://app.vyro.com/campaigns",
      name: c.name?.trim() ?? null,
      organizer: c.workspace?.name ?? null,
      organizer_verified: null,
      description: stripHtml(c.requirements?.brief),
      categories: c.type ? [c.type === "clipping" ? "Clipping" : String(c.type)] : [],
      language: (t.languages ?? [])[0] ?? null,
      payout_type: isCpm ? "cpm" : String(pm.model ?? "").toLowerCase() || null,
      platforms,
      rate_min_usd: rate,
      rate_max_usd: rate,
      budget_usd: budget,
      requires_application: !!c.isLocked,
      // Vyro deja visibles campañas terminadas: si ya pasó endDate, no está activa.
      status: status === "active" && c.endDate && Date.parse(c.endDate) < Date.now() ? "ended" : status,
      created_at: c.createdAt ?? null,
      launched_at: c.startDate ?? null,
      raw: c,
    },
    payouts: platforms.map((p) => ({
      provider: NAME,
      campaign_id: c.id,
      platform: p,
      rate_usd: rate,
      min_payout_usd: null,
      max_payout_usd: null,
    })),
    snapshot: {
      provider: NAME,
      campaign_id: c.id,
      budget_usd: budget,
      spent_usd: spent,
      creators: null, // Vyro no lo publica
      approved_submissions: null,
      total_views: null,
      status,
    },
  };
}

async function getPage(url: string, attempts = 4) {
  let last = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(3000 * 3 ** (i - 1));
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: "https://app.vyro.com",
          Referer: "https://app.vyro.com/",
          "x-realm": "vyro-app",
          "User-Agent": "Mozilla/5.0 (clipdash personal research)",
        },
      });
      if (res.ok) return await res.json();
      last = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`vyro ${last}`);
}

export const vyro: Adapter = {
  name: NAME,
  async fetchAll() {
    const seen = new Map<string, Normalized>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ sort: "startDate.desc", limit: String(PAGE), page: String(page) });
      const body = await getPage(`${BASE}?${params}`);
      for (const c of body.data ?? []) {
        if (c?.id && !seen.has(c.id)) seen.set(c.id, normalize(c));
      }
      if (!body.meta?.page?.next) break;
      await sleep(DELAY_MS);
    }
    return [...seen.values()];
  },
};
