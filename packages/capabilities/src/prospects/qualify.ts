/**
 * METIER-06/07 — la qualification, passée **P0** parce que c'est elle qui décide de ce qui part.
 *
 * La première cause d'arrêt des déploiements concurrents est une donnée sale envoyée à grande
 * échelle ([`docs/21-concurrence.md`]). La qualification est la seule étape qui se tient entre la
 * liste du client et un message réel — et une liste fournie n'est pas une liste propre.
 *
 * ⚠️ **Elle est déterministe, et c'est un choix.** Le modèle n'écarte personne : il ne fait, plus
 * tard, que rédiger. Une décision d'exclusion prise par un modèle serait impossible à expliquer
 * au client, impossible à rejouer à l'identique, et sensible à une consigne glissée dans une
 * fiche de prospect (`docs/10-securite-rgpd.md`, injection). Ici, chaque refus porte sa raison,
 * en français, et la même entrée donne toujours la même sortie.
 *
 * Réalise : METIER-07, METIER-22
 */

import { CAPACITES } from "@sentio/domain";

import { looksLikeEmail } from "./import.js";

/** Ce que le client vend, et à qui — lu du Contexte Entreprise, jamais deviné. */
export interface ClientCriteria {
  /** Secteurs visés. Vide = pas de restriction de secteur. */
  readonly targetSectors?: readonly string[];
  /** Secteurs explicitement exclus — l'exclusion l'emporte toujours sur la cible. */
  readonly excludedSectors?: readonly string[];
  /** Domaines à ne jamais contacter : clients existants, concurrents, comptes sensibles. */
  readonly excludedDomains?: readonly string[];
}

export interface LeadToQualify {
  readonly companyName: string;
  readonly email: string | null;
  readonly sector: string | null;
  readonly source: string;
  /** Déjà contacté auparavant ? Un prospect ne se redécouvre pas tous les mois. */
  readonly alreadyContacted?: boolean;
}

export type Qualification =
  | { readonly qualification: "qualifie"; readonly reason: string }
  | { readonly qualification: "ecarte"; readonly reason: string };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/**
 * L'ordre des règles est celui de leur gravité, et il est volontaire : on rend la raison la plus
 * dirimante, pas la première trouvée par hasard. « Sans adresse » avant « hors secteur » — dire
 * à un client que son prospect est hors cible alors qu'on n'a même pas d'adresse pour lui serait
 * une explication fausse.
 */
export function qualifyLead(lead: LeadToQualify, criteria: ClientCriteria = {}): Qualification {
  if (lead.source.trim() === "") {
    return { qualification: "ecarte", reason: "origine de la donnée inconnue" };
  }
  if (lead.companyName.trim() === "") {
    return { qualification: "ecarte", reason: "entreprise inconnue" };
  }
  if (lead.email === null || lead.email.trim() === "") {
    return { qualification: "ecarte", reason: "aucune adresse pour joindre cette entreprise" };
  }
  if (!looksLikeEmail(lead.email)) {
    return { qualification: "ecarte", reason: `adresse invalide : « ${lead.email} »` };
  }
  if (lead.alreadyContacted === true) {
    return { qualification: "ecarte", reason: "déjà contacté" };
  }

  const domain = domainOf(lead.email);
  const excludedDomain = (criteria.excludedDomains ?? []).find(
    (excluded) => domain === normalize(excluded) || domain.endsWith(`.${normalize(excluded)}`),
  );
  if (excludedDomain !== undefined) {
    return { qualification: "ecarte", reason: `domaine exclu par le client : ${excludedDomain}` };
  }

  const sector = lead.sector === null ? null : normalize(lead.sector);
  const excludedSector = (criteria.excludedSectors ?? []).find(
    (excluded) => sector !== null && sector.includes(normalize(excluded)),
  );
  if (excludedSector !== undefined) {
    return { qualification: "ecarte", reason: `secteur exclu par le client : ${excludedSector}` };
  }

  const targets = criteria.targetSectors ?? [];
  if (targets.length > 0) {
    if (sector === null) {
      // On n'invente pas un secteur pour faire entrer un prospect dans la cible : on l'écarte,
      // et le client peut corriger sa fiche. C'est réversible ; un mauvais message ne l'est pas.
      return { qualification: "ecarte", reason: "secteur inconnu, alors que le client en vise" };
    }
    const matched = targets.find((target) => sector.includes(normalize(target)));
    if (matched === undefined) {
      return {
        qualification: "ecarte",
        reason: `secteur « ${lead.sector} » hors des cibles du client`,
      };
    }
    return { qualification: "qualifie", reason: `secteur visé par le client : ${matched}` };
  }

  return { qualification: "qualifie", reason: "adresse professionnelle exploitable et origine connue" };
}

/**
 * METIER-22 — le motif de sélection.
 *
 * Produit **toujours**, affiché selon D14. Un employé qui ne sait pas dire pourquoi il a retenu
 * ce prospect-là ne peut ni être corrigé, ni être défendu si le choix est contesté.
 */
export function selectionReason(lead: LeadToQualify, qualification: Qualification): string {
  return `${lead.companyName} — ${qualification.reason} (origine : ${lead.source})`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Le moteur — la règle ci-dessus, branchée sur des ports
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// La décision reste `qualifyLead`, déterministe et testable sans rien. Ce qui suit ne fait que
// lire la fiche, appliquer la règle, et consigner la réponse.
//
// ⚠️ **Le prospect n'est pas choisi ici, et surtout pas par le modèle.** Il vient de la mission
// (`packages/runtime/src/attelage.ts`) : une mission porte un sujet, et c'est ce sujet-là qu'on
// qualifie. Laisser le modèle nommer la fiche à juger ouvrirait la porte qu'on ferme partout
// ailleurs — une consigne glissée dans un nom d'entreprise ferait qualifier autre chose.

/** Ce que la base sait d'un prospect et de ce que son client vend. */
export interface FichesAQualifier {
  /** `null` quand la fiche n'existe pas, ou appartient à une autre entreprise. */
  lire(input: {
    tenantId: string;
    leadId: string;
  }): Promise<{ lead: LeadToQualify; criteria: ClientCriteria } | null>;

  /** Écrit la qualification ET sa raison. Les séparer laisserait un verdict sans explication. */
  consigner(input: {
    tenantId: string;
    leadId: string;
    qualification: "qualifie" | "ecarte";
    raison: string;
    motifDeSelection: string;
  }): Promise<boolean>;
}

export type QualifierResult =
  | { readonly status: "qualifie" | "ecarte"; readonly leadId: string; readonly raison: string }
  | { readonly status: "prospect_inconnu" };

export interface QualifierInput {
  readonly tenantId: string;
  readonly leadId: string;
}

export class QualifierProspectCapability {
  /** Le moteur de base, celui que `capability_binding` lie aux trois formules. */
  readonly engineKey = "base";
  readonly capabilityKey = CAPACITES.qualifierProspect;

  constructor(private readonly fiches: FichesAQualifier) {}

  async execute(input: QualifierInput): Promise<QualifierResult> {
    const fiche = await this.fiches.lire(input);
    if (fiche === null) return { status: "prospect_inconnu" };

    const verdict = qualifyLead(fiche.lead, fiche.criteria);

    const ecrit = await this.fiches.consigner({
      tenantId: input.tenantId,
      leadId: input.leadId,
      qualification: verdict.qualification,
      raison: verdict.reason,
      motifDeSelection: selectionReason(fiche.lead, verdict),
    });
    // La fiche a disparu entre la lecture et l'écriture — un effacement RGPD, par exemple. Ce
    // n'est pas une erreur : c'est le résultat correct.
    if (!ecrit) return { status: "prospect_inconnu" };

    return { status: verdict.qualification, leadId: input.leadId, raison: verdict.reason };
  }
}
