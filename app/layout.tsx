import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { Toaster } from "@/components/ui/toaster";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";

export const metadata: Metadata = {
  title: "Evergreen Command",
  description: "Local AI task runner on the Framestation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen">
        <TopNav />
        <div id="main-content">{children}</div>
        <Toaster />
        <KeyboardShortcuts />
      </body>
    </html>
  );
}
