// ════════════════════════════════════════════════════════════════════
// Page de connexion — magic link par email (aucun mot de passe à gérer,
// zéro écran d'inscription à construire).
// ════════════════════════════════════════════════════════════════════

import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>SENTIA</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 24 }}>
          Recevez un lien de connexion par email. Aucun mot de passe à retenir.
        </p>
        <LoginForm />
      </div>
    </section>
  );
}
