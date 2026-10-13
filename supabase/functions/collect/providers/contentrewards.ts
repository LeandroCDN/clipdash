// Content Rewards (Whop): directorio público, JSON paginado por cursor, sin login.
import type { Adapter, Normalized } from "../types.ts";
import { guessLanguage } from "../language.ts";

const NAME = "contentrewards";
const BASE = "https://contentrewards.com/api/campaign/campaigns/discover";
const PAGE = 50;
const DELAY_MS = 1500; // ritmo bajo
const MAX_PAGES = 40;  // tope de seguridad (~2.000 campañas)

const usd = (cents: number | null | undefined) => (cents == null ? null : cents / 100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
function normalize(c: any): Normalized {
  const m = c.metrics ?? {};
  return {
    campaign: {
      provider: NAME,
      id: c.id,
      url: `https://contentrewards.com/c/campaigns/${c.id}`,
      name: c.name ?? null,
      organizer: c.organizationName ?? null,
      organizer_verified: !!c.organizationVerified,
      description: c.description ?? null,
      // deno-lint-ignore no-explicit-any
      categories: (c.categories ?? []).map((x: any) => x.name),
      language: guessLanguage(c.name, c.description),
      payout_type: c.payoutType ?? null,
      platforms: c.platforms ?? [],
      rate_min_usd: usd(c.cpmMinRateCents),
      rate_max_usd: usd(c.cpmMaxRateCents),
      budget_usd: usd(c.budgetCents),
      requires_application: !!c.requiresApplication,
      status: c.status ?? null,
      created_at: c.createdAt ?? null,
      launched_at: c.launchDate ?? null,
      raw: c,
    },
    // deno-lint-ignore no-explicit-any
    payouts: (c.payouts ?? []).filter((p: any) => p.platform).map((p: any) => ({
      provider: NAME,
      campaign_id: c.id,
      platform: p.platform,
      rate_usd: usd(p.rateCents),
      min_payout_usd: usd(p.minPayoutCents),
      max_payout_usd: usd(p.maxPayoutCents),
    })),
    snapshot: {
      provider: NAME,
      campaign_id: c.id,
      budget_usd: usd(c.budgetCents),
      spent_usd: usd(m.budgetSpentCents),
      creators: m.creatorCount ?? null,
      approved_submissions: m.approvedSubmissionCount ?? null,
      total_views: m.totalViews ?? null,
      status: c.status ?? null,
    },
  };
}

export const contentRewards: Adapter = {
  name: NAME,
  async fetchAll() {
    const seen = new Map<string, Normalized>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ collapseGroups: "true", limit: String(PAGE), view: "summary" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`${BASE}?${params}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (clipdash personal research)",
          Referer: "https://contentrewards.com/c/discover",
        },
      });
      if (!res.ok) throw new Error(`contentrewards HTTP ${res.status}`);
      const body = await res.json();
      for (const c of body.data ?? []) {
        if (c && c.id && c.budgetCents != null && !seen.has(c.id)) seen.set(c.id, normalize(c));
      }
      cursor = body.pagination?.nextCursor ?? null;
      if (!cursor) break;
      await sleep(DELAY_MS);
    }
    return [...seen.values()];
  },
};
