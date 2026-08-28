/**
 * L'attelage — ce qui manquait entre une proposition de modèle et un moteur.
 *
 * ══ LE TROU QU'IL COMBLE ══
 *
 * `execute-action.ts` appelle `moteur.execute(proposition.input)`. Or `proposition.input` est
 * **ce que le modèle a écrit**, et les moteurs attendent autre chose : une entrée typée, plus le
 * contexte de la mission (l'entreprise, l'employé, le prospect concerné). Faute de cette couche,
 * aucun moteur n'était enregistré — le worker décidait et journalisait, mais **n'agissait pas**.
 *
 * ══ LA RÈGLE, ET ELLE EST DE SÉCURITÉ ══
 *
 * **Le modèle choisit le geste, jamais la cible.** Les identifiants — entreprise, employé,
 * prospect — viennent de la mission, jamais de la réponse du modèle. Une consigne glissée dans
 * un nom d'entreprise ou dans un email reçu (`docs/10-securite-rgpd.md`, injection) peut au pire
 * faire proposer une action inutile sur le bon prospect ; elle ne peut pas la faire porter sur
 * un autre, ni sur une autre entreprise.
 *
 * Et un identifiant proposé par le modèle est **refusé**, pas silencieusement remplacé. Le
 * remplacer sans rien dire ferait d'une tentative détectée un incident invisible.
 *
 * ══ CE QUE ÇA COÛTE ══
 *
 * Une capacité sans attelage n'est pas exécutable, même si son moteur est enregistré. C'est
 * assumé : brancher un moteur revient à écrire ici ce que le modèle a le droit de fournir, et
 * c'est exactement la revue qu'on veut imposer avant qu'un employé agisse.
 *
 * Réalise : EXEC-19
 */

import { CAPACITES } from "@sentio/domain";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";

/** Ce que la mission sait — et que le modèle n'a pas à dire. */
export interface ContexteDeMission {
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
  readonly taskId: TaskId;
  /** La nature du sujet de la mission (« lead » aujourd'hui). */
  readonly sujetKind: string;
  readonly sujetId: string;
}

/**
 * Une entrée que l'attelage refuse.
 *
 * Distincte d'une panne : rien n'a été tenté, et réessayer donnerait le même résultat. C'est
 * pourquoi elle n'hérite pas d'`EffetTransitoire` — le moteur d'exécution la traitera comme
 * définitive, ce qu'elle est.
 */
export class EntreeRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntreeRefusee";
  }
}

/** Fabrique l'entrée réelle d'un moteur à partir de ce que le modèle a écrit. */
export type Attelage = (
  champs: Record<string, unknown>,
  contexte: ContexteDeMission,
) => unknown;

/**
 * Combien d'entreprises une seule recherche inscrit au plus.
 *
 * Assez pour donner du travail, assez peu pour qu'une recherche mal ciblée ne remplisse pas la
 * liste du dirigeant de prospects qu'il devra écarter un par un. L'annuaire plafonne de toute
 * façon à 25 par page.
 */
const PROSPECTS_PAR_RECHERCHE = 15;

const STATUTS = new Set(["nouveau", "contacte", "repondu", "exclu"]);

/**
 * Refuse tout champ non prévu — y compris, et surtout, les identifiants.
 *
 * Le message nomme le champ : « lead_id » rendu par un modèle est un signal, pas du bruit, et il
 * doit se retrouver tel quel dans le journal.
 */
function n_accepterQue(
  champs: Record<string, unknown>,
  autorises: readonly string[],
  capacite: string,
): void {
  const enTrop = Object.keys(champs).filter((cle) => !autorises.includes(cle));
  if (enTrop.length === 0) return;

  throw new EntreeRefusee(
    `« ${capacite} » : champs non prévus (${enTrop.join(", ")}). ` +
      "La cible d'une action vient de la mission, jamais du modèle — " +
      (autorises.length === 0
        ? "cette capacité n'attend aucun champ."
        : `seuls ${autorises.join(", ")} sont acceptés.`),
  );
}

/** Un message vide n'est pas un message : le refuser ici évite de compter une tentative pour rien. */
function texteObligatoire(valeur: unknown, nom: string): string {
  if (typeof valeur !== "string" || valeur.trim() === "") {
    throw new EntreeRefusee(`« ${nom} » est obligatoire et doit être du texte non vide.`);
  }
  return valeur;
}

function exigerUnProspect(contexte: ContexteDeMission, capacite: string): void {
  if (contexte.sujetKind !== "lead") {
    throw new EntreeRefusee(
      `« ${capacite} » porte sur un prospect, et cette mission porte sur « ${contexte.sujetKind} ». ` +
        "Agir quand même reviendrait à travailler sur un sujet qui ne concerne pas cette capacité.",
    );
  }
}

/**
 * Les attelages connus.
 *
 * ⚠️ Un attelage n'est **pas** un garde-fou : c'est un traducteur. Que `envoyer.prospect` en ait
 * un ne rend rien envoyable — aucun moteur d'envoi n'est enregistré au montage
 * (`composition.ts`), et une capacité sans moteur échoue avant même d'arriver ici. Confondre les
 * deux reviendrait à faire tenir une garantie de sécurité par l'absence d'une ligne de code, ce
 * qui se perd au premier ajout distrait.
 */
export const ATTELAGES: ReadonlyMap<string, Attelage> = new Map<string, Attelage>([
  [
    CAPACITES.rechercherProspect,
    (champs, contexte) => {
      // ⚠️ CETTE CAPACITÉ N'A PAS DE PROSPECT POUR CIBLE — elle en crée. `exigerUnProspect` n'a
      // donc pas lieu d'être ici, et l'appeler ferait échouer toute recherche : la mission qui la
      // porte n'a pas encore de sujet.
      n_accepterQue(champs, ["quoi", "code_postal"], CAPACITES.rechercherProspect);

      // Le modèle a le droit de dire CE QU'ON CHERCHE : c'est le geste, pas la cible. Il ne peut
      // pas dire pour quelle entreprise, ni combien.
      const quoi = texteObligatoire(champs["quoi"], "quoi");

      const codePostal = champs["code_postal"];
      if (codePostal !== undefined) {
        // ⚠️ Cinq chiffres, et rien d'autre. Ce champ part dans une adresse d'API : accepter du
        // texte libre laisserait un modèle influencé par un nom d'entreprise y glisser autre
        // chose. La borne est plus étroite que nécessaire, exprès.
        if (typeof codePostal !== "string" || !/^[0-9]{5}$/.test(codePostal)) {
          throw new EntreeRefusee(
            `« ${CAPACITES.rechercherProspect} » : « code_postal » doit être cinq chiffres.`,
          );
        }
      }

      return {
        tenantId: contexte.tenantId,
        quoi,
        ...(typeof codePostal === "string" && { codePostal }),
        // ⚠️ LE VOLUME NE VIENT JAMAIS DU MODÈLE. Un modèle qui écrirait « limite: 5000 » ouvrirait
        // autant de missions au battement suivant et brûlerait le quota du client en une nuit.
        limite: PROSPECTS_PAR_RECHERCHE,
      };
    },
  ],
  [
    // Le modèle décide QUOI consigner ; il ne décide pas SUR QUI.
    CAPACITES.mettreAJourProspect,
    (champs, contexte) => {
      n_accepterQue(champs, ["statut", "note"], CAPACITES.mettreAJourProspect);
      exigerUnProspect(contexte, CAPACITES.mettreAJourProspect);

      const statut = champs["statut"];
      if (typeof statut !== "string" || !STATUTS.has(statut)) {
        throw new EntreeRefusee(
          `Statut de fiche inconnu : ${JSON.stringify(statut)}. ` +
            `La liste est close (${[...STATUTS].join(", ")}) — la base refuserait de toute façon.`,
        );
      }

      const note = champs["note"];
      if (note !== undefined && typeof note !== "string") {
        throw new EntreeRefusee("« note » doit être du texte, ou être absente.");
      }

      return {
        tenantId: contexte.tenantId,
        leadId: contexte.sujetId,
        status: statut,
        ...(typeof note === "string" && note.trim() !== "" && { note }),
      };
    },
  ],
  [
    // Le modèle écrit le message. Il n'écrit pas à qui.
    CAPACITES.envoyerProspect,
    (champs, contexte) => {
      n_accepterQue(champs, ["objet", "corps"], CAPACITES.envoyerProspect);
      exigerUnProspect(contexte, CAPACITES.envoyerProspect);
      return {
        tenantId: contexte.tenantId,
        employeeId: contexte.employeeId,
        leadId: contexte.sujetId,
        objet: texteObligatoire(champs["objet"], "objet"),
        corps: texteObligatoire(champs["corps"], "corps"),
      };
    },
  ],
  [
    CAPACITES.relancerProspect,
    (champs, contexte) => {
      n_accepterQue(champs, ["objet", "corps"], CAPACITES.relancerProspect);
      exigerUnProspect(contexte, CAPACITES.relancerProspect);
      return {
        tenantId: contexte.tenantId,
        employeeId: contexte.employeeId,
        leadId: contexte.sujetId,
        objet: texteObligatoire(champs["objet"], "objet"),
        corps: texteObligatoire(champs["corps"], "corps"),
      };
    },
  ],
  [
    // ⭐ Aucun champ. La qualification est déterministe (`qualify.ts`) : le modèle choisit de la
    // demander, il n'a rien à en dire. C'est la formulation la plus nette de la règle de ce
    // fichier — et c'est ce qui rend une exclusion explicable et rejouable à l'identique.
    CAPACITES.qualifierProspect,
    (champs, contexte) => {
      n_accepterQue(champs, [], CAPACITES.qualifierProspect);
      exigerUnProspect(contexte, CAPACITES.qualifierProspect);
      return { tenantId: contexte.tenantId, leadId: contexte.sujetId };
    },
  ],
]);

/**
 * Attelle un moteur à une mission.
 *
 * Le moteur rendu a la forme que `execute-action.ts` attend — `execute(entrée)` — et reçoit en
 * réalité l'entrée reconstruite, plus le contexte que certains moteurs demandent en second
 * argument (`UpdateFicheCapability`). C'est ici, et nulle part ailleurs, que les deux formes se
 * rejoignent.
 */
export function atteler(
  moteur: { engineKey?: string; capabilityKey?: string; execute: (...args: never[]) => Promise<unknown> },
  capabilityKey: string,
  contexte: ContexteDeMission,
  attelages: ReadonlyMap<string, Attelage> = ATTELAGES,
): { execute: (input: unknown) => Promise<unknown> } {
  const attelage = attelages.get(capabilityKey);

  if (attelage === undefined) {
    return {
      execute: async () => {
        throw new EntreeRefusee(
          `Aucun attelage pour « ${capabilityKey} » : son moteur existe peut-être, mais rien ne ` +
            "sait construire son entrée. Un employé n'agit pas sur une entrée devinée.",
        );
      },
    };
  }

  return {
    execute: async (input: unknown) => {
      const champs =
        typeof input === "object" && input !== null && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {};
      const entree = attelage(champs, contexte);
      return await (moteur.execute as (a: unknown, b: unknown) => Promise<unknown>)(entree, {
        employeeId: contexte.employeeId,
        tenantId: contexte.tenantId,
        taskId: contexte.taskId,
      });
    },
  };
}
