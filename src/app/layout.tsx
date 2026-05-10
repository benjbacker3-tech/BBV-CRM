import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import OpenPhoneSync from "@/components/OpenPhoneSync";
import CommandBar from "@/components/CommandBar";
import ThemeProvider from "@/components/ThemeProvider";
import QuickAddButton from "@/components/QuickAddButton";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "MCI CRM",
  description: "Industrial Outdoor Storage Investment CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased flex h-screen overflow-hidden bg-white dark:bg-surface-dark">
        <ThemeProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
          <CommandBar />
          <QuickAddButton />
          <OpenPhoneSync />
        </ThemeProvider>
      </body>
    </html>
  );
}
