// ════════════════════════════════════════════════════════════════════
// La porte du client : son adresse email, son mot de passe.
//
// Il n'y a AUCUN écran d'inscription, et c'est voulu : on ne s'inscrit
// pas à Sentio, on y est accueilli. Un espace naît d'un recrutement, et
// le client reçoit alors un lien à usage unique pour poser son mot de
// passe (`/acces`). Une page d'inscription ouverte laisserait n'importe
// qui créer un compte vide, sans entreprise et sans employée.
// ════════════════════════════════════════════════════════════════════

import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sentio</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 24 }}>
          Entrez dans votre espace.
        </p>
        <LoginForm />
      </div>
    </section>
  );
}
