export default function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "teal" | "violet" | "red" | "amber";
}) {
  const accentClass =
    accent === "teal"
      ? "text-teal"
      : accent === "violet"
        ? "text-violet"
        : accent === "red"
          ? "text-red"
          : accent === "amber"
            ? "text-amber"
            : "text-ink";
  return (
    <div className="surface rounded-lg bg-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-dim">
        {label}
      </div>
      <div className={`tnum mt-1 text-2xl font-semibold ${accentClass}`}>
        {value}
      </div>
      {sub && <div className="tnum mt-0.5 text-xs text-dim">{sub}</div>}
    </div>
  );
}
