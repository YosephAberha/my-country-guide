"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface ForecastPoint {
  year: number;
  value: number | null;
  projected: boolean;
}

interface IMFForecastsSectionProps {
  forecasts: Record<string, { label: string; data: ForecastPoint[] }>;
}

const COLORS = [
  { border: "rgb(240, 165, 0)",   bg: "rgba(240, 165, 0, 0.1)" },
  { border: "rgb(20, 184, 166)",  bg: "rgba(20, 184, 166, 0.1)" },
  { border: "rgb(59, 130, 246)",  bg: "rgba(59, 130, 246, 0.1)" },
  { border: "rgb(244, 63, 94)",   bg: "rgba(244, 63, 94, 0.1)" },
];

function formatVal(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function IMFForecastsSection({ forecasts }: IMFForecastsSectionProps) {
  const { t } = useLanguage();
  const imf = t.imf;
  const ids = Object.keys(forecasts);
  const [activeId, setActiveId] = useState(ids[0] || "");

  if (ids.length === 0) return null;

  const active = forecasts[activeId];
  if (!active) return null;

  const currentYear = new Date().getFullYear();
  const splitIdx = active.data.findIndex((p) => p.year >= currentYear);
  const gridColor = "rgba(148, 163, 184, 0.08)";

  // Build two datasets: historical (solid) + projected (dashed)
  const allLabels = active.data.map((p) => p.year.toString());
  const historicalValues = active.data.map((p) => (p.year < currentYear ? p.value : null));
  const projectedValues = active.data.map((p, i) => {
    // overlap one point so line connects
    if (p.year >= currentYear) return p.value;
    if (i === splitIdx - 1) return p.value;
    return null;
  });

  const color = COLORS[ids.indexOf(activeId) % COLORS.length];
  const latestProjected = [...active.data].reverse().find((p) => p.projected && p.value !== null);
  const latestHistorical = [...active.data].reverse().find((p) => !p.projected && p.value !== null);

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => setActiveId(id)}
            className={`atlas-pill text-xs transition-all ${activeId === id ? "atlas-pill-active" : ""}`}
          >
            {forecasts[id].label}
          </button>
        ))}
      </div>

      <div className="rounded-xl p-4" style={{ background: "var(--atlas-surface-alt)", border: "1px solid var(--atlas-border)" }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {active.label}
          </h4>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 h-0.5" style={{ background: color.border }} />
              {imf.historical}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 h-0.5 border-t-2 border-dashed" style={{ borderColor: color.border }} />
              {imf.projected}
            </span>
          </div>
        </div>

        <div className="h-64">
          <Line
            data={{
              labels: allLabels,
              datasets: [
                {
                  label: imf.historical,
                  data: historicalValues,
                  borderColor: color.border,
                  backgroundColor: color.bg,
                  fill: true,
                  tension: 0.3,
                  pointRadius: 3,
                  pointHoverRadius: 6,
                  spanGaps: true,
                },
                {
                  label: imf.projected,
                  data: projectedValues,
                  borderColor: color.border,
                  backgroundColor: "transparent",
                  borderDash: [5, 5],
                  tension: 0.3,
                  pointRadius: 3,
                  pointHoverRadius: 6,
                  spanGaps: true,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) =>
                      ctx.parsed.y != null
                        ? `${ctx.dataset.label}: ${formatVal(ctx.parsed.y)}`
                        : "",
                  },
                },
              },
              scales: {
                y: {
                  ticks: { callback: (v) => formatVal(v as number), color: "var(--text-tertiary)" },
                  grid: { color: gridColor },
                },
                x: {
                  grid: { display: false },
                  ticks: { color: "var(--text-tertiary)" },
                },
              },
            }}
          />
        </div>

        {/* Latest values */}
        <div className="mt-3 pt-3 flex flex-wrap gap-4" style={{ borderTop: "1px solid var(--atlas-border)" }}>
          {latestHistorical && (
            <div className="text-sm">
              <span style={{ color: "var(--text-tertiary)" }}>{imf.historical} ({latestHistorical.year}): </span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{formatVal(latestHistorical.value!)}</span>
            </div>
          )}
          {latestProjected && (
            <div className="text-sm">
              <span style={{ color: "var(--text-tertiary)" }}>{imf.projected} ({latestProjected.year}): </span>
              <span className="font-bold text-gradient-gold">{formatVal(latestProjected.value!)}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs mt-2 px-1" style={{ color: "var(--text-tertiary)" }}>{imf.source}</p>
    </div>
  );
}
