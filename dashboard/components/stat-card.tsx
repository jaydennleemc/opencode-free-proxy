export default function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "violet" | "red" | "green";
}) {
  const accentColors = {
    cyan: "text-cyan",
    violet: "text-violet",
    red: "text-red",
    green: "text-green",
  };
  const accentDots = {
    cyan: "bg-cyan",
    violet: "bg-violet",
    red: "bg-red",
    green: "bg-green",
  };

  return (
    <div className="surface px-5 py-4">
      <div className="flex items-center gap-2">
        {accent && (
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${accentDots[accent]}`} />
        )}
        <span className="text-[11px] uppercase tracking-widest text-muted">
          {label}
        </span>
      </div>
      <div className={`tnum mt-2 text-3xl font-bold tracking-tight ${accent ? accentColors[accent] : "text-text"}`}>
        {value}
      </div>
      {sub && (
        <div className="tnum mt-1 text-xs text-muted">{sub}</div>
      )}
    </div>
  );
}
