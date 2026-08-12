/**
 * Politique de cookies.
 *
 * Aucun cookie non essentiel n'est posé aujourd'hui : la page décrit ce qui existe, et rien
 * de plus. Le jour où un cookie de mesure apparaîtra, c'est un bandeau de consentement qu'il
 * faudra ajouter — pas une ligne dans ce tableau.
 *
 * Réalise : ACQUIS-10
 */
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cookies — Sentio" };

export default function CookiesPage() {
  return (
    <>
      <h1>Politique de cookies</h1>
      <p className="legal-updated">Dernière mise à jour · à définir</p>

      <h2>Ce qui est utilisé aujourd&apos;hui</h2>
      <p>
        Sentio n&apos;utilise que des <strong>cookies strictement
        nécessaires</strong> au fonctionnement du Service. Selon la
        recommandation de la CNIL, ces cookies ne nécessitent pas de
        consentement préalable.
      </p>

      <table>
        <thead>
          <tr><th>Cookie</th><th>Finalité</th><th>Durée</th><th>Émetteur</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>sb-access-token</td>
            <td>Session d&apos;authentification</td>
            <td>1 heure</td>
            <td>Sentio (via Supabase)</td>
          </tr>
          <tr>
            <td>sb-refresh-token</td>
            <td>Renouvellement de session</td>
            <td>30 jours</td>
            <td>Sentio (via Supabase)</td>
          </tr>
        </tbody>
      </table>

      <h2>Ce qui n&apos;est pas utilisé</h2>
      <ul>
        <li>Aucun cookie publicitaire</li>
        <li>Aucun cookie de mesure d&apos;audience tiers (Google Analytics, Meta, Hotjar…)</li>
        <li>Aucun cookie de reciblage</li>
        <li>Aucun fingerprinting</li>
      </ul>

      <h2>Si cela change</h2>
      <p>
        Toute introduction d&apos;un cookie non essentiel (analytique,
        publicitaire) déclenchera l&apos;affichage préalable d&apos;une
        bannière de consentement conforme aux lignes directrices CNIL,
        avec choix granulaire et refus aussi facile que l&apos;acceptation.
        Cette page sera mise à jour en conséquence.
      </p>
    </>
  );
}
