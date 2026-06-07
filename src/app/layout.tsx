import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { VisitedProvider } from "@/context/VisitedContext";
import { RecentProvider } from "@/context/RecentContext";
import PageTransition from "@/components/PageTransition";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MycountryGuide — AI-Powered Market Intelligence Platform",
  description:
    "Bilingual market intelligence platform aggregating World Bank economic data with AI-generated country analysis for business professionals.",
  openGraph: {
    title: "MycountryGuide — AI-Powered Market Intelligence Platform",
    description:
      "Bilingual market intelligence platform aggregating World Bank economic data with AI-generated country analysis for business professionals.",
    url: "https://mycountryguide.de",
    siteName: "MycountryGuide",
    images: [
      {
        url: "https://mycountryguide.de/og-image.png",
        width: 1200,
        height: 630,
        alt: "MycountryGuide — AI-Powered Market Intelligence Platform",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MycountryGuide — AI-Powered Market Intelligence Platform",
    description:
      "Bilingual market intelligence platform aggregating World Bank economic data with AI-generated country analysis for business professionals.",
    images: ["https://mycountryguide.de/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <LanguageProvider>
            <FavoritesProvider>
              <VisitedProvider>
                <RecentProvider>
                  <PageTransition>{children}</PageTransition>
                </RecentProvider>
              </VisitedProvider>
            </FavoritesProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
