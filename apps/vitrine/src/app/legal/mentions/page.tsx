import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mentions légales — Sentio" };

export default function MentionsPage() {
  return (
    <>
      <h1>Mentions légales</h1>
      <p className="legal-updated">Dernière mise à jour · à définir</p>

      <div className="legal-todo">
        <strong>À compléter avant ouverture au public.</strong> Sentio
        n&apos;est pas encore constituée en société. Les mentions ci-dessous
        sont des placeholders — remplacez-les dès l&apos;immatriculation.
        L&apos;ouverture d&apos;un site marchand sans mentions légales
        conformes est passible de sanctions (article 6-III LCEN).
      </div>

      <h2>Éditeur du site</h2>
      <p>
        <strong>Raison sociale :</strong> à définir (SASU, SARL, EURL, auto-entrepreneur…)<br />
        <strong>Forme juridique :</strong> à définir<br />
        <strong>Capital social :</strong> à définir<br />
        <strong>SIREN / SIRET :</strong> à définir<br />
        <strong>RCS :</strong> à définir<br />
        <strong>N° TVA intracommunautaire :</strong> à définir<br />
        <strong>Siège social :</strong> à définir<br />
        <strong>Directeur de la publication :</strong> à définir<br />
        <strong>Contact :</strong> <a href="mailto:contact@sentio.fr">contact@sentio.fr</a>
      </p>

      <h2>Hébergement</h2>
      <p>
        <strong>Application :</strong> Vercel Inc., 340 S Lemon Ave #4133,
        Walnut, CA 91789, États-Unis. Exécution privilégiée en régions
        européennes.<br /><br />
        <strong>Base de données :</strong> Supabase Inc., 970 Toa Payoh
        North #07-04, Singapour. Données hébergées en UE (Irlande, région
        eu-west-1).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble du site (contenu, design, code, marque) est protégé
        par le droit de la propriété intellectuelle. Toute reproduction,
        représentation ou diffusion sans autorisation écrite préalable est
        interdite.
      </p>

      <h2>Signalement d&apos;un contenu illicite</h2>
      <p>
        Conformément à la LCEN, tout signalement d&apos;un contenu illicite
        peut être adressé à <a href="mailto:abuse@sentio.fr">abuse@sentio.fr</a>.
      </p>
    </>
  );
}
