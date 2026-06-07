"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
);

interface IndicatorData {
  label: string;
  data: { year: number; value: number | null }[];
  lastYear?: number;
}

interface EconomicChartsProps {
  economics: Record<string, IndicatorData>;
}

const CHART_COLORS = [
  { bg: "rgba(240, 165, 0, 0.12)", border: "rgb(240, 165, 0)" },
  { bg: "rgba(20, 184, 166, 0.12)", border: "rgb(20, 184, 166)" },
  { bg: "rgba(59, 130, 246, 0.12)", border: "rgb(59, 130, 246)" },
  { bg: "rgba(244, 63, 94, 0.12)", border: "rgb(244, 63, 94)" },
  { bg: "rgba(139, 92, 246, 0.12)", border: "rgb(139, 92, 246)" },
];

const USD_LARGE = new Set(["NY.GDP.MKTP.CD", "BN.CAB.XOKA.CD", "BX.KLT.DINV.CD.WD"]);

function formatValue(value: number, indicatorId: string): string {
  if (USD_LARGE.has(indicatorId)) {
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toFixed(0)}`;
  }
  if (indicatorId === "SP.POP.TOTL") {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value.toFixed(0);
  }
  return value.toFixed(2);
}

export default function EconomicCharts({ economics }: EconomicChartsProps) {
  const { t } = useLanguage();
  const c = t.country;
  const indicatorIds = Object.keys(economics);
  const [activeTab, setActiveTab] = useState(indicatorIds[0] || "");

  if (indicatorIds.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-tertiary)" }}>
        {c.no_economics}
      </div>
    );
  }

  const groups = [
    {
      label: c.chart_gdp,
      ids: indicatorIds.filter((id) => ["NY.GDP.MKTP.CD", "NY.GDP.MKTP.KD.ZG"].includes(id)),
    },
    {
      label: c.chart_employment,
      ids: indicatorIds.filter((id) => ["SL.UEM.TOTL.ZS", "FP.CPI.TOTL.ZG"].includes(id)),
    },
    {
      label: c.chart_population,
      ids: indicatorIds.filter((id) => ["SP.POP.TOTL", "SP.DYN.LE00.IN", "SE.ADT.LITR.ZS", "IT.NET.USER.ZS", "SI.POV.GINI"].includes(id)),
    },
    {
      label: c.chart_trade,
      ids: indicatorIds.filter((id) => ["BN.CAB.XOKA.CD", "GC.DOD.TOTL.GD.ZS", "NE.TRD.GNFS.ZS", "NE.EXP.GNFS.ZS", "NE.IMP.GNFS.ZS"].includes(id)),
    },
    {
      label: c.chart_investment,
      ids: indicatorIds.filter((id) => ["BX.KLT.DINV.CD.WD"].includes(id)),
    },
  ].filter((g) => g.ids.length > 0);

  const activeIndicator = economics[activeTab];

  const gridColor = "rgba(148, 163, 184, 0.08)";

  return (
    <div>
      {/* Tab Groups */}
      <div className="flex flex-wrap gap-2 mb-5">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1.5">
            <span className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>{group.label}</span>
            <div className="flex gap-1">
              {group.ids.map((id) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`atlas-pill text-xs transition-all ${activeTab === id ? "atlas-pill-active" : ""}`}
                >
                  {economics[id].label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {activeIndicator && activeIndicator.data.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "var(--atlas-surface-alt)", border: "1px solid var(--atlas-border)" }}>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {activeIndicator.label}
            </h4>
            {activeIndicator.lastYear && (
              <span className="text-xs coord-text px-2 py-0.5 rounded-full" style={{ background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)", color: "var(--text-tertiary)" }}>
                {c.data_as_of} {activeIndicator.lastYear} · World Bank
              </span>
            )}
          </div>
          <div className="h-72">
            {activeTab.includes("ZG") || activeTab.includes("ZS") || activeTab === "SP.DYN.LE00.IN" ? (
              <Line
                data={{
                  labels: activeIndicator.data.map((d) => d.year.toString()),
                  datasets: [{
                    label: activeIndicator.label,
                    data: activeIndicator.data.map((d) => d.value),
                    borderColor: CHART_COLORS[0].border,
                    backgroundColor: CHART_COLORS[0].bg,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${activeIndicator.label}: ${formatValue(ctx.parsed.y ?? 0, activeTab)}` } },
                  },
                  scales: {
                    y: { ticks: { callback: (val) => formatValue(val as number, activeTab), color: "var(--text-tertiary)" }, grid: { color: gridColor } },
                    x: { grid: { display: false }, ticks: { color: "var(--text-tertiary)" } },
                  },
                }}
              />
            ) : (
              <Bar
                data={{
                  labels: activeIndicator.data.map((d) => d.year.toString()),
                  datasets: [{
                    label: activeIndicator.label,
                    data: activeIndicator.data.map((d) => d.value),
                    backgroundColor: CHART_COLORS[0].bg,
                    borderColor: CHART_COLORS[0].border,
                    borderWidth: 1.5,
                    borderRadius: 6,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${activeIndicator.label}: ${formatValue(ctx.parsed.y ?? 0, activeTab)}` } },
                  },
                  scales: {
                    y: { ticks: { callback: (val) => formatValue(val as number, activeTab), color: "var(--text-tertiary)" }, grid: { color: gridColor } },
                    x: { grid: { display: false }, ticks: { color: "var(--text-tertiary)" } },
                  },
                }}
              />
            )}
          </div>
          {/* Latest value */}
          {activeIndicator.data.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span style={{ color: "var(--text-tertiary)" }}>
                {c.chart_latest} ({activeIndicator.data[activeIndicator.data.length - 1].year}):
              </span>
              <span className="font-bold text-gradient-gold">
                {formatValue(activeIndicator.data[activeIndicator.data.length - 1].value!, activeTab)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
