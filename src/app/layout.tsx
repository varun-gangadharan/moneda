import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moneda — Onboard once. Tap once. Unlock anywhere.",
  description: "Centralized article access POC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
