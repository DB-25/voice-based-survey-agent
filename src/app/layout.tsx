import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice-Based Survey Agent",
  description: "Voice-powered survey tool to understand the impact of Generative AI in government work",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
