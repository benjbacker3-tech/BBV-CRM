import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Sandpiper Capital CRM",
  description: "Sandpiper Capital LLC — Industrial Outdoor Storage CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 print:block print:h-auto print:overflow-visible print:bg-white">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
