import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aangan Call Desk",
  description: "AI call qualifier — calls, lead quality and running cost for Aangan Studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
