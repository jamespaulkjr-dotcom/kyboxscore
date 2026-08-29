import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kyboxscore.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Kentucky High School Sports",
    template: "%s · Kentucky High School Sports",
  },
  description:
    "Scores, box scores, statistics, leaderboards and RPI for Kentucky high school sports. Every game. Every box score.",
  applicationName: "kyboxscore",
  openGraph: {
    type: "website",
    siteName: "kyboxscore",
    title: "Kentucky High School Sports",
    description:
      "Scores, box scores, statistics, leaderboards and RPI for Kentucky high school sports.",
    url: siteUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kentucky High School Sports",
    description:
      "Scores, box scores, statistics, leaderboards and RPI for Kentucky high school sports.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1a2e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-bg text-fg">
        {children}
      </body>
    </html>
  );
}
