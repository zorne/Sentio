// ════════════════════════════════════════════════════════════════════
// Page de confirmation du lien magique — PAS une exécution automatique.
//
// Pourquoi : les scanners de sécurité d'emails (notamment Apple Mail
// Privacy Protection sur iCloud) pré-chargent silencieusement les liens
// contenus dans un email pour les analyser, AVANT que l'utilisateur ne
// clique dessus. Si l'échange du code se faisait au simple chargement de
// cette page (comme dans un Route Handler GET classique), ce pré-chargement
// consommerait le code à usage unique — l'utilisateur verrait alors
// "lien invalide ou expiré" en cliquant, alors qu'il n'a encore rien fait.
//
// La correction : le code n'est échangé qu'au clic explicite d'un bouton,
// via une Server Action. Un scanner automatisé charge la page (HTML
// inoffensif) mais ne clique jamais sur un bouton.
// ════════════════════════════════════════════════════════════════════

import { ConfirmLoginButton } from "@/components/ConfirmLoginButton";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const { code, error, error_description } = await searchParams;

  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>SENTIA</h1>

        {error ? (
          <>
            <p style={{ color: "var(--red)", fontSize: 13.5, marginBottom: 16 }}>
              {error_description?.replace(/\+/g, " ") ?? "Le lien de connexion est invalide ou a expiré."}
            </p>
            <a href="/login" className="btn btn-secondary">Redemander un lien</a>
          </>
        ) : code ? (
          <>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 20 }}>
              Cliquez pour finaliser votre connexion.
            </p>
            <ConfirmLoginButton code={code} />
          </>
        ) : (
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5 }}>Lien de connexion incomplet.</p>
        )}
      </div>
    </section>
  );
}
