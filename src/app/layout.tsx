import type { Metadata } from "next";
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
  title: "Template Importer",
  description: "Import, edit and duplicate Spectora inspection templates",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-neutral-900">
        <header className="border-b border-neutral-200 px-6 py-3 flex items-center gap-6">
          <a href="/" className="font-semibold">Template Importer</a>
          <a href="/import" className="text-sm text-blue-700 hover:underline">Import</a>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
