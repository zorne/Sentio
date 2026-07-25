import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "SENTIA — Dashboard",
  description: "Console de pilotage SENTIA",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
