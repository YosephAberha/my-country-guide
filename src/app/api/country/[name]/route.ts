import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache with TTL (24 hours for country data)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

// Fetch with timeout + Next.js persistent cache (revalidates every 24h)
async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Do NOT pass next: { revalidate } here — combining it with a signal causes
    // Next.js to buffer the body for its cache before we read it, making the
    // response unreadable when we call .json(). Use the in-memory Map instead.
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch country data from REST Countries API (cached)
async function fetchCountryData(name: string) {
  const cacheKey = `country:${name.toLowerCase()}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  let res = await fetchWithTimeout(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=true`,
    8000,
  );
  if (!res.ok) {
    res = await fetchWithTimeout(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`,
      8000,
    );
  }
  if (!res.ok) return null;
  const data = await res.json();
  const result = Array.isArray(data) ? data[0] : null;
  if (result) setCache(cacheKey, result);
  return result;
}

// Fetch macroeconomic indicators from World Bank API (cached)
async function fetchWorldBankData(countryCode: string) {
  const cacheKey = `worldbank:${countryCode}`;
  const cached = getCached<Record<string, { label: string; data: { year: number; value: number | null }[] }>>(cacheKey);
  if (cached) return cached;

  const indicators = [
    { id: "NY.GDP.MKTP.CD", label: "GDP (Current USD)" },
    { id: "NY.GDP.MKTP.KD.ZG", label: "GDP Growth (%)" },
    { id: "FP.CPI.TOTL.ZG", label: "Inflation (%)" },
    { id: "SL.UEM.TOTL.ZS", label: "Unemployment (%)" },
    { id: "SP.POP.TOTL", label: "Population" },
    { id: "SP.DYN.LE00.IN", label: "Life Expectancy" },
    { id: "SE.ADT.LITR.ZS", label: "Literacy Rate (%)" },
    { id: "BN.CAB.XOKA.CD", label: "Current Account Balance" },
    { id: "GC.DOD.TOTL.GD.ZS", label: "Government Debt (% GDP)" },
    { id: "NE.TRD.GNFS.ZS", label: "Trade (% GDP)" },
    { id: "BX.KLT.DINV.CD.WD", label: "FDI Inflows (USD)" },
    { id: "NE.EXP.GNFS.ZS", label: "Exports (% GDP)" },
    { id: "NE.IMP.GNFS.ZS", label: "Imports (% GDP)" },
    { id: "IT.NET.USER.ZS", label: "Internet Users (%)" },
    { id: "SI.POV.GINI", label: "Gini Index" },
  ];

  const results: Record<
    string,
    { label: string; data: { year: number; value: number | null }[]; lastYear: number }
  > = {};

  const fetches = indicators.map(async (ind) => {
    try {
      // mrv=15 → "most recent 15 values" — always returns the absolute latest
      // data World Bank has published, regardless of current year
      const res = await fetchWithTimeout(
        `https://api.worldbank.org/v2/country/${countryCode}/indicator/${ind.id}?format=json&mrv=15`,
        5000,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (!json[1]) return;

      const points = json[1]
        .filter((d: { value: number | null }) => d.value !== null)
        .map((d: { date: string; value: number }) => ({
          year: parseInt(d.date),
          value: d.value,
        }))
        .sort((a: { year: number }, b: { year: number }) => a.year - b.year);

      if (points.length > 0) {
        results[ind.id] = {
          label: ind.label,
          data: points,
          lastYear: points[points.length - 1].year,
        };
      }
    } catch {
      // Skip failed/timed-out indicators
    }
  });

  await Promise.all(fetches);
  setCache(cacheKey, results);
  return results;
}

// Parse OECD SDMX-JSON response into time-series points
function parseSDMX(json: Record<string, unknown>): { period: string; value: number }[] {
  const datasets = json.dataSets as Array<{ series: Record<string, { observations: Record<string, number[]> }> }> | undefined;
  if (!datasets?.[0]?.series) return [];

  const seriesKey = Object.keys(datasets[0].series)[0];
  const observations = datasets[0].series[seriesKey]?.observations;
  if (!observations) return [];

  const structure = json.structure as { dimensions?: { observation?: Array<{ id: string; values: { id: string }[] }> } } | undefined;
  const timeDim = structure?.dimensions?.observation?.find((d) => d.id === "TIME_PERIOD");
  if (!timeDim) return [];

  return timeDim.values
    .map((t, i) => ({ period: t.id, value: observations[String(i)]?.[0] ?? null }))
    .filter((p): p is { period: string; value: number } => p.value !== null && !isNaN(p.value));
}

// Fetch OECD live indicators (quarterly GDP growth, monthly CPI, monthly unemployment)
// Free, no API key. Only available for the 38 OECD member countries.
async function fetchOECDData(cca3: string): Promise<{
  gdpGrowth: { period: string; value: number }[];
  cpi: { period: string; value: number }[];
  unemployment: { period: string; value: number }[];
} | null> {
  const cacheKey = `oecd:${cca3.toUpperCase()}`;
  const cached = getCached<{ gdpGrowth: { period: string; value: number }[]; cpi: { period: string; value: number }[]; unemployment: { period: string; value: number }[] }>(cacheKey);
  if (cached) return cached;

  const iso3 = cca3.toUpperCase();
  const base = "https://stats.oecd.org/SDMX-JSON/data";
  const twoYearsAgo = new Date().getFullYear() - 2;

  // Each request is individually guarded so one failure doesn't kill the others
  async function safeFetch(url: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) return null;
      return await res.json() as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const [gdpJson, cpiJson, uerJson] = await Promise.all([
    safeFetch(`${base}/QNA/${iso3}.B1_GA.GPSA.Q/OECD?startTimePeriod=${twoYearsAgo}-Q1`),
    safeFetch(`${base}/PRICES_CPI/${iso3}.CPALTT01.GY.M/OECD?startTimePeriod=${twoYearsAgo}-01`),
    safeFetch(`${base}/STLABOUR/${iso3}.UNRTOT.ST.M/OECD?startTimePeriod=${twoYearsAgo}-01`),
  ]);

  function safeSDMX(json: Record<string, unknown> | null): { period: string; value: number }[] {
    if (!json) return [];
    try { return parseSDMX(json); } catch { return []; }
  }

  const gdpGrowth    = safeSDMX(gdpJson);
  const cpi          = safeSDMX(cpiJson);
  const unemployment = safeSDMX(uerJson);

  if (gdpGrowth.length === 0 && cpi.length === 0 && unemployment.length === 0) return null;

  const result = { gdpGrowth, cpi, unemployment };
  setCache(cacheKey, result, 3 * 60 * 60 * 1000);
  return result;
}

// Fetch IMF World Economic Outlook forecasts (includes projections for current + future years)
async function fetchIMFData(cca3: string): Promise<Record<string, { label: string; data: { year: number; value: number | null; projected: boolean }[] }> | null> {
  const cacheKey = `imf:${cca3.toUpperCase()}`;
  const cached = getCached<Record<string, { label: string; data: { year: number; value: number | null; projected: boolean }[] }>>(cacheKey);
  if (cached) return cached;

  const indicators = [
    { id: "NGDP_RPCH", label: "Real GDP Growth (%)" },
    { id: "PCPIPCH", label: "Inflation, Avg Prices (%)" },
    { id: "LUR", label: "Unemployment (%)" },
    { id: "BCA_NGDPD", label: "Current Account (% GDP)" },
  ];

  const currentYear = new Date().getFullYear();

  try {
    const res = await fetchWithTimeout(
      `https://www.imf.org/external/datamapper/api/v1/${indicators.map((i) => i.id).join(",")}/${cca3.toUpperCase()}`,
      10000,
    );
    if (!res.ok) return null;
    const json = await res.json();

    const results: Record<string, { label: string; data: { year: number; value: number | null; projected: boolean }[] }> = {};

    for (const ind of indicators) {
      const countryData = json.values?.[ind.id]?.[cca3.toUpperCase()];
      if (!countryData) continue;

      const points = (Object.entries(countryData as Record<string, string | null>) as [string, string | null][])
        .map(([year, value]) => ({
          year: parseInt(year),
          value: value !== null && value !== "" ? parseFloat(value) : null,
          projected: parseInt(year) >= currentYear,
        }))
        .filter((p) => !isNaN(p.year) && p.year >= 2015)
        .sort((a, b) => a.year - b.year);

      if (points.length > 0) {
        results[ind.id] = { label: ind.label, data: points };
      }
    }

    if (Object.keys(results).length > 0) {
      setCache(cacheKey, results);
      return results;
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch US State Department travel advisory for a country (level 1–4)
interface TravelAdvisoryEntry {
  countryCode: string;
  advisoryLevel: string;
  ca_tagline: string;
  url: string;
}

async function fetchTravelAdvisory(cca2: string): Promise<{ level: number; message: string; url: string } | null> {
  const listKey = "travel-advisories-list";
  let list = getCached<TravelAdvisoryEntry[]>(listKey);

  if (!list) {
    try {
      const res = await fetchWithTimeout(
        "https://travel.state.gov/content/dam/traveldata/travel-advisories/travel-advisories.json",
        8000,
      );
      if (!res.ok) return null;
      const json = await res.json();
      list = (json.graph || []) as TravelAdvisoryEntry[];
      if (list.length > 0) setCache(listKey, list, 3 * 60 * 60 * 1000); // 3h cache for advisory list
    } catch {
      return null;
    }
  }

  if (!list || list.length === 0) return null;

  const advisory = list.find((a) => a.countryCode?.toUpperCase() === cca2.toUpperCase());
  if (!advisory) return null;

  return {
    level: parseInt(advisory.advisoryLevel) || 1,
    message: advisory.ca_tagline || "",
    url: advisory.url || "",
  };
}

// Religion data by country (common name -> religions)
const countryReligions: Record<string, string[]> = {
  // Europe
  Germany: ["Christianity (Catholic & Protestant)", "Islam", "Judaism", "Non-religious"],
  France: ["Christianity (Catholic)", "Islam", "Judaism", "Non-religious"],
  "United Kingdom": ["Christianity (Anglican & Catholic)", "Islam", "Hinduism", "Sikhism", "Judaism", "Non-religious"],
  Italy: ["Christianity (Catholic)", "Islam", "Non-religious"],
  Spain: ["Christianity (Catholic)", "Islam", "Non-religious"],
  Portugal: ["Christianity (Catholic)", "Non-religious"],
  Netherlands: ["Christianity (Catholic & Protestant)", "Islam", "Non-religious"],
  Belgium: ["Christianity (Catholic)", "Islam", "Non-religious"],
  Switzerland: ["Christianity (Catholic & Protestant)", "Islam", "Non-religious"],
  Austria: ["Christianity (Catholic)", "Islam", "Non-religious"],
  Poland: ["Christianity (Catholic)", "Non-religious"],
  Sweden: ["Christianity (Lutheran)", "Islam", "Non-religious"],
  Norway: ["Christianity (Lutheran)", "Islam", "Non-religious"],
  Denmark: ["Christianity (Lutheran)", "Islam", "Non-religious"],
  Finland: ["Christianity (Lutheran & Orthodox)", "Non-religious"],
  Ireland: ["Christianity (Catholic)", "Non-religious"],
  Greece: ["Christianity (Greek Orthodox)", "Islam"],
  Czechia: ["Non-religious", "Christianity (Catholic)"],
  Romania: ["Christianity (Romanian Orthodox)", "Christianity (Catholic & Protestant)"],
  Hungary: ["Christianity (Catholic & Calvinist)", "Non-religious"],
  Croatia: ["Christianity (Catholic)", "Christianity (Orthodox)"],
  Serbia: ["Christianity (Serbian Orthodox)", "Islam", "Christianity (Catholic)"],
  Bulgaria: ["Christianity (Bulgarian Orthodox)", "Islam"],
  Ukraine: ["Christianity (Orthodox & Greek Catholic)", "Non-religious"],
  Russia: ["Christianity (Russian Orthodox)", "Islam", "Buddhism", "Judaism", "Non-religious"],
  Turkey: ["Islam (Sunni)", "Alevism", "Christianity", "Non-religious"],
  Iceland: ["Christianity (Lutheran)", "Norse Paganism (Asatru)", "Non-religious"],
  Lithuania: ["Christianity (Catholic)", "Non-religious"],
  Latvia: ["Christianity (Lutheran & Catholic & Orthodox)", "Non-religious"],
  Estonia: ["Non-religious", "Christianity (Lutheran & Orthodox)"],
  Slovakia: ["Christianity (Catholic)", "Christianity (Protestant)", "Non-religious"],
  Slovenia: ["Christianity (Catholic)", "Islam", "Non-religious"],
  "North Macedonia": ["Christianity (Macedonian Orthodox)", "Islam"],
  Albania: ["Islam", "Christianity (Orthodox & Catholic)", "Bektashism"],
  Montenegro: ["Christianity (Serbian Orthodox)", "Islam", "Christianity (Catholic)"],
  "Bosnia and Herzegovina": ["Islam", "Christianity (Serbian Orthodox)", "Christianity (Catholic)"],
  Moldova: ["Christianity (Moldovan Orthodox)", "Non-religious"],
  Kosovo: ["Islam", "Christianity (Serbian Orthodox & Catholic)"],
  Luxembourg: ["Christianity (Catholic)", "Non-religious"],
  Malta: ["Christianity (Catholic)"],
  Cyprus: ["Christianity (Greek Orthodox)", "Islam"],
  // Americas
  "United States": ["Christianity (Protestant & Catholic)", "Judaism", "Islam", "Hinduism", "Buddhism", "Non-religious"],
  Canada: ["Christianity (Catholic & Protestant)", "Islam", "Sikhism", "Hinduism", "Judaism", "Non-religious"],
  Mexico: ["Christianity (Catholic)", "Christianity (Protestant)", "Non-religious"],
  Brazil: ["Christianity (Catholic & Evangelical)", "Spiritism", "Afro-Brazilian religions", "Non-religious"],
  Argentina: ["Christianity (Catholic)", "Christianity (Evangelical)", "Non-religious"],
  Colombia: ["Christianity (Catholic)", "Christianity (Protestant)", "Non-religious"],
  Chile: ["Christianity (Catholic)", "Christianity (Evangelical)", "Non-religious"],
  Peru: ["Christianity (Catholic)", "Christianity (Evangelical)", "Indigenous beliefs"],
  Venezuela: ["Christianity (Catholic)", "Christianity (Protestant)", "Santeria"],
  Cuba: ["Christianity (Catholic)", "Santeria", "Non-religious"],
  Jamaica: ["Christianity (Protestant & Catholic)", "Rastafarianism"],
  "Trinidad and Tobago": ["Christianity", "Hinduism", "Islam"],
  Haiti: ["Christianity (Catholic & Protestant)", "Vodou"],
  "Dominican Republic": ["Christianity (Catholic & Evangelical)", "Non-religious"],
  Guatemala: ["Christianity (Catholic & Evangelical)", "Maya spirituality"],
  Honduras: ["Christianity (Catholic & Evangelical)"],
  "El Salvador": ["Christianity (Catholic & Evangelical)"],
  Nicaragua: ["Christianity (Catholic & Evangelical)"],
  "Costa Rica": ["Christianity (Catholic & Evangelical)", "Non-religious"],
  Panama: ["Christianity (Catholic & Evangelical)", "Islam", "Indigenous beliefs"],
  Ecuador: ["Christianity (Catholic)", "Indigenous beliefs"],
  Bolivia: ["Christianity (Catholic)", "Indigenous Andean beliefs"],
  Paraguay: ["Christianity (Catholic)", "Christianity (Protestant)"],
  Uruguay: ["Non-religious", "Christianity (Catholic)", "Afro-Uruguayan beliefs"],
  // Middle East
  "Saudi Arabia": ["Islam (Sunni & Shia)"],
  "United Arab Emirates": ["Islam", "Christianity", "Hinduism", "Buddhism"],
  Qatar: ["Islam", "Christianity", "Hinduism"],
  Kuwait: ["Islam (Sunni & Shia)", "Christianity", "Hinduism"],
  Bahrain: ["Islam (Shia & Sunni)", "Christianity"],
  Oman: ["Islam (Ibadi & Sunni)", "Hinduism", "Christianity"],
  Yemen: ["Islam (Sunni & Shia)"],
  Iraq: ["Islam (Shia & Sunni)", "Christianity", "Yazidism"],
  Syria: ["Islam (Sunni)", "Islam (Alawite & Shia)", "Christianity", "Druze"],
  Jordan: ["Islam (Sunni)", "Christianity"],
  Lebanon: ["Islam (Sunni & Shia)", "Christianity (Maronite & Orthodox)", "Druze"],
  Israel: ["Judaism", "Islam", "Christianity", "Druze"],
  Palestine: ["Islam (Sunni)", "Christianity"],
  Iran: ["Islam (Shia)", "Sunni Islam", "Zoroastrianism", "Christianity", "Judaism", "Bahai"],
  // Asia
  China: ["Chinese folk religion", "Buddhism", "Taoism", "Christianity", "Islam", "Non-religious"],
  Japan: ["Shintoism", "Buddhism", "Christianity", "Non-religious"],
  "South Korea": ["Christianity (Protestant & Catholic)", "Buddhism", "Non-religious"],
  "North Korea": ["Non-religious (state atheism)", "Korean shamanism", "Buddhism"],
  India: ["Hinduism", "Islam", "Christianity", "Sikhism", "Buddhism", "Jainism"],
  Pakistan: ["Islam (Sunni & Shia)", "Hinduism", "Christianity", "Ahmadiyya"],
  Bangladesh: ["Islam (Sunni)", "Hinduism", "Buddhism", "Christianity"],
  Indonesia: ["Islam", "Christianity (Protestant & Catholic)", "Hinduism", "Buddhism", "Confucianism"],
  Malaysia: ["Islam", "Buddhism", "Christianity", "Hinduism", "Chinese folk religion"],
  Thailand: ["Buddhism (Theravada)", "Islam", "Christianity"],
  Vietnam: ["Buddhism", "Christianity (Catholic)", "Cao Dai", "Hoa Hao", "Non-religious"],
  Philippines: ["Christianity (Catholic)", "Christianity (Protestant)", "Islam"],
  Myanmar: ["Buddhism (Theravada)", "Christianity", "Islam", "Hinduism"],
  Cambodia: ["Buddhism (Theravada)", "Islam"],
  Laos: ["Buddhism (Theravada)", "Animism"],
  Nepal: ["Hinduism", "Buddhism", "Islam", "Kirant Mundhum"],
  "Sri Lanka": ["Buddhism (Theravada)", "Hinduism", "Islam", "Christianity"],
  Mongolia: ["Buddhism (Tibetan)", "Islam", "Shamanism", "Non-religious"],
  Afghanistan: ["Islam (Sunni & Shia)"],
  Singapore: ["Buddhism", "Christianity", "Islam", "Taoism", "Hinduism", "Non-religious"],
  Taiwan: ["Buddhism", "Taoism", "Christianity", "Chinese folk religion"],
  Uzbekistan: ["Islam (Sunni)", "Christianity (Orthodox)", "Non-religious"],
  Kazakhstan: ["Islam (Sunni)", "Christianity (Orthodox)", "Non-religious"],
  Kyrgyzstan: ["Islam (Sunni)", "Christianity (Orthodox)"],
  Tajikistan: ["Islam (Sunni)", "Non-religious"],
  Turkmenistan: ["Islam (Sunni)", "Christianity (Orthodox)"],
  // Africa
  Nigeria: ["Islam", "Christianity (Catholic & Protestant & Pentecostal)", "Traditional beliefs"],
  Egypt: ["Islam (Sunni)", "Christianity (Coptic Orthodox)"],
  "South Africa": ["Christianity (Protestant & Catholic & African churches)", "Islam", "Hinduism", "Traditional beliefs"],
  Ethiopia: ["Christianity (Ethiopian Orthodox)", "Islam", "Traditional beliefs"],
  Kenya: ["Christianity (Protestant & Catholic)", "Islam", "Traditional beliefs"],
  Tanzania: ["Christianity", "Islam", "Traditional beliefs"],
  Ghana: ["Christianity (Pentecostal & Protestant & Catholic)", "Islam", "Traditional beliefs"],
  "Democratic Republic of the Congo": ["Christianity (Catholic & Protestant)", "Islam", "Traditional beliefs"],
  Morocco: ["Islam (Sunni)", "Judaism", "Christianity"],
  Tunisia: ["Islam (Sunni)", "Christianity", "Judaism"],
  Algeria: ["Islam (Sunni)", "Christianity", "Judaism"],
  Libya: ["Islam (Sunni)", "Christianity"],
  Senegal: ["Islam (Sunni)", "Christianity", "Traditional beliefs"],
  "Ivory Coast": ["Islam", "Christianity", "Traditional beliefs"],
  Cameroon: ["Christianity", "Islam", "Traditional beliefs"],
  Uganda: ["Christianity (Catholic & Anglican)", "Islam", "Traditional beliefs"],
  Rwanda: ["Christianity (Catholic & Protestant)", "Islam", "Traditional beliefs"],
  Zimbabwe: ["Christianity", "Traditional beliefs"],
  Mozambique: ["Christianity", "Islam", "Traditional beliefs"],
  Madagascar: ["Christianity", "Traditional beliefs", "Islam"],
  Angola: ["Christianity (Catholic & Protestant)", "Traditional beliefs"],
  Sudan: ["Islam (Sunni)", "Christianity", "Traditional beliefs"],
  "South Sudan": ["Christianity", "Traditional beliefs", "Islam"],
  Somalia: ["Islam (Sunni)"],
  Eritrea: ["Christianity (Orthodox & Catholic)", "Islam (Sunni)"],
  Namibia: ["Christianity (Lutheran & Catholic)", "Traditional beliefs"],
  Botswana: ["Christianity", "Traditional beliefs", "Non-religious"],
  Zambia: ["Christianity (Protestant & Catholic)", "Traditional beliefs"],
  Malawi: ["Christianity", "Islam", "Traditional beliefs"],
  // Oceania
  Australia: ["Christianity (Catholic & Anglican)", "Islam", "Buddhism", "Hinduism", "Non-religious"],
  "New Zealand": ["Christianity (Catholic & Anglican)", "Hinduism", "Islam", "Non-religious", "Maori spirituality"],
  Fiji: ["Christianity (Methodist & Catholic)", "Hinduism", "Islam"],
  "Papua New Guinea": ["Christianity (Catholic & Lutheran & Protestant)", "Traditional beliefs"],
};

// Get religion data for a country — fallback to region-based defaults
function getReligions(countryName: string, region: string, subregion: string): string[] {
  if (countryReligions[countryName]) return countryReligions[countryName];

  const regionDefaults: Record<string, string[]> = {
    "Western Europe": ["Christianity", "Islam", "Non-religious"],
    "Northern Europe": ["Christianity (Lutheran/Protestant)", "Non-religious"],
    "Southern Europe": ["Christianity (Catholic)", "Non-religious"],
    "Eastern Europe": ["Christianity (Orthodox/Catholic)", "Non-religious"],
    "Northern America": ["Christianity", "Judaism", "Islam", "Non-religious"],
    "Central America": ["Christianity (Catholic & Evangelical)"],
    "South America": ["Christianity (Catholic)", "Christianity (Protestant)", "Non-religious"],
    "Eastern Asia": ["Buddhism", "Confucianism", "Taoism", "Non-religious"],
    "South-Eastern Asia": ["Islam", "Buddhism", "Christianity"],
    "Southern Asia": ["Hinduism", "Islam", "Buddhism"],
    "Western Asia": ["Islam", "Christianity", "Judaism"],
    "Central Asia": ["Islam (Sunni)", "Christianity (Orthodox)"],
    "Northern Africa": ["Islam (Sunni)", "Christianity"],
    "Western Africa": ["Islam", "Christianity", "Traditional beliefs"],
    "Eastern Africa": ["Christianity", "Islam", "Traditional beliefs"],
    "Southern Africa": ["Christianity", "Traditional beliefs"],
    "Middle Africa": ["Christianity", "Islam", "Traditional beliefs"],
    Oceania: ["Christianity", "Traditional beliefs"],
    "Australia and New Zealand": ["Christianity", "Non-religious"],
  };

  return regionDefaults[subregion] || regionDefaults[region] || ["Information not available"];
}

// i18n helpers for climate
const i18n = {
  en: {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    seasons: { Spring: "Spring", Summer: "Summer", Autumn: "Autumn", Winter: "Winter", "Wet Season": "Wet Season", "Dry Season": "Dry Season", Unknown: "Unknown" },
    climate: {
      unknown: "Climate data varies by region.",
      tropical: (isWet: boolean, m: string) => `Tropical climate. Currently in the ${isWet ? "wet" : "dry"} season (${m}). Temperatures typically 25-35°C (77-95°F) year-round. ${isWet ? "Expect frequent heavy rainfall and high humidity." : "Less rainfall, still warm and humid."}`,
      subtropical: {
        Spring: (m: string) => `Subtropical ${m}. Warming up with temperatures around 25-32°C (77-90°F). Transitioning toward the wetter season. Humidity increasing.`,
        Summer: (m: string) => `Subtropical summer in ${m}. Hot and humid, 28-38°C (82-100°F). Peak monsoon/rainy season in many areas. Pack rain gear and light clothing.`,
        Autumn: (m: string) => `Subtropical ${m}. Temperatures cooling to 22-30°C (72-86°F). Rainfall decreasing. Pleasant travel conditions.`,
        Winter: (m: string) => `Subtropical winter in ${m}. Mild and dry, 15-25°C (59-77°F). Most comfortable season for visiting. Low humidity.`,
      },
      warmtemp: {
        Spring: (m: string) => `${m} brings warm spring weather, 15-25°C (59-77°F). Flowers blooming, pleasant conditions. Occasional rain showers.`,
        Summer: (m: string) => `Hot summer in ${m}. Temperatures 28-40°C (82-104°F). Dry conditions in Mediterranean areas. Stay hydrated, seek shade midday.`,
        Autumn: (m: string) => `Autumn in ${m}. Cooling to 15-25°C (59-77°F). Pleasant temperatures, some rainfall returning. Great season for travel.`,
        Winter: (m: string) => `Winter in ${m}. Cool to mild, 5-15°C (41-59°F). Rain more common. Pack layers and a jacket.`,
      },
      temperate: {
        Spring: (m: string) => `Spring in ${m}. Temperatures rising to 8-18°C (46-64°F). Days getting longer. Variable weather — pack layers and a rain jacket.`,
        Summer: (m: string) => `Summer in ${m}. Warm and long days, 18-30°C (64-86°F). Peak tourism season. Best time for outdoor activities.`,
        Autumn: (m: string) => `Autumn in ${m}. Cooling to 5-15°C (41-59°F). Beautiful foliage. Increasing rainfall. Bring warm layers and waterproofs.`,
        Winter: (m: string) => `Winter in ${m}. Cold, 0-8°C (32-46°F). Short daylight hours. Snow possible. Pack warm clothing, hat, and gloves.`,
      },
      subarctic: {
        Spring: (m: string) => `Subarctic spring in ${m}. Slowly warming, -2 to 10°C (28-50°F). Snow melting, days getting much longer. Mud season.`,
        Summer: (m: string) => `Brief subarctic summer in ${m}. Cool to mild, 10-20°C (50-68°F). Near-midnight sun. Best time to visit. Mosquitoes can be heavy.`,
        Autumn: (m: string) => `Subarctic autumn in ${m}. Rapidly cooling, 0-8°C (32-46°F). Northern lights appearing. Days shortening fast. Warm clothing essential.`,
        Winter: (m: string) => `Subarctic winter in ${m}. Very cold, -20 to -5°C (-4 to 23°F). Very short days or polar night. Heavy winter gear essential.`,
      },
      arctic: {
        Spring: (m: string) => `Arctic spring in ${m}. Still very cold, -15 to 0°C (5-32°F). Increasing daylight. Snow and ice still present.`,
        Summer: (m: string) => `Arctic summer in ${m}. Cool, 0-10°C (32-50°F). Midnight sun. Brief window for travel. Unique wildlife viewing.`,
        Autumn: (m: string) => `Arctic autumn in ${m}. Freezing rapidly, -10 to 0°C (14-32°F). Northern lights. Days disappearing. Extreme cold gear needed.`,
        Winter: (m: string) => `Arctic winter in ${m}. Extreme cold, -30 to -15°C (-22 to 5°F). Polar night. Travel extremely limited. Survival gear mandatory.`,
      },
    },
    precautions: {
      docs: "Keep copies of important documents",
      insurance: "Get travel insurance",
      visa: "Check visa requirements",
      customs: "Research local customs and laws",
      driveLeft: "Traffic drives on the LEFT side of the road",
      driveRight: "Traffic drives on the RIGHT side of the road",
    },
    essentials: {
      driving: (side: string) => `Driving side: ${side}`,
      tld: (tld: string) => `Internet TLD: ${tld}`,
      calling: (code: string) => `Country calling code: ${code}`,
      un: (member: boolean) => `UN Member: ${member ? "Yes" : "No"}`,
      week: (day: string) => `Start of week: ${day}`,
    },
    checkLocally: "Check locally",
  },
  de: {
    months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    seasons: { Spring: "Frühling", Summer: "Sommer", Autumn: "Herbst", Winter: "Winter", "Wet Season": "Regenzeit", "Dry Season": "Trockenzeit", Unknown: "Unbekannt" },
    climate: {
      unknown: "Klimadaten variieren je nach Region.",
      tropical: (isWet: boolean, m: string) => `Tropisches Klima. Derzeit in der ${isWet ? "Regen" : "Trocken"}zeit (${m}). Temperaturen ganzjährig 25-35°C. ${isWet ? "Häufige starke Regenfälle und hohe Luftfeuchtigkeit." : "Weniger Niederschlag, dennoch warm und feucht."}`,
      subtropical: {
        Spring: (m: string) => `Subtropischer ${m}. Erwärmung auf 25-32°C. Übergang zur feuchteren Jahreszeit. Luftfeuchtigkeit steigt.`,
        Summer: (m: string) => `Subtropischer Sommer im ${m}. Heiß und feucht, 28-38°C. Monsun-/Regensaison in vielen Gebieten. Regenkleidung und leichte Kleidung einpacken.`,
        Autumn: (m: string) => `Subtropischer ${m}. Abkühlung auf 22-30°C. Niederschlag nimmt ab. Angenehme Reisebedingungen.`,
        Winter: (m: string) => `Subtropischer Winter im ${m}. Mild und trocken, 15-25°C. Angenehmste Reisezeit. Geringe Luftfeuchtigkeit.`,
      },
      warmtemp: {
        Spring: (m: string) => `${m} bringt warmes Frühlingswetter, 15-25°C. Blütezeit, angenehme Bedingungen. Gelegentliche Regenschauer.`,
        Summer: (m: string) => `Heißer Sommer im ${m}. Temperaturen 28-40°C. Trockene Bedingungen in Mittelmeergebieten. Viel trinken, Mittagssonne meiden.`,
        Autumn: (m: string) => `Herbst im ${m}. Abkühlung auf 15-25°C. Angenehme Temperaturen, etwas mehr Regen. Gute Reisezeit.`,
        Winter: (m: string) => `Winter im ${m}. Kühl bis mild, 5-15°C. Mehr Regen. Schichten und Jacke einpacken.`,
      },
      temperate: {
        Spring: (m: string) => `Frühling im ${m}. Temperaturen steigen auf 8-18°C. Tage werden länger. Wechselhaftes Wetter — Schichten und Regenjacke einpacken.`,
        Summer: (m: string) => `Sommer im ${m}. Warm und lange Tage, 18-30°C. Hauptreisezeit. Beste Zeit für Outdoor-Aktivitäten.`,
        Autumn: (m: string) => `Herbst im ${m}. Abkühlung auf 5-15°C. Schöne Laubfärbung. Zunehmender Regen. Warme Kleidung und Regenschutz mitbringen.`,
        Winter: (m: string) => `Winter im ${m}. Kalt, 0-8°C. Kurze Tage. Schnee möglich. Warme Kleidung, Mütze und Handschuhe einpacken.`,
      },
      subarctic: {
        Spring: (m: string) => `Subarktischer Frühling im ${m}. Langsame Erwärmung, -2 bis 10°C. Schneeschmelze, Tage werden deutlich länger.`,
        Summer: (m: string) => `Kurzer subarktischer Sommer im ${m}. Kühl bis mild, 10-20°C. Fast Mitternachtssonne. Beste Reisezeit. Mücken können zahlreich sein.`,
        Autumn: (m: string) => `Subarktischer Herbst im ${m}. Schnelle Abkühlung, 0-8°C. Nordlichter erscheinen. Tage werden schnell kürzer. Warme Kleidung unerlässlich.`,
        Winter: (m: string) => `Subarktischer Winter im ${m}. Sehr kalt, -20 bis -5°C. Sehr kurze Tage oder Polarnacht. Schwere Winterausrüstung unerlässlich.`,
      },
      arctic: {
        Spring: (m: string) => `Arktischer Frühling im ${m}. Noch sehr kalt, -15 bis 0°C. Zunehmendes Tageslicht. Schnee und Eis noch vorhanden.`,
        Summer: (m: string) => `Arktischer Sommer im ${m}. Kühl, 0-10°C. Mitternachtssonne. Kurzes Reisefenster. Einzigartige Tierbeobachtungen.`,
        Autumn: (m: string) => `Arktischer Herbst im ${m}. Schnelles Einfrieren, -10 bis 0°C. Nordlichter. Tage verschwinden. Extreme Kälteschutzausrüstung nötig.`,
        Winter: (m: string) => `Arktischer Winter im ${m}. Extreme Kälte, -30 bis -15°C. Polarnacht. Reisen extrem eingeschränkt. Überlebensausrüstung Pflicht.`,
      },
    },
    precautions: {
      docs: "Kopien wichtiger Dokumente aufbewahren",
      insurance: "Reiseversicherung abschließen",
      visa: "Visabestimmungen prüfen",
      customs: "Lokale Bräuche und Gesetze recherchieren",
      driveLeft: "Der Verkehr fährt auf der LINKEN Straßenseite",
      driveRight: "Der Verkehr fährt auf der RECHTEN Straßenseite",
    },
    essentials: {
      driving: (side: string) => `Fahrseite: ${side === "left" ? "links" : "rechts"}`,
      tld: (tld: string) => `Internet-TLD: ${tld}`,
      calling: (code: string) => `Landesvorwahl: ${code}`,
      un: (member: boolean) => `UN-Mitglied: ${member ? "Ja" : "Nein"}`,
      week: (day: string) => `Wochenbeginn: ${day === "monday" ? "Montag" : day === "sunday" ? "Sonntag" : day === "saturday" ? "Samstag" : day}`,
    },
    checkLocally: "Vor Ort prüfen",
  },
};

type Locale = "en" | "de";

// Seasonal climate data based on latitude, hemisphere, current month and locale
function getSeasonalClimate(latlng: number[] | undefined, month: number, locale: Locale): { season: string; description: string; currentMonth: string } {
  const l = i18n[locale];
  const currentMonth = l.months[month];

  if (!latlng) return { season: l.seasons.Unknown, description: l.climate.unknown, currentMonth };

  const lat = latlng[0];
  const absLat = Math.abs(lat);
  const isSouthern = lat < 0;

  let seasonKey: "Spring" | "Summer" | "Autumn" | "Winter";
  const seasonMonth = isSouthern ? ((month + 6) % 12) : month;

  if (seasonMonth >= 2 && seasonMonth <= 4) seasonKey = "Spring";
  else if (seasonMonth >= 5 && seasonMonth <= 7) seasonKey = "Summer";
  else if (seasonMonth >= 8 && seasonMonth <= 10) seasonKey = "Autumn";
  else seasonKey = "Winter";

  if (absLat < 10) {
    const isWet = isSouthern ? (month >= 10 || month <= 3) : (month >= 5 && month <= 9);
    return {
      season: isWet ? l.seasons["Wet Season"] : l.seasons["Dry Season"],
      description: l.climate.tropical(isWet, currentMonth),
      currentMonth,
    };
  }

  const zone = absLat < 23.5 ? "subtropical" : absLat < 35 ? "warmtemp" : absLat < 55 ? "temperate" : absLat < 66.5 ? "subarctic" : "arctic";

  return {
    season: l.seasons[seasonKey],
    description: l.climate[zone][seasonKey](currentMonth),
    currentMonth,
  };
}

// Government type data by country
const countryGovernments: Record<string, { type: string; headOfState: string; legislature: string }> = {
  // Europe
  Germany: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Chancellor (executive)", legislature: "Bundestag (Federal Diet) & Bundesrat (Federal Council)" },
  France: { type: "Unitary Semi-Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly & Senate" },
  "United Kingdom": { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "House of Commons & House of Lords" },
  Italy: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Chamber of Deputies & Senate" },
  Spain: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "Congress of Deputies & Senate" },
  Portugal: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Assembly of the Republic" },
  Netherlands: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "House of Representatives & Senate" },
  Belgium: { type: "Federal Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "Chamber of Representatives & Senate" },
  Switzerland: { type: "Federal Semi-Direct Democracy Republic", headOfState: "Federal Council (collective executive)", legislature: "National Council & Council of States" },
  Austria: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Chancellor (executive)", legislature: "National Council & Federal Council" },
  Poland: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Sejm & Senate" },
  Sweden: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "Riksdag" },
  Norway: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "Storting" },
  Denmark: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "Folketing" },
  Finland: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Eduskunta (Parliament)" },
  Ireland: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Taoiseach (executive)", legislature: "Dáil Éireann & Seanad Éireann" },
  Greece: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Hellenic Parliament" },
  Czechia: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Chamber of Deputies & Senate" },
  Romania: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Chamber of Deputies & Senate" },
  Hungary: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "National Assembly" },
  Croatia: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Croatian Parliament (Sabor)" },
  Serbia: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "National Assembly" },
  Bulgaria: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "National Assembly" },
  Ukraine: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Verkhovna Rada" },
  Russia: { type: "Federal Semi-Presidential Republic", headOfState: "President (executive) & Prime Minister", legislature: "State Duma & Federation Council" },
  Turkey: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Grand National Assembly" },
  Iceland: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Althingi" },
  Lithuania: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Seimas" },
  Latvia: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Saeima" },
  Estonia: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Riigikogu" },
  Slovakia: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "National Council" },
  Slovenia: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "National Assembly & National Council" },
  Albania: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Parliament (Kuvendi)" },
  "North Macedonia": { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Assembly (Sobranie)" },
  Montenegro: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Parliament" },
  "Bosnia and Herzegovina": { type: "Federal Parliamentary Republic", headOfState: "Tripartite Presidency", legislature: "Parliamentary Assembly" },
  Moldova: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Parliament" },
  Kosovo: { type: "Unitary Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "Assembly" },
  Luxembourg: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Grand Duke (ceremonial), Prime Minister (executive)", legislature: "Chamber of Deputies" },
  Malta: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "House of Representatives" },
  Cyprus: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "House of Representatives" },
  // Americas
  "United States": { type: "Federal Presidential Constitutional Republic", headOfState: "President (executive)", legislature: "House of Representatives & Senate (Congress)" },
  Canada: { type: "Federal Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "House of Commons & Senate" },
  Mexico: { type: "Federal Presidential Republic", headOfState: "President (executive)", legislature: "Chamber of Deputies & Senate" },
  Brazil: { type: "Federal Presidential Republic", headOfState: "President (executive)", legislature: "Chamber of Deputies & Federal Senate" },
  Argentina: { type: "Federal Presidential Republic", headOfState: "President (executive)", legislature: "Chamber of Deputies & Senate" },
  Colombia: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & House of Representatives" },
  Chile: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & Chamber of Deputies" },
  Peru: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Congress of the Republic" },
  Venezuela: { type: "Federal Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Cuba: { type: "Unitary One-Party Socialist Republic", headOfState: "President & Prime Minister", legislature: "National Assembly of People's Power" },
  Jamaica: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "House of Representatives & Senate" },
  Haiti: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Senate & Chamber of Deputies" },
  "Dominican Republic": { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & Chamber of Deputies" },
  "Costa Rica": { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Legislative Assembly" },
  Panama: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Ecuador: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Bolivia: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Plurinational Legislative Assembly" },
  Paraguay: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & Chamber of Deputies" },
  Uruguay: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "General Assembly" },
  Guatemala: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Congress of the Republic" },
  Honduras: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Congress" },
  "El Salvador": { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Legislative Assembly" },
  Nicaragua: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  "Trinidad and Tobago": { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Senate & House of Representatives" },
  // Middle East
  "Saudi Arabia": { type: "Unitary Absolute Monarchy", headOfState: "King (executive & religious authority)", legislature: "Consultative Assembly (Shura Council, advisory)" },
  "United Arab Emirates": { type: "Federal Constitutional Monarchy (Federation of Emirates)", headOfState: "President (ruler of Abu Dhabi), Prime Minister (ruler of Dubai)", legislature: "Federal National Council (advisory)" },
  Qatar: { type: "Unitary Absolute Monarchy", headOfState: "Emir (executive)", legislature: "Consultative Assembly (Shura Council)" },
  Kuwait: { type: "Unitary Constitutional Monarchy", headOfState: "Emir & Prime Minister", legislature: "National Assembly" },
  Bahrain: { type: "Unitary Constitutional Monarchy", headOfState: "King & Prime Minister", legislature: "Council of Representatives & Shura Council" },
  Oman: { type: "Unitary Absolute Monarchy", headOfState: "Sultan (executive)", legislature: "Council of Oman (advisory)" },
  Yemen: { type: "Unitary Presidential Republic (de jure)", headOfState: "President", legislature: "House of Representatives" },
  Iraq: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Council of Representatives" },
  Syria: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "People's Assembly" },
  Jordan: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "King & Prime Minister", legislature: "Senate & House of Representatives" },
  Lebanon: { type: "Unitary Confessionalist Parliamentary Republic", headOfState: "President & Prime Minister (power-sharing)", legislature: "Parliament" },
  Israel: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Knesset" },
  Iran: { type: "Unitary Theocratic Presidential Republic", headOfState: "Supreme Leader & President", legislature: "Islamic Consultative Assembly (Majles)" },
  // Asia
  China: { type: "Unitary One-Party Socialist Republic", headOfState: "President & Premier", legislature: "National People's Congress" },
  Japan: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Emperor (ceremonial), Prime Minister (executive)", legislature: "House of Representatives & House of Councillors (Diet)" },
  "South Korea": { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  "North Korea": { type: "Unitary One-Party Socialist Republic (Juche)", headOfState: "Supreme Leader & Premier", legislature: "Supreme People's Assembly" },
  India: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Lok Sabha & Rajya Sabha (Parliament)" },
  Pakistan: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "National Assembly & Senate" },
  Bangladesh: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Jatiya Sangsad (National Parliament)" },
  Indonesia: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "People's Representative Council (DPR)" },
  Malaysia: { type: "Federal Parliamentary Constitutional Elective Monarchy", headOfState: "Yang di-Pertuan Agong (rotational monarch), Prime Minister (executive)", legislature: "Dewan Rakyat & Dewan Negara" },
  Thailand: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "King (ceremonial), Prime Minister (executive)", legislature: "House of Representatives & Senate" },
  Vietnam: { type: "Unitary One-Party Socialist Republic", headOfState: "President & Prime Minister", legislature: "National Assembly" },
  Philippines: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & House of Representatives" },
  Myanmar: { type: "Unitary Parliamentary Republic (under military rule)", headOfState: "Military junta (State Administration Council)", legislature: "Suspended" },
  Cambodia: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "King (ceremonial), Prime Minister (executive)", legislature: "National Assembly & Senate" },
  Laos: { type: "Unitary One-Party Socialist Republic", headOfState: "President & Prime Minister", legislature: "National Assembly" },
  Nepal: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "House of Representatives & National Assembly" },
  "Sri Lanka": { type: "Unitary Semi-Presidential Republic", headOfState: "President (executive) & Prime Minister", legislature: "Parliament" },
  Mongolia: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "State Great Khural" },
  Afghanistan: { type: "Theocratic Emirate (de facto)", headOfState: "Supreme Leader (Taliban)", legislature: "None (suspended)" },
  Singapore: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Parliament" },
  Uzbekistan: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Legislative Chamber & Senate" },
  Kazakhstan: { type: "Unitary Presidential Republic", headOfState: "President (executive) & Prime Minister", legislature: "Mazhilis & Senate" },
  Kyrgyzstan: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Supreme Council (Jogorku Kenesh)" },
  Tajikistan: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Supreme Assembly" },
  Turkmenistan: { type: "Unitary Presidential Republic (single-party dominant)", headOfState: "President (executive)", legislature: "Assembly (Mejlis)" },
  // Africa
  Nigeria: { type: "Federal Presidential Republic", headOfState: "President (executive)", legislature: "Senate & House of Representatives" },
  Egypt: { type: "Unitary Semi-Presidential Republic", headOfState: "President (executive) & Prime Minister", legislature: "House of Representatives & Senate" },
  "South Africa": { type: "Unitary Parliamentary Republic", headOfState: "President (executive, elected by parliament)", legislature: "National Assembly & National Council of Provinces" },
  Ethiopia: { type: "Federal Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "House of People's Representatives & House of Federation" },
  Kenya: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & National Assembly" },
  Tanzania: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Ghana: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Parliament" },
  "Democratic Republic of the Congo": { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Senate & National Assembly" },
  Morocco: { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "King & Prime Minister", legislature: "House of Representatives & House of Councillors" },
  Tunisia: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Assembly of People's Representatives" },
  Algeria: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "People's National Assembly & Council of the Nation" },
  Libya: { type: "Provisional Government (transitional)", headOfState: "Presidential Council", legislature: "House of Representatives" },
  Senegal: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Cameroon: { type: "Unitary Presidential Republic", headOfState: "President (executive) & Prime Minister", legislature: "National Assembly & Senate" },
  Uganda: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Parliament" },
  Rwanda: { type: "Unitary Presidential Republic", headOfState: "President (executive) & Prime Minister", legislature: "Senate & Chamber of Deputies" },
  Zimbabwe: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "Senate & National Assembly" },
  Mozambique: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "Assembly of the Republic" },
  Madagascar: { type: "Unitary Semi-Presidential Republic", headOfState: "President & Prime Minister", legislature: "National Assembly & Senate" },
  Angola: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Sudan: { type: "Federal Presidential Republic (transitional)", headOfState: "Sovereignty Council", legislature: "Transitional Legislative Council" },
  "South Sudan": { type: "Federal Presidential Republic", headOfState: "President (executive)", legislature: "Transitional National Legislative Assembly" },
  Somalia: { type: "Federal Parliamentary Republic", headOfState: "President & Prime Minister", legislature: "House of the People & Upper House" },
  Namibia: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly & National Council" },
  Botswana: { type: "Unitary Parliamentary Republic", headOfState: "President (executive, elected by parliament)", legislature: "National Assembly" },
  Zambia: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Malawi: { type: "Unitary Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly" },
  Eritrea: { type: "Unitary One-Party Presidential Republic", headOfState: "President (executive)", legislature: "National Assembly (inactive)" },
  // Oceania
  Australia: { type: "Federal Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "House of Representatives & Senate" },
  "New Zealand": { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "House of Representatives" },
  Fiji: { type: "Unitary Parliamentary Republic", headOfState: "President (ceremonial), Prime Minister (executive)", legislature: "Parliament" },
  "Papua New Guinea": { type: "Unitary Parliamentary Constitutional Monarchy", headOfState: "Monarch (ceremonial), Prime Minister (executive)", legislature: "National Parliament" },
};

function getGovernment(countryName: string): { type: string; headOfState: string; legislature: string } | null {
  return countryGovernments[countryName] || null;
}

// Build practical travel info
function buildPracticalInfo(country: Record<string, unknown>, locale: Locale) {
  const currencies = country.currencies as
    | Record<string, { name: string; symbol: string }>
    | undefined;
  const languages = country.languages as Record<string, string> | undefined;
  const idd = country.idd as
    | { root?: string; suffixes?: string[] }
    | undefined;
  const region = country.region as string;
  const subregion = (country.subregion as string) || "";
  const timezones = country.timezones as string[];
  const car = country.car as { signs?: string[]; side?: string } | undefined;
  const latlng = country.latlng as number[] | undefined;
  const countryName = (country.name as { common: string }).common;

  const currencyList = currencies
    ? Object.entries(currencies).map(
        ([code, c]) => `${c.name} (${c.symbol}) — ${code}`,
      )
    : ["N/A"];

  const currencyCodes = currencies ? Object.keys(currencies) : [];

  const languageList = languages ? Object.values(languages) : ["N/A"];

  const callingCode = idd?.root
    ? `${idd.root}${idd.suffixes?.[0] || ""}`
    : "N/A";

  const l = i18n[locale];
  const currentMonth = new Date().getMonth(); // 0-11
  const climate = getSeasonalClimate(latlng, currentMonth, locale);
  const religions = getReligions(countryName, region, subregion);
  const governmentInfo = getGovernment(countryName);

  return {
    currency: currencyList,
    currencyCodes,
    languages: languageList,
    government: governmentInfo,
    telephone: {
      callingCode,
      emergencyNumber: region === "Europe" ? "112" : region === "Northern America" ? "911" : l.checkLocally,
    },
    climate,
    religions,
    precautions: [
      l.precautions.docs,
      l.precautions.insurance,
      l.precautions.visa,
      l.precautions.customs,
      car?.side === "left" ? l.precautions.driveLeft : l.precautions.driveRight,
    ],
    timezones: timezones || ["N/A"],
    drivingSide: car?.side || "right",
    essentials: [
      l.essentials.driving(car?.side || "right"),
      l.essentials.tld((country.tld as string[])?.[0] || "N/A"),
      l.essentials.calling(callingCode),
      l.essentials.un((country.unMember as boolean) || false),
      l.essentials.week((country.startOfWeek as string) || "monday"),
    ],
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const locale = (request.nextUrl.searchParams.get("locale") === "de" ? "de" : "en") as Locale;

  try {
    const countryData = await fetchCountryData(decodedName);
    if (!countryData) {
      return NextResponse.json(
        { error: "Country not found" },
        { status: 404 },
      );
    }

    const countryCode = countryData.cca2?.toLowerCase();
    const cca2 = (countryData.cca2 as string | undefined) || "";
    const cca3 = (countryData.cca3 as string | undefined) || "";
    const practical = buildPracticalInfo(countryData, locale);

    // Run all external fetches in parallel
    const borderCodes = countryData.borders as string[] | undefined;

    const [worldBankData, borderNames, imfForecasts, travelAdvisory, oecdData] = await Promise.all([
      // World Bank indicators
      countryCode ? fetchWorldBankData(countryCode) : Promise.resolve({}),
      // Border name resolution
      (async (): Promise<{ code: string; name: string }[]> => {
        if (!borderCodes || borderCodes.length === 0) return [];
        const cacheKey = `borders:${borderCodes.sort().join(",")}`;
        const cached = getCached<{ code: string; name: string }[]>(cacheKey);
        if (cached) return cached;
        try {
          const res = await fetchWithTimeout(
            `https://restcountries.com/v3.1/alpha?codes=${borderCodes.join(",")}&fields=name,cca3`,
            5000,
          );
          if (res.ok) {
            const data = await res.json();
            const names = (data as { name: { common: string }; cca3: string }[]).map((b) => ({
              code: b.cca3,
              name: b.name.common,
            }));
            setCache(cacheKey, names);
            return names;
          }
        } catch {}
        return [];
      })(),
      // IMF World Economic Outlook forecasts
      cca3 ? fetchIMFData(cca3) : Promise.resolve(null),
      // US State Dept travel advisory
      cca2 ? fetchTravelAdvisory(cca2) : Promise.resolve(null),
      // OECD live monthly/quarterly indicators (OECD members only)
      cca3 ? fetchOECDData(cca3) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      // Geographic & Population
      name: countryData.name,
      flags: countryData.flags,
      capital: countryData.capital,
      population: countryData.population,
      area: countryData.area,
      region: countryData.region,
      subregion: countryData.subregion,
      continents: countryData.continents,
      borders: countryData.borders,
      borderNames,
      latlng: countryData.latlng,
      landlocked: countryData.landlocked,
      maps: countryData.maps,
      coatOfArms: countryData.coatOfArms,

      // Political
      unMember: countryData.unMember,
      government: countryData.demonyms
        ? `Demonym: ${(countryData.demonyms as Record<string, Record<string, string>>)?.eng?.m || "N/A"}`
        : null,

      // Macroeconomic
      economics: worldBankData,

      // IMF forward-looking forecasts
      imfForecasts,

      // US State Dept travel advisory
      travelAdvisory,

      // OECD live monthly/quarterly data
      oecdData,

      // Practical info
      practical,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch country data" },
      { status: 500 },
    );
  }
}
