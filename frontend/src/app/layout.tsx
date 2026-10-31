import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import Toaster from "@/components/Toaster";
import { AppProvider } from "@/lib/app-context";
import { AuthModalProvider } from "@/lib/auth-modal";
import { CountsProvider } from "@/lib/counts";
import { NotificationsProvider } from "@/lib/notifications";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "LostFinder: Distributed Lost & Found",
  description: "Report and find lost property across all branch offices.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <AppProvider>
            <NotificationsProvider>
              <CountsProvider>
                <AuthModalProvider>
                  <AppShell>{children}</AppShell>
                  <Toaster />
                </AuthModalProvider>
              </CountsProvider>
            </NotificationsProvider>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
