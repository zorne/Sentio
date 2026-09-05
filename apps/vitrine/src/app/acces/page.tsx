// ════════════════════════════════════════════════════════════════════
// La première arrivée du client : il choisit son mot de passe.
//
// On n'y entre que par un lien à usage unique reçu sur SA boîte, déjà
// échangé contre une session par /auth/callback. Sans session, la page
// ne montre rien et renvoie se connecter : `updateUser` refuserait de
// toute façon, mais un écran qui propose un formulaire inutile fait
// croire à une panne.
//
// ⚠️ AUCUN MOT DE PASSE N'EST JAMAIS ENVOYÉ PAR EMAIL. C'est ici, et
// seulement ici, qu'il en existe un — voir `lib/auth-actions.ts`.
// ════════════════════════════════════════════════════════════════════

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DefinirLeMotDePasse } from "@/components/DefinirLeMotDePasse";
import { Logomark } from "@/components/Logomark";
import { DONNEES_EN_UNE_PHRASE } from "@sentio/domain";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Choisir mon mot de passe | Sentio",
};

export const dynamic = "force-dynamic";

export default async function AccesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "safe center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <Logomark />
        <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Choisissez votre mot de passe</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 22 }}>
          Vous entrerez ensuite dans votre espace avec <strong>{user.email}</strong> et ce mot de
          passe. Nous ne vous le redemanderons jamais par email, et personne chez Sentio ne peut le
          lire.
        </p>
        <DefinirLeMotDePasse />
        <p
          style={{
            margin: "18px 0 0",
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--text-tertiary)",
          }}
        >
          {DONNEES_EN_UNE_PHRASE}
        </p>
      </div>
    </section>
  );
}
