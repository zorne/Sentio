/** Réalise : FOND-36 */

export * from "./ids.js";
export * from "./tenant.js";
export * from "./employee.js";
export * from "./memory.js";
export * from "./work.js";
export * from "./capability.js";
// Le diagnostic et la composition : ils étaient atteignables seulement par `recommend()`, qui
// part d'un profil déclaré. La réévaluation (`reevaluation.js`) part de constats MESURÉS et a
// besoin des deux étapes séparément — c'est la même mécanique, alimentée autrement.
//
// ⚠️ Ré-export NOMMÉ, pas `export *` : `audit.js` et `capability.js` définissent chacun un type
// `Objet` — l'un est la liste complète des objets métier, l'autre le vestige d'un temps où le
// seul objet était le prospect. Les exporter en bloc rendrait le nom ambigu à l'import ; le
// jour où les deux fusionneront, cette liste disparaîtra d'elle-même.
export {
  CONFIANCE_PAR_SOURCE,
  POIDS_DE_CONFIANCE,
  DOMAINES,
  OBJETS,
  type Constat,
  type Domaine,
  type GenreDeConstat,
  type SourceDeConstat,
  type Confiance,
} from "./audit.js";
export {
  actesServis,
  composer,
  diagnostiquer,
  fermerSurLesExigences,
  ACTES_PAR_DOMAINE,
  EXIGENCES_PAR_ACTE,
  type BesoinPriorise,
  type ConfigurationProposee,
  type ResultatDeComposition,
} from "./composition.js";
export * from "./effort.js";
export * from "./progression.js";
export * from "./recolte.js";
export * from "./questions.js";
export * from "./statistiques.js";
export * from "./reevaluation.js";
export * from "./configuration.js";
export * from "./acquisition.js";
export * from "./recommendation.js";
export * from "./secteur.js";
export * from "./liste-attente.js";
export * from "./diagnostic-request.js";
export * from "./optout.js";
export * from "./heartbeat-signature.js";
export * from "./email-presentation.js";
export * from "./formules.js";
export * from "./promesse-sur-les-donnees.js";
export * from "./mots-du-travail.js";
