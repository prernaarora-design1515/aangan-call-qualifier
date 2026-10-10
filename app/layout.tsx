import "./globals.css";
import type { Metadata } from "next";
import { Bebas_Neue, DM_Mono, DM_Sans } from "next/font/google";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Aangan Call Desk",
  description: "AI call qualifier — calls, lead quality and running cost for Aangan Studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
