/**
 * Le compteur — « du travail se fait-il ? » — et, quand la réponse est non, **à qui le dire**.
 *
 * ══ DEUX SURVEILLANCES, JAMAIS FUSIONNÉES ══
 *
 * | | La question | Le mécanisme |
 * |---|---|---|
 * | le guetteur | « le battement tourne-t-il ? » | le planificateur, qui n'a pas reçu d'appel |
 * | **le compteur** | « du travail se fait-il ? » | **ce module**, qui lit ce que le battement a produit |
 *
 * Les fusionner reviendrait à croire qu'un battement reçu prouve un travail fait. C'est
 * exactement le défaut que l'étape précédente a fermé : `{traites:10, echoues:0}` avec dix
 * missions reportées, en production, comme comportement nominal.
 *
 * ══ CE QUE CE MODULE NE FAIT PAS ══
 *
 * Il ne lit rien, il n'écrit rien, il ne notifie personne. **Fonction pure** : on lui donne ce
 * que le battement a produit, il rend un relevé par employé et un destinataire par blocage.
 * L'écriture — compteur en base, seuil, notification — est `runtime/compteur.ts`.
 *
 * ══ LE CAS 9, ET C'EST LUI QUI JUSTIFIE CE FICHIER ══
 *
 * `capacite_absente` recouvre deux manques : une capacité que le dirigeant n'a pas activée, et un
 * moteur que nous n'avons pas monté. **Unifiés pour la reprise** — les deux sont des attentes
 * qu'une même relance résout — mais séparés ici, parce qu'ils n'ont pas le même destinataire.
 *
 * Prévenir le dirigeant d'un moteur non monté, c'est lui demander de réparer ce qui n'est pas de
 * son ressort. Il apprendrait à ignorer le canal, et c'est précisément ce qu'on cherche à éviter.
 */

import type { EmployeeId, TenantId } from "@sentio/domain";

import type { ManqueDOutil } from "./suite-du-run.js";
import { MOTIFS_QUI_ABOUTISSENT } from "./verdict.js";

/**
 * Qui peut faire quelque chose de ce blocage.
 *
 * Il n'y a que deux réponses parce qu'il n'y a que deux mains : celle du dirigeant, et la nôtre.
 * Une troisième — « personne » — serait un aveu qu'on laisse une mission mourir sans témoin.
 */
export type Destinataire = "dirigeant" | "nous";

/** Un pas du battement, tel que la boucle l'a vécu. Un par travail pris dans la file. */
export interface PasDuBattement {
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
  /** Le motif de suite (`travail_acheve`, `report_de_quota`, `capacite_absente`, …). */
  readonly motif: string;
  /** Renseigné pour le seul motif `capacite_absente`. C'est lui qui porte la distinction. */
  readonly manque: ManqueDOutil | null;
  /**
   * Ce run a consommé son budget sans exécuter une seule action — il a payé sans rien produire.
   *
   * ⚠️ Le fait est calculé par `aPayeSansRienProduire`, dans le noyau. La boucle le RAPPORTE ;
   * elle ne le juge pas. C'est ce qui sépare le geste mécanique — faire avancer le pas — du
   * jugement : compter que du travail a avancé.
   */
  readonly aPayeSansRienProduire: boolean;
  /**
   * Combien d'actions ce run a réellement exécutées depuis son début.
   *
   * ⚠️ **CE N'EST PAS UN MOTIF, ET C'EST TOUT L'INTÉRÊT.** Un run peut se terminer proprement — le
   * modèle a jugé qu'il n'y avait rien à faire — sans avoir rien exécuté. Pris isolément, c'est
   * légitime : c'est un jugement rendu, pas une panne. Répété, c'est un système cassé, et aucun
   * motif ne le dit.
   */
  readonly actionsExecutees: number;
}

/**
 * Les motifs par lesquels une mission avance **jusqu'à une personne**.
 *
 * ⚠️ Ils sont l'exception à la règle du taux, et ils DOIVENT l'être : le Policy Engine suspend
 * avant d'exécuter quoi que ce soit, donc un cycle qui pose une question au dirigeant a
 * légitimement zéro action à son compteur. Le compter muet ferait sonner l'alarme au moment précis
 * où le produit fait exactement ce qu'on lui demande.
 */
const MOTIFS_QUI_ATTEIGNENT_UNE_PERSONNE: ReadonlySet<string> = new Set([
  "accord_attendu",
  "verification_humaine",
]);

/** Ce qu'un blocage appelle : un motif, et la personne qui peut y remédier. */
export interface Blocage {
  readonly motif: string;
  readonly destinataire: Destinataire;
  readonly manque: ManqueDOutil | null;
}

/** Ce qu'un cycle a produit pour UN employé. C'est l'unité du compteur. */
export interface ReleveDEmploye {
  readonly tenantId: TenantId;
  readonly employeeId: EmployeeId;
  /** Au moins un pas a fait avancer son travail pendant ce cycle. */
  readonly aAbouti: boolean;
  /** Ce qui l'a arrêté, dans l'ordre rencontré. Vide dès que quelque chose a abouti. */
  readonly blocages: readonly Blocage[];
}

/**
 * À qui s'adresse ce blocage.
 *
 * ⚠️ **TOTALE, ET PRUDENTE PAR DÉFAUT.** Tout motif non listé revient à nous. C'est le sens qui
 * protège : déranger le dirigeant pour un défaut produit lui apprend que le canal ne le concerne
 * pas, et le jour où il le concerne vraiment, il ne le lit plus. Se tromper dans l'autre sens ne
 * coûte qu'une ligne de journal chez nous.
 */
export function destinataireDuBlocage(_motif: string, manque: ManqueDOutil | null): Destinataire {
  // ⚠️ **C'EST LA CAUSE QUI DÉCIDE, PAS LE MOTIF.** La première version exigeait aussi le motif
  // `capacite_absente`, et ça a coûté un cas : un employé dont AUCUN travail ne s'ouvre porte le
  // motif `aucun_outil_actif` — il n'a pas de mission bloquée, il n'a pas de mission du tout — et
  // partait donc chez nous alors que le dirigeant tenait la solution.
  //
  // Le motif dit CE QUI s'est passé ; la cause dit QUI peut y remédier. Faire dépendre le
  // destinataire du motif oblige à penser à cette fonction chaque fois qu'un motif apparaît, et
  // c'est exactement le genre de règle qu'on oublie de mettre à jour.
  //
  // Encore faut-il que le dirigeant ait le DROIT d'activer quelque chose — cette vérification-là
  // se fait UNE FOIS, côté canal, au moment de la notification (`runtime/compteur.ts`) : elle
  // coûte deux lectures qui n'apprendraient rien tant que rien n'est envoyé, et elle peut
  // renverser ce verdict-ci.
  if (manque?.cause === "capacite_non_activee") return "dirigeant";
  return "nous";
}

/**
 * Regroupe les pas du battement par employé.
 *
 * ⚠️ **UN EMPLOYÉ ABSENT DE CE RELEVÉ N'EST PAS UN EMPLOYÉ MUET.** N'y figurent que ceux dont un
 * travail a été pris dans la file. Un employé sans rien à faire n'apparaît pas, et c'est ce qui
 * empêche le compteur de faire d'une période creuse légitime une alerte — la même condition que
 * `duTravailEtaitDu` dans le verdict, appliquée employé par employé.
 */
export function releverParEmploye(pas: readonly PasDuBattement[]): readonly ReleveDEmploye[] {
  interface EnCours {
    readonly tenantId: TenantId;
    readonly employeeId: EmployeeId;
    aAbouti: boolean;
    readonly blocages: Blocage[];
  }

  const parEmploye = new Map<string, EnCours>();

  for (const unPas of pas) {
    const cle = `${unPas.tenantId}/${unPas.employeeId}`;
    let employe = parEmploye.get(cle);
    if (employe === undefined) {
      employe = {
        tenantId: unPas.tenantId,
        employeeId: unPas.employeeId,
        aAbouti: false,
        blocages: [],
      };
      parEmploye.set(cle, employe);
    }

    if (MOTIFS_QUI_ABOUTISSENT.has(unPas.motif)) {
      // ⚠️ **UN MOTIF QUI ABOUTIT NE SUFFIT PLUS : IL FAUT QUE QUELQUE CHOSE AIT ÉTÉ FAIT.**
      //
      // C'est la règle du TAUX, née de la répétition générale (cas 4b). Une mission terminée sans
      // avoir rien exécuté ne veut rien dire prise seule — le modèle a pu juger, à raison, qu'il
      // n'y avait rien à faire, et c'est un jugement rendu, pas une panne. Mais un cycle sans une
      // seule action exécutée est un système cassé, quels que soient les motifs de terminaison.
      //
      // ⚠️ **ELLE VIT ICI, ET PAS AU NIVEAU DU RUN.** Durcir la règle par run produirait de
      // fausses alarmes sur du fonctionnement normal, et c'est l'accoutumance qu'on combat depuis
      // le début. Ici, elle n'a de conséquence qu'à travers le compteur : un cycle muet ne dit
      // rien, trois journées de suite en disent long. C'est exactement le raisonnement de
      // `garde_du_silence` — un envoi sans réponse ne dit rien, quarante en disent long — et c'est
      // SON mécanisme qui agrège, pas un second.
      //
      // Deux exceptions, portées par une seule ligne : une mission qui a atteint une PERSONNE a
      // produit quelque chose, même sans action exécutée.
      if (unPas.actionsExecutees > 0 || MOTIFS_QUI_ATTEIGNENT_UNE_PERSONNE.has(unPas.motif)) {
        // ⚠️ Un seul pas abouti suffit à sortir l'employé du silence. Exiger que TOUS aboutissent
        // ferait alerter une entreprise dont l'employée travaille — parce qu'une mission sur dix
        // attend un outil. Le blocage de cette mission-là a son propre chemin : la reprise.
        employe.aAbouti = true;
        continue;
      }

      // Le motif dit « terminé », et rien n'a été produit. C'est un blocage sans destinataire
      // client : le dirigeant n'y peut rien, c'est notre chaîne qui tourne à vide.
      employe.blocages.push({
        motif: `${unPas.motif}_sans_action`,
        destinataire: "nous",
        manque: null,
      });
      continue;
    }

    employe.blocages.push({
      motif: unPas.motif,
      destinataire: destinataireDuBlocage(unPas.motif, unPas.manque),
      manque: unPas.manque,
    });
  }

  return [...parEmploye.values()].map((employe) => ({
    tenantId: employe.tenantId,
    employeeId: employe.employeeId,
    aAbouti: employe.aAbouti,
    // Un cycle qui a abouti n'a pas de blocage à rapporter : ce qui reste bloqué relève de la
    // reprise, mission par mission, et non d'une alerte sur l'employée entière.
    blocages: employe.aAbouti ? [] : employe.blocages,
  }));
}
