import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Employés IA — Dashboard",
  description: "Console de pilotage des Employés IA (agents autonomes)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
