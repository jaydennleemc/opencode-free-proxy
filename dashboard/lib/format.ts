export function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return Math.round(n / 1_000) + "k";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

export function latency(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return Math.round(ms) + "ms";
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

/** "Sep 22 15:08:34" — for event rows that need an unambiguous timestamp. */
export function dateClock(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour12: false })
  );
}

export function dayTime(ts: number, bucketMs: number): string {
  const d = new Date(ts);
  if (bucketMs >= 86_400_000) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
}
