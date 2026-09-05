import type { ReactNode } from "react";
import { RouteFadeReset } from "@/components/RouteFadeReset";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import "./globals.css";

export const metadata = {
  title: "Sentio",
  description: "Console de pilotage Sentio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <RouteFadeReset />
        {children}
        <FullscreenToggle />
      </body>
    </html>
  );
}
