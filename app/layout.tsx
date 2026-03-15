import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imposter Game",
  description: "A simple party game for friends."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}