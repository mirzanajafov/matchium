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

export const metadata: Metadata = {
  title: { default: "Matchium", template: "%s · Matchium" },
  description: "A few questions a day, a few matches a day, and a straight answer about why.",
  applicationName: "Matchium",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#111311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <script async src="https://najafov.dev/visit.js" />
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <footer className="px-6 pb-6 text-center text-xs text-muted">
          <a href="https://najafov.dev/privacy#demos" className="underline hover:text-foreground">
            What this demo records
          </a>
        </footer>
      </body>
    </html>
  );
}
