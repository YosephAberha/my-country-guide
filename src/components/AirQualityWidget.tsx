"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

interface AQData {
  aqi: number;
  pm25: number;
  pm10: number;
  uvIndex: number;
}

function getAQILevel(aqi: number, t: ReturnType<typeof useLanguage>["t"]): { label: string; color: string; bg: string; border: string } {
  const aq = t.air_quality;
  if (aqi <= 20) return { label: aq.level_good,      color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)" };
  if (aqi <= 40) return { label: aq.level_fair,      color: "#84cc16", bg: "rgba(132,204,22,0.1)",  border: "rgba(132,204,22,0.25)" };
  if (aqi <= 60) return { label: aq.level_moderate,  color: "#eab308", bg: "rgba(234,179,8,0.1)",   border: "rgba(234,179,8,0.25)" };
  if (aqi <= 80) return { label: aq.level_poor,      color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)" };
  if (aqi <= 100) return { label: aq.level_very_poor, color: "#ef4444", bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.25)" };
  return              { label: aq.level_hazardous,  color: "#7c3aed", bg: "rgba(124,58,237,0.1)",  border: "rgba(124,58,237,0.25)" };
}

function getUVLevel(uv: number): string {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very High";
  return "Extreme";
}

interface AirQualityWidgetProps {
  lat: number;
  lng: number;
}

export default function AirQualityWidget({ lat, lng }: AirQualityWidgetProps) {
  const { t } = useLanguage();
  const aq = t.air_quality;
  const [data, setData] = useState<AQData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
      `&current=european_aqi,pm10,pm2_5,uv_index&timezone=auto`,
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((json) => {
        const c = json.current;
        if (c?.european_aqi == null) throw new Error();
        setData({
          aqi: Math.round(c.european_aqi),
          pm25: Math.round((c.pm2_5 ?? 0) * 10) / 10,
          pm10: Math.round((c.pm10 ?? 0) * 10) / 10,
          uvIndex: Math.round((c.uv_index ?? 0) * 10) / 10,
        });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) {
    return (
      <div className="atlas-card p-6">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--atlas-gold)", borderTopColor: "transparent" }} />
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>{aq.loading}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const level = getAQILevel(data.aqi, t);

  // AQI bar: 0–150 scale
  const barPct = Math.min(100, (data.aqi / 150) * 100);

  return (
    <div
      className="atlas-card p-6 overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${level.bg}, var(--atlas-surface))` }}
    >
      <h2 className="atlas-section-label mb-4">{aq.title}</h2>

      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-3xl font-black" style={{ color: level.color, fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}>
            {data.aqi}
          </span>
          <span className="text-sm ml-2" style={{ color: "var(--text-tertiary)" }}>/ 150</span>
        </div>
        <span
          className="atlas-pill text-xs font-semibold"
          style={{ background: level.bg, color: level.color, border: `1px solid ${level.border}` }}
        >
          {level.label}
        </span>
      </div>

      {/* AQI progress bar */}
      <div className="w-full h-2 rounded-full mb-5" style={{ background: "var(--atlas-surface-alt)" }}>
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${barPct}%`, background: `linear-gradient(90deg, #22c55e, #eab308, #ef4444)` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: aq.pm25, value: `${data.pm25} µg/m³` },
          { label: aq.pm10, value: `${data.pm10} µg/m³` },
          { label: aq.uv,   value: `${data.uvIndex} (${getUVLevel(data.uvIndex)})` },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg p-3 text-center"
            style={{ background: "var(--atlas-surface-alt)", border: "1px solid var(--atlas-border)" }}
          >
            <span className="block text-xs mb-1 coord-text">{item.label}</span>
            <span className="block text-sm font-bold" style={{ color: "var(--text-primary)" }}>{item.value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>{aq.source}</p>
    </div>
  );
}
