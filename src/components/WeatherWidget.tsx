"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

interface WeatherData {
  temperature: number;
  windspeed: number;
  weathercode: number;
  humidity: number;
  isDay: boolean;
}

interface DayForecast {
  date: string;
  maxTemp: number;
  minTemp: number;
  weathercode: number;
  precipitationProb: number;
}

const WEATHER_DESCRIPTIONS: Record<string, Record<number, string>> = {
  en: {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ heavy hail",
  },
  de: {
    0: "Klarer Himmel", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bedeckt",
    45: "Nebelig", 48: "Reifnebel",
    51: "Leichter Nieselregen", 53: "Mäßiger Nieselregen", 55: "Starker Nieselregen",
    61: "Leichter Regen", 63: "Mäßiger Regen", 65: "Starker Regen",
    71: "Leichter Schneefall", 73: "Mäßiger Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
    80: "Leichte Schauer", 81: "Mäßige Schauer", 82: "Heftige Schauer",
    85: "Leichte Schneeschauer", 86: "Starke Schneeschauer",
    95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Gewitter mit starkem Hagel",
  },
};

function getWeatherIcon(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code <= 2) return isDay ? "⛅" : "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

function formatDay(dateStr: string, locale: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (date.toDateString() === today.toDateString()) return locale === "de" ? "Heute" : "Today";
  return date.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { weekday: "short" });
}

interface WeatherWidgetProps {
  lat: number;
  lng: number;
  countryName: string;
}

export default function WeatherWidget({ lat, lng, countryName }: WeatherWidgetProps) {
  const { t, locale } = useLanguage();
  const w = t.weather;
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current_weather=true&hourly=relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
      `&forecast_days=7&timezone=auto`,
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        const cw = data.current_weather;
        const humidityArr = data.hourly?.relative_humidity_2m;
        const currentHour = new Date().getUTCHours();
        setWeather({
          temperature: cw.temperature,
          windspeed: cw.windspeed,
          weathercode: cw.weathercode,
          humidity: humidityArr ? humidityArr[Math.min(currentHour, humidityArr.length - 1)] : 0,
          isDay: cw.is_day === 1,
        });

        const daily = data.daily;
        if (daily?.time) {
          const days: DayForecast[] = (daily.time as string[]).map((date: string, i: number) => ({
            date,
            maxTemp: daily.temperature_2m_max[i] ?? 0,
            minTemp: daily.temperature_2m_min[i] ?? 0,
            weathercode: daily.weathercode[i] ?? 0,
            precipitationProb: daily.precipitation_probability_max[i] ?? 0,
          }));
          setForecast(days);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) {
    return (
      <div className="atlas-card p-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--atlas-teal)", borderTopColor: "transparent" }} />
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>{w.loading}</span>
        </div>
      </div>
    );
  }

  if (error || !weather) return null;

  const desc = WEATHER_DESCRIPTIONS[locale]?.[weather.weathercode] ?? WEATHER_DESCRIPTIONS.en[weather.weathercode] ?? w.unknown;
  const icon = getWeatherIcon(weather.weathercode, weather.isDay);

  return (
    <div
      className="atlas-card p-6 overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(20, 184, 166, 0.08), var(--atlas-surface))` }}
    >
      <h2 className="atlas-section-label mb-4">
        {w.title} — {countryName}
      </h2>

      {/* Current conditions */}
      <div className="flex items-center gap-6">
        <span className="text-5xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold" style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif", color: "var(--text-primary)" }}>
              {weather.temperature}°C
            </span>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              ({((weather.temperature * 9) / 5 + 32).toFixed(1)}°F)
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{desc}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--atlas-border)" }}>
        <div className="text-sm">
          <span style={{ color: "var(--text-tertiary)" }}>{w.wind}: </span>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{weather.windspeed} km/h</span>
        </div>
        <div className="text-sm">
          <span style={{ color: "var(--text-tertiary)" }}>{w.humidity}: </span>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{weather.humidity}%</span>
        </div>
      </div>

      {/* 7-day forecast */}
      {forecast.length > 0 && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--atlas-border)" }}>
          <p className="text-xs mb-3 uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>
            {w.forecast_7day}
          </p>
          <div className="grid grid-cols-7 gap-1">
            {forecast.map((day) => (
              <div
                key={day.date}
                className="flex flex-col items-center gap-1 rounded-lg py-2 px-1 text-center"
                style={{ background: "var(--atlas-surface-alt)", border: "1px solid var(--atlas-border)" }}
              >
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  {formatDay(day.date, locale)}
                </span>
                <span className="text-lg">{getWeatherIcon(day.weathercode)}</span>
                <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                  {Math.round(day.maxTemp)}°
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {Math.round(day.minTemp)}°
                </span>
                {day.precipitationProb > 20 && (
                  <span className="text-xs" style={{ color: "#38bdf8" }}>
                    {day.precipitationProb}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
