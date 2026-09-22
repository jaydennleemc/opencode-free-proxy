export interface MetricsTotals {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
}

export interface SeriesPoint {
  t: number;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelRow {
  model: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

export interface KeyRow {
  keyLabel: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ErrorRow {
  ts: number;
  endpoint: string;
  model: string;
  error: string | null;
  latencyMs: number;
}

export interface MetricsResponse {
  range: string;
  since: number;
  bucketMs: number;
  totals: MetricsTotals;
  series: SeriesPoint[];
  byModel: ModelRow[];
  byKey: KeyRow[];
  recentErrors: ErrorRow[];
}

export const RANGES = ["1h", "24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];
