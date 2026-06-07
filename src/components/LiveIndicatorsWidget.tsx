"use client";

import { useLanguage } from "@/context/LanguageContext";

interface Datapoint { period: string; value: number; }

interface OECDData {
  gdpGrowth: Datapoint[];
  cpi: Datapoint[];
  unemployment: Datapoint[];
}

interface LiveIndicatorsWidgetProps {
  oecdData: OECDData;
}

function formatPeriod(period: string): string {
  // "2024-Q3" → "Q3 2024" | "2024-03" → "Mar 2024"
  if (/^\d{4}-Q\d$/.test(period)) {
    const [year, q] = period.split("-");
    return `${q} ${year}`;
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split("-");
    const m = new Date(`${year}-${month}-01`).toLocaleString("en", { month: "short" });
    return `${m} ${year}`;
  }
  return period;
}

function Indicator({
  label,
  subtitle,
  value,
  unit,
  period,
  positive,
}: {
  label: string;
  subtitle: string;
  value: number;
  unit: string;
  period: string;
  positive: boolean;
}) {
  const isPositive = positive ? value >= 0 : value <= 0;
  const color = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: "var(--atlas-surface-alt)", border: "1px solid var(--atlas-border)" }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </span>
      <div className="flex items-baseline gap-1 mt-1">
        <span
          className="text-2xl font-black"
          style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", color }}
        >
          {value >= 0 ? "+" : ""}{value.toFixed(1)}
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{unit}</span>
      </div>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{subtitle}</span>
      <span className="text-xs mt-auto pt-1 coord-text" style={{ borderTop: "1px solid var(--atlas-border)" }}>
        {formatPeriod(period)}
      </span>
    </div>
  );
}

export default function LiveIndicatorsWidget({ oecdData }: LiveIndicatorsWidgetProps) {
  const { t } = useLanguage();
  const li = t.live_indicators;

  const latestGDP = oecdData.gdpGrowth.at(-1);
  const latestCPI = oecdData.cpi.at(-1);
  const latestUER = oecdData.unemployment.at(-1);

  const cards = [
    latestGDP && {
      label: li.gdp_growth,
      subtitle: li.gdp_subtitle,
      value: latestGDP.value,
      unit: "%",
      period: latestGDP.period,
      positive: true,
    },
    latestCPI && {
      label: li.inflation,
      subtitle: li.inflation_subtitle,
      value: latestCPI.value,
      unit: "%",
      period: latestCPI.period,
      positive: false,
    },
    latestUER && {
      label: li.unemployment,
      subtitle: li.unemployment_subtitle,
      value: latestUER.value,
      unit: "%",
      period: latestUER.period,
      positive: false,
    },
  ].filter(Boolean) as {
    label: string; subtitle: string; value: number;
    unit: string; period: string; positive: boolean;
  }[];

  if (cards.length === 0) return null;

  return (
    <div
      className="atlas-card p-6"
      style={{ background: `linear-gradient(135deg, rgba(240,165,0,0.06), var(--atlas-surface))` }}
    >
      <div className="flex items-center gap-3 mb-4">
        <h2 className="atlas-section-label">{li.title}</h2>
        <span
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22c55e" }} />
          {li.live_badge}
        </span>
      </div>

      <div className={`grid gap-3 ${cards.length === 3 ? "grid-cols-3" : cards.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {cards.map((card) => (
          <Indicator key={card.label} {...card} />
        ))}
      </div>

      <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>{li.source}</p>
    </div>
  );
}
