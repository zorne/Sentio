import type { Metadata } from "next";
import { RgpdRequestForm } from "@/components/legal/RgpdRequestForm";

export const metadata: Metadata = { title: "Vos droits RGPD — Sentio" };

export default function RgpdPage() {
  return (
    <>
      <h1>Vos droits</h1>
      <p className="legal-updated">Cadre : règlement (UE) 2016/679</p>

      <p>
        Le RGPD vous donne un contrôle direct sur les données que vous nous
        confiez. Vous pouvez exercer ces droits à tout moment, gratuitement,
        et nous répondons sous 30 jours maximum.
      </p>

      <h2>Vos droits, en clair</h2>
      <ul>
        <li><strong>Accès</strong> — savoir quelles données on détient sur vous, en obtenir une copie</li>
        <li><strong>Rectification</strong> — corriger une donnée inexacte ou incomplète</li>
        <li><strong>Effacement (« droit à l&apos;oubli »)</strong> — demander la suppression de vos données</li>
        <li><strong>Portabilité</strong> — récupérer vos données dans un format lisible pour les transférer ailleurs</li>
        <li><strong>Limitation</strong> — geler un traitement, par exemple en cas de contestation</li>
        <li><strong>Opposition</strong> — vous opposer à un traitement particulier pour un motif légitime</li>
      </ul>

      <h2>Demande directe pour un compte actif</h2>
      <p>
        Si vous avez un compte Sentio, l&apos;export et la suppression sont
        accessibles depuis votre espace personnel (Paramètres → Mes données).
        C&apos;est la voie la plus rapide.
      </p>

      <h2>Formulaire de demande</h2>
      <p>
        Pour toute autre demande, ou si vous n&apos;avez plus accès à votre
        compte :
      </p>

      <RgpdRequestForm />

      <h2>Réclamation auprès de la CNIL</h2>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez
        saisir la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">CNIL</a>.
      </p>
    </>
  );
}
