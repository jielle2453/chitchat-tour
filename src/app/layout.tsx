import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chitchat Tour",
  description: "A walking guide that tells short, sourced stories about everyday things on the street.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Chitchat Tour", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F4F5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // the Android app injects --safe-area-inset-* styles on <html> before React hydrates
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
