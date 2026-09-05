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
  searchParams: Promise<{
    code?: string;
    error?: string;
    error_description?: string;
    next?: string;
  }>;
}) {
  const { code, error, next } = await searchParams;

  // ⚠️ ON N'AFFICHE PLUS `error_description`, ET LA DESTINATION EST FILTRÉE.
  //
  // `error_description` venait de la chaîne de requête et était rendu tel quel. React l'échappe,
  // donc il n'y avait pas d'injection de code — mais un lien fabriqué faisait afficher la phrase
  // de son choix sur une page portant le nom et le logo Sentio. De quoi bâtir un message de
  // hameçonnage crédible avec notre propre page. On dit maintenant ce qu'on sait, nous.
  //
  // Et `next` ne peut désigner qu'un chemin de CE site : un « // » ou une adresse complète
  // enverrait le client ailleurs après une connexion réussie, en lui laissant croire qu'il est
  // encore chez nous.
  const destination = next !== undefined && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : "/espace";

  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sentio</h1>

        {error ? (
          <>
            <p style={{ color: "var(--red)", fontSize: 13.5, marginBottom: 16 }}>
              Ce lien est invalide ou a déjà servi. Demandez-en un nouveau, il arrive tout de
              suite.
            </p>
            <a href="/login" className="btn btn-secondary">Redemander un lien</a>
          </>
        ) : code ? (
          <>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 20 }}>
              Cliquez pour finaliser votre connexion.
            </p>
            <ConfirmLoginButton code={code} destination={destination} />
          </>
        ) : (
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5 }}>Lien de connexion incomplet.</p>
        )}
      </div>
    </section>
  );
}
