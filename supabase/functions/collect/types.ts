export interface CampaignRow {
  provider: string;
  id: string;
  url: string | null;
  name: string | null;
  organizer: string | null;
  organizer_verified: boolean | null;
  description: string | null;
  categories: string[];
  language: string | null;
  payout_type: string | null;
  platforms: string[];
  rate_min_usd: number | null;
  rate_max_usd: number | null;
  budget_usd: number | null;
  requires_application: boolean | null;
  status: string | null;
  created_at: string | null;
  launched_at: string | null;
  raw: unknown;
}

export interface PayoutRow {
  provider: string;
  campaign_id: string;
  platform: string;
  rate_usd: number | null;
  min_payout_usd: number | null;
  max_payout_usd: number | null;
}

export interface SnapshotRow {
  provider: string;
  campaign_id: string;
  budget_usd: number | null;
  spent_usd: number | null;
  creators: number | null;
  approved_submissions: number | null;
  total_views: number | null;
  status: string | null;
}

export interface Normalized {
  campaign: CampaignRow;
  payouts: PayoutRow[];
  snapshot: SnapshotRow;
}

/** Cada proveedor nuevo implementa esto y se suma a ADAPTERS en index.ts. */
export interface Adapter {
  name: string;
  fetchAll(): Promise<Normalized[]>;
}
