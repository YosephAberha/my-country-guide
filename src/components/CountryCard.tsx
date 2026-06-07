"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import EconomicCharts from "./EconomicCharts";
import AnimatedSection from "./AnimatedSection";
import WeatherWidget from "./WeatherWidget";
import AirQualityWidget from "./AirQualityWidget";
import ExchangeRateWidget from "./ExchangeRateWidget";
import IMFForecastsSection from "./IMFForecastsSection";
import LiveIndicatorsWidget from "./LiveIndicatorsWidget";
import TravelLinks from "./TravelLinks";
import FavoriteButton from "./FavoriteButton";
import VisitedButton from "./VisitedButton";
import ShareButton from "./ShareButton";

interface IMFForecastPoint { year: number; value: number | null; projected: boolean; }

interface CountryPageData {
  name: { common: string; official: string; nativeName?: Record<string, { common: string }> };
  flags: { svg: string; alt?: string };
  coatOfArms?: { svg?: string };
  capital?: string[];
  population: number;
  area?: number;
  region: string;
  subregion?: string;
  continents?: string[];
  borders?: string[];
  borderNames?: { code: string; name: string }[];
  latlng?: number[];
  landlocked?: boolean;
  maps?: { googleMaps?: string };
  unMember?: boolean;
  government?: string;
  economics: Record<string, { label: string; data: { year: number; value: number | null }[] }>;
  imfForecasts?: Record<string, { label: string; data: IMFForecastPoint[] }> | null;
  travelAdvisory?: { level: number; message: string; url: string } | null;
  oecdData?: { gdpGrowth: { period: string; value: number }[]; cpi: { period: string; value: number }[]; unemployment: { period: string; value: number }[] } | null;
  practical: {
    currency: string[];
    currencyCodes: string[];
    languages: string[];
    government: { type: string; headOfState: string; legislature: string } | null;
    telephone: { callingCode: string; emergencyNumber: string };
    climate: { season: string; description: string; currentMonth: string };
    religions: string[];
    precautions: string[];
    timezones: string[];
    drivingSide: string;
    essentials: string[];
  };
}

function formatNumber(n: number, t: { billion: string; million: string }): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} ${t.billion}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} ${t.million}`;
  if (n >= 1e3) return n.toLocaleString();
  return n.toString();
}

function formatArea(n: number): string {
  return `${n.toLocaleString()} km²`;
}

function getRegionClass(region: string): string {
  const r = region.toLowerCase();
  if (r === "europe") return "region-badge region-europe";
  if (r === "asia") return "region-badge region-asia";
  if (r === "africa") return "region-badge region-africa";
  if (r.includes("america")) return "region-badge region-americas";
  if (r === "oceania") return "region-badge region-oceania";
  if (r === "antarctic") return "region-badge region-antarctic";
  return "region-badge";
}

const ADVISORY_COLORS: Record<number, { color: string; bg: string; border: string }> = {
  1: { color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)" },
  2: { color: "#eab308", bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.3)" },
  3: { color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)" },
  4: { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)" },
};

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="atlas-card p-6 compass-rose">
      <h2 className="atlas-section-label flex items-center gap-2 mb-5">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string | React.ReactNode }) {
  return (
    <div className="atlas-info-row">
      <span className="sm:w-44 shrink-0 font-medium text-sm flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
        {icon}
        {label}
      </span>
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

/* Stat icon SVGs */
function IconPopulation() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IconArea() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>;
}
function IconCapital() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>;
}
function IconGlobe() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
}
function IconCurrency() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}
function IconLanguage() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>;
}
function IconPhone() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}
function IconClock() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconShield() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function IconGov() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20"/><path d="M5 20V8l7-4 7 4v12"/><path d="M9 20v-4h6v4"/></svg>;
}

export default function CountryCard({ data }: { data: CountryPageData }) {
  const { t } = useLanguage();
  const router = useRouter();
  const c = t.country;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero Header — Large flag with country name */}
      <AnimatedSection delay={0}>
        <div className="atlas-card overflow-hidden">
          {/* Flag banner */}
          <div className="relative overflow-hidden flex items-center justify-center py-6 sm:py-8" style={{ background: "var(--atlas-surface-alt)", minHeight: "12rem" }}>
            <img
              src={data.flags.svg}
              alt={data.flags.alt || `Flag of ${data.name.common}`}
              className="w-auto max-w-[85%] max-h-44 sm:max-h-52 object-contain rounded-md shadow-lg"
            />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, var(--atlas-navy) 0%, transparent 40%)" }} />
            {/* Coat of arms overlay */}
            {data.coatOfArms?.svg && (
              <img
                src={data.coatOfArms.svg}
                alt={c.coat_of_arms}
                className="absolute bottom-4 right-6 w-16 h-16 object-contain opacity-60 hidden sm:block drop-shadow-lg"
              />
            )}
          </div>

          {/* Info below flag */}
          <div className="px-6 pb-6 -mt-8 relative z-10">
            <div className="flex items-end gap-4 mb-4">
              <div className="flex-1">
                <h1
                  className="text-3xl sm:text-4xl font-black leading-tight tracking-tight"
                  style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", color: "var(--text-primary)" }}
                >
                  {data.name.common}
                </h1>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  {data.name.official}
                </p>
              </div>
              <FavoriteButton country={data.name.common} />
            </div>

            {/* Action chips & badges */}
            <div className="flex flex-wrap items-center gap-2">
              <VisitedButton country={data.name.common} />
              <ShareButton countryName={data.name.common} />
              {data.region && (
                <span className={getRegionClass(data.region)}>
                  {data.region}
                </span>
              )}
              {data.subregion && (
                <span className="atlas-pill text-xs">
                  {data.subregion}
                </span>
              )}
              {data.unMember && (
                <span className="region-badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", border: "1px solid rgba(139, 92, 246, 0.25)" }}>
                  {c.un_member}
                </span>
              )}
              {data.travelAdvisory && (() => {
                const adv = data.travelAdvisory!;
                const col = ADVISORY_COLORS[adv.level] ?? ADVISORY_COLORS[1];
                const label = t.travel_advisory?.[`level_${adv.level}` as keyof typeof t.travel_advisory] ?? `Level ${adv.level}`;
                return (
                  <a
                    href={adv.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="region-badge flex items-center gap-1"
                    style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}`, textDecoration: "none" }}
                    title={adv.message}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    {label}
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Live Weather + 7-day forecast */}
      {data.latlng && (
        <AnimatedSection delay={0.03}>
          <WeatherWidget
            lat={data.latlng[0]}
            lng={data.latlng[1]}
            countryName={data.name.common}
          />
        </AnimatedSection>
      )}

      {/* Live Air Quality */}
      {data.latlng && (
        <AnimatedSection delay={0.06}>
          <AirQualityWidget lat={data.latlng[0]} lng={data.latlng[1]} />
        </AnimatedSection>
      )}

      {/* Geographic & Population */}
      <AnimatedSection delay={0.05}>
        <Section title={c.section_geo} icon={<IconGlobe />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
            <InfoRow icon={<IconCapital />} label={c.capital} value={data.capital?.join(", ") || c.na} />
            <InfoRow icon={<IconPopulation />} label={c.population} value={formatNumber(data.population, c)} />
            <InfoRow icon={<IconArea />} label={c.area} value={data.area ? formatArea(data.area) : c.na} />
            <InfoRow
              label={c.pop_density}
              value={
                data.area && data.population
                  ? `${(data.population / data.area).toFixed(1)} ${c.per_km2}`
                  : c.na
              }
            />
            <InfoRow label={c.continents} value={data.continents?.join(", ") || c.na} />
            <InfoRow label={c.landlocked} value={data.landlocked ? c.yes : c.no} />
            <InfoRow
              label={c.coordinates}
              value={
                data.latlng ? (
                  <span className="coord-text text-sm" style={{ color: "var(--text-primary)" }}>
                    {data.latlng[0].toFixed(2)}°, {data.latlng[1].toFixed(2)}°
                  </span>
                ) : c.na
              }
            />
            <InfoRow
              label={c.borders}
              value={
                data.borderNames && data.borderNames.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">
                    {data.borderNames.map((b) => (
                      <button
                        key={b.code}
                        onClick={() => router.push(`/country/${encodeURIComponent(b.name)}`)}
                        className="atlas-pill text-xs cursor-pointer"
                        style={{ fontSize: "0.6875rem" }}
                      >
                        {b.name}
                      </button>
                    ))}
                  </span>
                ) : (
                  c.no_borders
                )
              }
            />
          </div>
        </Section>
      </AnimatedSection>

      {/* Government */}
      <AnimatedSection delay={0.1}>
        <Section title={c.section_government} icon={<IconGov />}>
          {data.practical.government ? (
            <>
              <InfoRow label={c.gov_type} value={data.practical.government.type} />
              <InfoRow label={c.head_of_state} value={data.practical.government.headOfState} />
              <InfoRow label={c.legislature} value={data.practical.government.legislature} />
            </>
          ) : (
            <InfoRow label={c.gov_type} value={c.gov_not_available} />
          )}
          <InfoRow label={c.un_member} value={data.unMember ? c.yes : c.no} />
          {data.government && <InfoRow label={c.demonym} value={data.government.replace("Demonym: ", "")} />}
        </Section>
      </AnimatedSection>

      {/* OECD Live Indicators — monthly/quarterly, far more current than World Bank */}
      {data.oecdData && (
        <AnimatedSection delay={0.13}>
          <LiveIndicatorsWidget oecdData={data.oecdData} />
        </AnimatedSection>
      )}

      {/* Macroeconomic Data — World Bank historical */}
      <AnimatedSection delay={0.15}>
        <Section title={c.section_economics}>
          <EconomicCharts economics={data.economics} />
        </Section>
      </AnimatedSection>

      {/* IMF Economic Forecasts */}
      {data.imfForecasts && Object.keys(data.imfForecasts).length > 0 && (
        <AnimatedSection delay={0.18}>
          <Section title={t.imf?.section_title ?? "IMF Economic Forecasts"}>
            <IMFForecastsSection forecasts={data.imfForecasts} />
          </Section>
        </AnimatedSection>
      )}

      {/* Currency & Exchange Rates */}
      <AnimatedSection delay={0.2}>
        <Section title={c.section_currency} icon={<IconCurrency />}>
          <InfoRow icon={<IconCurrency />} label={c.currency} value={data.practical.currency.join(", ")} />
          {data.practical.currencyCodes.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--atlas-border)" }}>
              <h3 className="atlas-section-label mb-3">
                {c.exchange_rates}
              </h3>
              <ExchangeRateWidget currencyCodes={data.practical.currencyCodes} />
            </div>
          )}
        </Section>
      </AnimatedSection>

      {/* Language & Communication */}
      <AnimatedSection delay={0.25}>
        <Section title={c.section_language} icon={<IconLanguage />}>
          <InfoRow icon={<IconLanguage />} label={c.language} value={data.practical.languages.join(", ")} />
          <InfoRow icon={<IconPhone />} label={c.calling_code} value={data.practical.telephone.callingCode} />
          <InfoRow icon={<IconShield />} label={c.emergency_number} value={data.practical.telephone.emergencyNumber} />
        </Section>
      </AnimatedSection>

      {/* Religion */}
      <AnimatedSection delay={0.3}>
        <Section title={c.section_religion}>
          <div className="flex flex-wrap gap-2">
            {data.practical.religions.map((r) => (
              <span
                key={r}
                className="atlas-pill"
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  color: "var(--atlas-amber)",
                  borderColor: "rgba(245, 158, 11, 0.25)",
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </Section>
      </AnimatedSection>

      {/* Climate */}
      <AnimatedSection delay={0.35}>
        <Section title={`${c.section_climate} — ${data.practical.climate.currentMonth}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{c.current_season}:</span>
            <span
              className="atlas-pill"
              style={{
                background: "rgba(14, 165, 233, 0.12)",
                color: "#38bdf8",
                borderColor: "rgba(14, 165, 233, 0.25)",
              }}
            >
              {data.practical.climate.season}
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {data.practical.climate.description}
          </p>
        </Section>
      </AnimatedSection>

      {/* Time Zones */}
      <AnimatedSection delay={0.4}>
        <Section title={c.section_timezones} icon={<IconClock />}>
          <div className="flex flex-wrap gap-2">
            {data.practical.timezones.map((tz) => (
              <span key={tz} className="atlas-pill coord-text" style={{ fontSize: "0.75rem" }}>
                {tz}
              </span>
            ))}
          </div>
        </Section>
      </AnimatedSection>

      {/* Precautions */}
      <AnimatedSection delay={0.45}>
        <Section title={c.section_precautions} icon={<IconShield />}>
          <ul className="space-y-2.5">
            {data.practical.precautions.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--atlas-gold)" }} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      </AnimatedSection>

      {/* Travel Links */}
      <AnimatedSection delay={0.5}>
        <Section title={c.section_travel}>
          <TravelLinks countryName={data.name.common} capital={data.capital?.[0]} />
        </Section>
      </AnimatedSection>

      {/* Essentials */}
      <AnimatedSection delay={0.55}>
        <Section title={c.section_essentials}>
          <ul className="space-y-2.5">
            {data.practical.essentials.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--atlas-teal)" }} />
                {e}
              </li>
            ))}
          </ul>
          {data.maps?.googleMaps && (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--atlas-border)" }}>
              <a
                href={data.maps.googleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--atlas-gold)" }}
              >
                {c.view_google_maps} &rarr;
              </a>
            </div>
          )}
        </Section>
      </AnimatedSection>
    </div>
  );
}
