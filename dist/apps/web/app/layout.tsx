import "@/styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RadarTips",
  description: "Radar do Dia: picks, EV e risco em um só lugar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-radar">
        {children}
      </body>
    </html>
  );
}
