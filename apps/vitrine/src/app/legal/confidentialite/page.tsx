/**
 * Politique de confidentialité — RGPD articles 13 et 14.
 *
 * ⚠️ La localisation des données est une DÉCLARATION OPPOSABLE, pas une formule. Elle doit
 * désigner la région réellement utilisée par le projet lié, et se re-vérifier à chaque
 * changement d'hébergement.
 *
 * Réalise : ACQUIS-09
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité | Sentio",
  description: "Comment Sentio collecte, utilise et protège vos données personnelles.",
};

export default function ConfidentialitePage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p className="legal-updated">Dernière mise à jour · à définir avant mise en ligne publique</p>

      <div className="legal-todo">
        Cette politique décrit les traitements réellement en place. La raison sociale et les
        contrats de sous-traitance seront complétés ici dès l&apos;immatriculation de la société.
      </div>

      <h2>1. Qui est responsable de vos données</h2>
      <p>
        Le responsable de traitement est <strong>Sentio</strong>, désigné dans
        les <a href="/legal/mentions">mentions légales</a>. Contact pour toute
        question relative à vos données : <a href="mailto:privacy@sentio.fr">privacy@sentio.fr</a>.
      </p>

      <h2>2. Quelles données sont collectées</h2>

      <h3>Données de compte</h3>
      <p>
        Adresse email, nom de l&apos;entreprise, rôle. Collectées lors de
        l&apos;inscription, nécessaires à l&apos;exécution du contrat (base
        légale : article 6.1.b RGPD).
      </p>

      <h3>Données que vous confiez à votre employé numérique</h3>
      <p>
        Prospects, notes, brouillons d&apos;emails, historique de missions.
        Vous en restez propriétaire. Elles sont hébergées dans votre espace
        cloisonné et ne sont accessibles à personne d&apos;autre, pas même
        aux autres clients de Sentio.
      </p>

      <h3>Journal d&apos;exécution</h3>
      <p>
        Chaque action de votre employé numérique est enregistrée
        automatiquement (horodatage, décision, outil utilisé, résultat). Ce
        journal est un dispositif de traçabilité et d&apos;audit ; il ne peut
        être ni modifié ni effacé, y compris par l&apos;employé lui-même.
      </p>

      <h3>Ce que vous nous dites pendant le diagnostic en ligne</h3>
      <p>
        Le diagnostic est une conversation où vous décrivez votre activité,
        votre clientèle et ce qui vous ralentit. Ce que vous écrivez est
        transmis à un fournisseur de modèle situé aux États-Unis, encadré par
        les clauses contractuelles types de la Commission européenne, pour la
        seule durée de l&apos;échange. Rien n&apos;en est conservé tant que
        vous ne recrutez pas.
      </p>
      <p>
        N&apos;y écrivez pas de donnée sensible ni de secret d&apos;affaires :
        le diagnostic sert à cerner un besoin, pas à recevoir un dossier.
      </p>

      <h3>Données techniques</h3>
      <p>
        Adresse IP (journalisée temporairement pour la limitation d&apos;abus),
        type de navigateur, pages visitées. Aucun traceur publicitaire, aucun
        Google Analytics, aucun pixel Meta actuellement en place.
      </p>

      <h2>3. Pourquoi ces données sont collectées</h2>
      <ul>
        <li>Fournir le service (fonctionnement des employés numériques)</li>
        <li>Assurer la sécurité (détection d&apos;abus, limitation de débit)</li>
        <li>Facturer les abonnements payants</li>
        <li>Répondre à vos demandes de support</li>
      </ul>
      <p>
        Aucune donnée n&apos;est utilisée à des fins publicitaires, revendue à
        un tiers, ni transmise pour l&apos;entraînement de modèles d&apos;IA.
      </p>

      <h2>4. Combien de temps</h2>
      <table>
        <thead>
          <tr><th>Donnée</th><th>Durée de conservation</th></tr>
        </thead>
        <tbody>
          <tr><td>Compte actif</td><td>Toute la durée de l&apos;abonnement</td></tr>
          <tr><td>Après résiliation</td><td>30 jours, le temps que vous puissiez récupérer vos données, puis suppression sur demande</td></tr>
          <tr><td>Journal d&apos;exécution</td><td>13 mois, puis purge</td></tr>
          <tr><td>Factures</td><td>10 ans (obligation comptable, article L123-22 du Code de commerce)</td></tr>
          <tr><td>Adresses journalisées pour la limitation d&apos;abus</td><td>Le jour en cours</td></tr>
        </tbody>
      </table>

      <h2>5. Où sont hébergées vos données</h2>
      <p>
        <strong>Uniquement en Europe.</strong> La base de données et les
        sauvegardes sont hébergées par Supabase dans l&apos;Union européenne
        (région eu-north-1, Stockholm, Suède). L&apos;application est déployée sur
        Vercel avec exécution privilégiée en région européenne.
      </p>

      <h2>6. Sous-traitants (article 28 RGPD)</h2>
      <p>
        Nous recourons aux sous-traitants suivants. Le contrat de
        sous-traitance prévu à l&apos;article 28 est en cours de
        formalisation avec chacun d&apos;eux, et cette page indiquera sa date
        de signature.
      </p>
      <table>
        <thead>
          <tr><th>Sous-traitant</th><th>Rôle</th><th>Localisation</th></tr>
        </thead>
        <tbody>
          <tr><td>Supabase Inc.</td><td>Base de données, authentification, stockage</td><td>UE (eu-north-1, Suède)</td></tr>
          <tr><td>Vercel Inc.</td><td>Hébergement de l&apos;application</td><td>UE (régions privilégiées)</td></tr>
          <tr><td>Google (Gemini)</td><td>Modèle d&apos;IA (traitement des données réelles clients)</td><td>Union européenne, sans entraînement sur vos données</td></tr>
          <tr><td>Groq Inc.</td><td>Conseiller public et diagnostic en ligne</td><td>États-Unis</td></tr>
        </tbody>
      </table>
      <div className="legal-todo">
        <strong>Règle d&apos;or appliquée par le code :</strong> aucune donnée
        réelle client n&apos;est jamais transmise à un modèle d&apos;IA
        susceptible de l&apos;utiliser pour son propre entraînement. Cette
        contrainte est vérifiée par le système avant chaque appel, pas
        laissée à la vigilance humaine.
      </div>

      <h2>7. Vos droits</h2>
      <p>
        Vous disposez à tout moment des droits suivants (articles 15 à 22 RGPD) :
      </p>
      <ul>
        <li><strong>Accès</strong> : obtenir une copie de vos données</li>
        <li><strong>Rectification</strong> : corriger une donnée inexacte</li>
        <li><strong>Effacement</strong> : supprimer votre compte et les données associées</li>
        <li><strong>Portabilité</strong> : récupérer vos données dans un format lisible</li>
        <li><strong>Opposition</strong> : vous opposer à un traitement particulier</li>
        <li><strong>Limitation</strong> : geler un traitement en cas de contestation</li>
      </ul>
      <p>
        Pour exercer ces droits, consultez la page{" "}
        <a href="/legal/rgpd">Vos droits RGPD</a>. Nous répondons sous 30 jours.
      </p>

      <h2>8. Sécurité</h2>
      <ul>
        <li>Cloisonnement des données au niveau base (Row-Level Security)</li>
        <li>Chiffrement TLS en transit et au repos</li>
        <li>Journal d&apos;audit permanent, non modifiable</li>
        <li>Accès aux données limité à ce qui est nécessaire pour vous servir</li>
        <li>Sauvegardes chiffrées, dont la restauration est vérifiée à chaque prise</li>
      </ul>

      <h2>9. Cookies</h2>
      <p>
        Sentio n&apos;utilise que les cookies strictement nécessaires au
        fonctionnement (session d&apos;authentification). Aucun cookie
        publicitaire, aucun traceur tiers.{" "}
        <a href="/legal/cookies">Détail complet des cookies</a>.
      </p>

      <h2>10. Réclamation</h2>
      <p>
        En cas de désaccord persistant, vous pouvez saisir la{" "}
        <a href="https://www.cnil.fr" target="_blank" rel="noopener">CNIL</a>{" "}
        (autorité française de protection des données).
      </p>

      <h2>11. Mise à jour de cette politique</h2>
      <p>
        En cas de modification substantielle, vous serez informé par email au
        moins 30 jours avant l&apos;entrée en vigueur.
      </p>
    </>
  );
}
