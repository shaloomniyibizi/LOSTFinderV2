import type { Metadata } from "next";
import type { ReactNode } from "react";
import BranchDownBanner from "@/components/BranchDownBanner";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { AppProvider } from "@/lib/app-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "LostFinder: Distributed Lost & Found",
  description: "Report and find lost property across all branch offices.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <AppProvider>
          <Navbar />
          <BranchDownBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}
