import type { ReactNode } from "react";
import { RouteFadeReset } from "@/components/RouteFadeReset";
import "./globals.css";

export const metadata = {
  title: "Sentio — Dashboard",
  description: "Console de pilotage Sentio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <RouteFadeReset />
        {children}
      </body>
    </html>
  );
}
