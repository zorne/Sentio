import type { EmployeeId, TenantId } from "@sentio/domain";
import { describe, expect, it } from "vitest";

import { destinataireDuBlocage, releverParEmploye, type PasDuBattement } from "./travail-muet.js";

/**
 * Le cas 9, et la règle qui en découle.
 *
 * `capacite_absente` recouvre deux manques. Unifiés pour la reprise — une même relance les résout
 * tous les deux — mais **séparés pour l'alerte**, parce qu'ils n'ont pas le même destinataire.
 *
 * Ce que ces cas gardent : qu'on n'envoie jamais le dirigeant réparer ce qui n'est pas de son
 * ressort. Il apprendrait à ignorer le canal, et l'alerte suivante — la vraie — ne serait pas lue.
 */

const ENTREPRISE = "11111111-1111-1111-1111-111111111111" as TenantId;
const AUTRE = "22222222-2222-2222-2222-222222222222" as TenantId;
const CAMILLE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as EmployeeId;
const DOMINIQUE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as EmployeeId;

function pas(modifications: Partial<PasDuBattement> = {}): PasDuBattement {
  return {
    tenantId: ENTREPRISE,
    employeeId: CAMILLE,
    motif: "travail_acheve",
    manque: null,
    ...modifications,
  };
}

describe("à qui s'adresse un blocage", () => {
  it("⭐ une capacité non activée s'adresse au DIRIGEANT : il peut l'activer", () => {
    expect(
      destinataireDuBlocage("capacite_absente", {
        cause: "capacite_non_activee",
        sujetKind: "lead",
      }),
    ).toBe("dirigeant");
  });

  it("⭐ un moteur non monté s'adresse à NOUS : le dirigeant n'y peut rien", () => {
    // Le même motif, la même mise de côté, la même reprise — et pourtant l'inverse à l'alerte.
    // Le monter est un déploiement : lui demander de l'activer l'enverrait chercher un bouton
    // qui n'existe pas.
    expect(
      destinataireDuBlocage("capacite_absente", { cause: "moteur_non_monte", sujetKind: null }),
    ).toBe("nous");
  });

  it("tout motif non classé revient à nous, et c'est le sens prudent", () => {
    for (const motif of [
      "report_de_quota",
      "contexte_incomplet",
      "echec_definitif",
      "journal_incoherent",
      "pas_interrompu",
      "reprises_epuisees",
      "un_motif_invente_demain",
    ]) {
      expect(destinataireDuBlocage(motif, null), motif).toBe("nous");
    }
  });

  it("un motif de capacité absente SANS cause ne dérange pas le dirigeant", () => {
    // Le cas ne devrait pas se produire — le type l'interdit sur le chemin normal. S'il arrive
    // quand même, se taire coûte une ligne de journal chez nous ; parler coûte la crédibilité
    // du canal.
    expect(destinataireDuBlocage("capacite_absente", null)).toBe("nous");
  });
});

describe("le relevé par employé", () => {
  it("⭐ un seul pas abouti suffit à sortir l'employée du silence", () => {
    // Neuf missions bloquées et une qui avance : l'employée travaille. Le blocage des neuf autres
    // a son propre chemin, la reprise. Alerter ici ferait du bruit sur une entreprise en marche.
    const releve = releverParEmploye([
      pas({
        motif: "capacite_absente",
        manque: { cause: "capacite_non_activee", sujetKind: "lead" },
      }),
      pas({ motif: "pas_suivant" }),
    ]);

    expect(releve).toHaveLength(1);
    expect(releve[0]?.aAbouti).toBe(true);
    expect(releve[0]?.blocages).toEqual([]);
  });

  it("⭐ un cycle entièrement reporté n'a rien fait aboutir", () => {
    // Le cas exact de la production : dix missions reportées faute de fournisseur conforme, et
    // un compte rendu qui annonçait dix succès.
    const releve = releverParEmploye([
      pas({ motif: "report_de_quota" }),
      pas({ motif: "report_de_quota" }),
    ]);

    expect(releve[0]?.aAbouti).toBe(false);
    expect(releve[0]?.blocages).toHaveLength(2);
    expect(releve[0]?.blocages.every((blocage) => blocage.destinataire === "nous")).toBe(true);
  });

  it("une mission arrivée jusqu'à une personne a ABOUTI", () => {
    // Un accord attendu et une vérification humaine ne sont pas des silences : le travail a
    // avancé jusqu'à quelqu'un. Les compter comme muets ferait alerter sur un produit qui vient
    // de faire exactement ce qu'on lui demande.
    for (const motif of ["accord_attendu", "verification_humaine", "budget_epuise"]) {
      expect(releverParEmploye([pas({ motif })])[0]?.aAbouti, motif).toBe(true);
    }
  });

  it("chaque employée est comptée séparément, y compris dans deux entreprises", () => {
    // Dix entreprises qui travaillent ne doivent pas masquer la onzième qui ne travaille pas.
    const releve = releverParEmploye([
      pas({ motif: "travail_acheve" }),
      pas({
        tenantId: AUTRE,
        employeeId: DOMINIQUE,
        motif: "capacite_absente",
        manque: { cause: "capacite_non_activee", sujetKind: "lead" },
      }),
    ]);

    expect(releve).toHaveLength(2);
    expect(releve.find((employe) => employe.tenantId === ENTREPRISE)?.aAbouti).toBe(true);
    const bloquee = releve.find((employe) => employe.tenantId === AUTRE);
    expect(bloquee?.aAbouti).toBe(false);
    expect(bloquee?.blocages[0]?.destinataire).toBe("dirigeant");
  });

  it("deux employées d'une MÊME entreprise ne se confondent pas", () => {
    const releve = releverParEmploye([
      pas({ employeeId: CAMILLE, motif: "travail_acheve" }),
      pas({ employeeId: DOMINIQUE, motif: "report_de_quota" }),
    ]);

    expect(releve).toHaveLength(2);
    expect(releve.find((employe) => employe.employeeId === DOMINIQUE)?.aAbouti).toBe(false);
  });

  it("un employé sans travail dû n'apparaît pas — c'est ce qui évite la fausse alerte", () => {
    expect(releverParEmploye([])).toEqual([]);
  });

  it("le relevé est une fonction pure : deux appels, le même résultat", () => {
    const entree = [
      pas({ motif: "report_de_quota" }),
      pas({ motif: "capacite_absente", manque: null }),
    ];
    expect(releverParEmploye(entree)).toEqual(releverParEmploye(entree));
  });
});
