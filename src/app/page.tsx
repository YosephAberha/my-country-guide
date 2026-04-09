"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import SearchBar from "@/components/SearchBar";
import Map from "@/components/Map";
import DarkModeToggle from "@/components/DarkModeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FavoritesList from "@/components/FavoritesList";
import RecentlyViewed from "@/components/RecentlyViewed";
import AnimatedSection from "@/components/AnimatedSection";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/compare", key: "compare" },
  { href: "/quiz", key: "quiz" },
  { href: "/rankings", key: "rankings" },
] as const;

function CompassSVG() {
  return (
    <svg viewBox="0 0 100 100" className="w-16 h-16 opacity-[0.07]" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="0.4" />
      <line x1="50" y1="4" x2="50" y2="96" stroke="currentColor" strokeWidth="0.6" />
      <line x1="4" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="0.6" />
      <line x1="16" y1="16" x2="84" y2="84" stroke="currentColor" strokeWidth="0.3" />
      <line x1="84" y1="16" x2="16" y2="84" stroke="currentColor" strokeWidth="0.3" />
      <polygon points="50,8 52,18 50,14 48,18" fill="currentColor" />
      <text x="50" y="14" textAnchor="middle" fill="currentColor" fontSize="5" fontFamily="serif">N</text>
    </svg>
  );
}

export default function HomePage() {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Floating Navigation */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? "atlas-nav shadow-lg" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="font-bold text-lg tracking-tight" style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}>
              <span style={{ color: "var(--text-primary)" }}>My</span>
              <span className="text-gradient-gold">Country</span>
              <span style={{ color: "var(--text-primary)" }}>Guide</span>
            </span>
          </Link>

          <div className="flex-1" />

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className="atlas-pill"
              >
                {t.nav[link.key as keyof typeof t.nav]}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-0.5">
            <LanguageSwitcher />
            <DarkModeToggle />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center hero-gradient atlas-watermark overflow-hidden px-4">
        {/* Decorative compass */}
        <div className="absolute top-20 right-10 atlas-float hidden lg:block">
          <CompassSVG />
        </div>
        <div className="absolute bottom-32 left-10 atlas-float hidden lg:block" style={{ animationDelay: "2s" }}>
          <CompassSVG />
        </div>

        {/* Decorative coordinate lines */}
        <div className="absolute inset-0 lat-lines pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          {/* Tagline label */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="atlas-section-label inline-block mb-4 pulse-glow">
              World Explorer
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl sm:text-6xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6"
            style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}
          >
            {t.home.title.includes("Country") ? (
              <>
                Explore Every{" "}
                <span className="text-gradient-gold">Nation</span>
              </>
            ) : (
              <span className="text-gradient-gold">{t.home.title}</span>
            )}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg md:text-xl max-w-xl mx-auto mb-10"
            style={{ color: "var(--text-secondary)" }}
          >
            {t.home.subtitle}
          </motion.p>

          {/* Search Bar — focal centerpiece */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-lg mx-auto"
          >
            <SearchBar variant="hero" />
          </motion.div>

          {/* Coordinate decoration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="coord-text mt-8"
          >
            51.5074° N, 0.1278° W — 35.6762° N, 139.6503° E — 40.7128° N, 74.0060° W
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-6 h-10 rounded-full border-2 flex items-start justify-center pt-2"
            style={{ borderColor: "var(--atlas-border-light)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--atlas-gold)" }} />
          </motion.div>
        </motion.div>
      </section>

      {/* Content Sections */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16 space-y-12">
        {/* Recently Viewed */}
        <AnimatedSection>
          <RecentlyViewed />
        </AnimatedSection>

        {/* Favorites */}
        <AnimatedSection delay={0.05}>
          <FavoritesList />
        </AnimatedSection>

        {/* Interactive Map */}
        <AnimatedSection delay={0.1}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="atlas-section-label">Interactive Globe</span>
              <div className="flex-1 h-px" style={{ background: "var(--atlas-border)" }} />
            </div>
            <Map />
          </div>
        </AnimatedSection>

        {/* Mobile Nav Links */}
        <div className="md:hidden flex flex-wrap gap-2 justify-center">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="atlas-pill"
            >
              {t.nav[link.key as keyof typeof t.nav]}
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t" style={{ borderColor: "var(--atlas-border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="font-bold text-xl" style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}>
                <span style={{ color: "var(--text-primary)" }}>My</span>
                <span className="text-gradient-gold">Country</span>
                <span style={{ color: "var(--text-primary)" }}>Guide</span>
              </span>
              <span className="coord-text hidden sm:inline">
                Explore Every Nation
              </span>
            </div>
            <nav className="flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.key}
                  href={link.href}
                  className="text-sm transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--atlas-gold)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                >
                  {t.nav[link.key as keyof typeof t.nav]}
                </Link>
              ))}
            </nav>
            <div className="coord-text text-center">
              &copy; {new Date().getFullYear()} MyCountryGuide &middot; Data from REST Countries
            </div>
          </div>
          {/* Disclaimer */}
          <div className="mt-8 pt-6 border-t flex flex-col items-center gap-2" style={{ borderColor: "var(--atlas-border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--atlas-gold)", opacity: 0.7 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Disclaimer</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 text-center">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.disclaimer.data_accuracy}</span>
              <span className="hidden sm:inline text-xs" style={{ color: "var(--atlas-border)" }}>&middot;</span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.disclaimer.not_official}</span>
              <span className="hidden sm:inline text-xs" style={{ color: "var(--atlas-border)" }}>&middot;</span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.disclaimer.educational}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
