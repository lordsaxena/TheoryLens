import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheoryLens",
  description: "Turn scientific theory into interactive 3D simulations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 antialiased">{children}</body>
    </html>
  );
}