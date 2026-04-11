import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";

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
      <body className="antialiased">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
