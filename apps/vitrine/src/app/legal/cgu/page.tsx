/**
 * Conditions générales d'utilisation et de vente.
 *
 * Contenu provisoire signalé : les clauses qui engagent une personne morale (garanties,
 * juridiction, médiation) attendent l'immatriculation.
 *
 * Réalise : ACQUIS-08
 */
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conditions générales — Sentio" };

export default function CguPage() {
  return (
    <>
      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="legal-updated">Dernière mise à jour · à définir</p>

      <div className="legal-todo">
        <strong>Squelette à faire relire par un juriste.</strong> Les CGU
        engagent contractuellement vos clients — leurs formulations doivent
        être vérifiées par un professionnel avant mise en ligne publique.
      </div>

      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l&apos;utilisation de la
        plateforme Sentio (ci-après « le Service »), éditée par la société
        désignée aux <a href="/legal/mentions">mentions légales</a>.
      </p>

      <h2>2. Acceptation</h2>
      <p>
        L&apos;inscription au Service vaut acceptation sans réserve des
        présentes conditions. En cas de désaccord, l&apos;utilisateur doit
        renoncer à utiliser le Service.
      </p>

      <h2>3. Description du Service</h2>
      <p>
        Sentio fournit une plateforme d&apos;employés numériques — des
        agents autonomes capables de consulter des données, arbitrer et
        agir dans le cadre d&apos;autorisations définies par le client.
        Chaque action est journalisée. Les actions irréversibles nécessitent
        une validation humaine explicite, sauf configuration contraire du
        client.
      </p>

      <h2>4. Compte et responsabilités</h2>
      <p>
        Le client est responsable de la confidentialité de ses identifiants
        et de toute action effectuée depuis son compte. Il s&apos;engage à
        fournir des informations exactes et à les tenir à jour.
      </p>

      <h2>5. Tarifs et facturation</h2>
      <p>
        L&apos;offre d&apos;essai est gratuite dans les limites indiquées.
        L&apos;offre Business est facturée mensuellement au tarif indiqué
        sur la page tarifs. La facturation est mensuelle, sans engagement
        de durée. Toute résiliation prend effet à la fin de la période en
        cours.
      </p>

      <h2>6. Disponibilité</h2>
      <p>
        Sentio met en œuvre les moyens raisonnables pour maintenir le
        Service accessible 24/7, sans garantir une disponibilité absolue.
        Des interruptions peuvent survenir pour maintenance, mise à jour ou
        cause indépendante (panne fournisseur, force majeure).
      </p>

      <h2>7. Limitations de responsabilité</h2>
      <p>
        Le client reste responsable des actions effectuées par ses agents
        et des données qu&apos;il leur confie. Sentio ne saurait être tenue
        responsable des conséquences d&apos;une action irréversible qu&apos;un
        client aurait explicitement approuvée. En aucun cas la responsabilité
        de Sentio ne pourra dépasser le montant payé par le client au cours
        des 12 derniers mois.
      </p>

      <h2>8. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{" "}
        <a href="/legal/confidentialite">politique de confidentialité</a>.
      </p>

      <h2>9. Résiliation</h2>
      <p>
        Le client peut résilier son abonnement à tout moment depuis son
        espace, sans préavis. Ses données sont conservées 30 jours après
        résiliation pour permettre une éventuelle réactivation, puis
        supprimées, sauf obligation légale de conservation (factures).
      </p>

      <h2>10. Droit applicable et litiges</h2>
      <p>
        Les présentes conditions sont soumises au droit français. Tout
        litige non résolu à l&apos;amiable relèvera des juridictions
        compétentes du ressort du siège social de l&apos;éditeur.
      </p>
    </>
  );
}
