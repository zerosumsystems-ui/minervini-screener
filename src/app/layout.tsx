import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minervini SEPA Screener",
  description: "Professional stock screener using Minervini SEPA methodology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-950 font-mono">
        {children}
      </body>
    </html>
  );
}
