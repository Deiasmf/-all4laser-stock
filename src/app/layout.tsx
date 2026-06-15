import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import UserMenu from "@/components/UserMenu";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ProcessosTopLink from "@/components/processos/ProcessosTopLink";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "All4laser Stock",
  description: "Gestão de stock de equipamentos All4laser",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "All4laser", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#16294d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AuthProvider>
          <ServiceWorkerRegister />
          <header className="topbar">
            <div className="topbar-inner">
              <a href="/" className="topbar-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="All4laser" className="topbar-logo" />
                <span className="topbar-lema">Where technology meets trust</span>
              </a>
              <nav className="topbar-nav">
                <a href="/" className="topbar-link">Stock</a>
                <a href="/alugueres/lista" className="topbar-link">Alugueres</a>
                <ProcessosTopLink />
              </nav>
              <UserMenu />
            </div>
          </header>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
