import { describe, expect, it } from "vitest";

import { motDeLEtat, motsDuTravail } from "./mots-du-travail.js";

/**
 * ⚠️ CES TESTS DÉFENDENT `adr/0029`, PAS UNE PRÉFÉRENCE DE STYLE.
 *
 * L'espace client doit pouvoir représenter une employée composée pour n'importe quel besoin :
 * comptabilité, relation client, administratif, commercial, suivi. Un seul mot de prospection
 * laissé dans le vocabulaire neutre, et le produit redevient un outil de prospection déguisé.
 */

const ROLES_CONNUS = [
  "prospection",
  "qualification",
  "relation_client",
  "administration_commerciale",
  "administration",
  "suivi",
  "pilotage",
];

describe("les mots du travail", () => {
  it("⭐⭐ le repli est NEUTRE, jamais celui de la prospection", () => {
    // Servir « vos prospects » à une employée administrative parce que son rôle n'était pas prévu
    // serait spécialiser le produit par le vocabulaire. C'est le piège exact que `adr/0029`
    // existe pour éviter.
    for (const inconnu of [null, "juridique", "logistique", "un_role_de_demain"]) {
      const mots = motsDuTravail(inconnu);
      const tout = JSON.stringify(mots);
      expect(tout, `repli pour « ${inconnu} »`).not.toMatch(/prospect|relance|vente|commercial/i);
    }
  });

  it("⭐⭐ chaque rôle connu parle DE SON travail", () => {
    expect(motsDuTravail("prospection").indicateurs.touches).toBe("entreprises approchées");
    expect(motsDuTravail("administration").indicateurs.touches).toBe("dossiers traités");
    expect(motsDuTravail("relation_client").indicateurs.touches).toBe("demandes reprises");
    expect(motsDuTravail("suivi").indicateurs.touches).toBe("échéances suivies");

    // Et deux rôles différents ne disent pas la même chose : sinon la couche ne sert à rien.
    const dits = ROLES_CONNUS.map((r) => motsDuTravail(r).indicateurs.touches);
    expect(new Set(dits).size).toBeGreaterThan(4);
  });

  it("⭐⭐ les six états de la base sont TOUS traduits, pour tous les rôles", () => {
    // `task.state` n'accepte que ces six valeurs. Un état sans mot afficherait une clé technique
    // au dirigeant, ce qui est exactement ce qu'on lui épargne.
    const etats = ["pending", "in_progress", "waiting_approval", "needs_attention", "done", "failed"];

    for (const role of [...ROLES_CONNUS, null]) {
      const mots = motsDuTravail(role);
      for (const etat of etats) {
        const dit = motDeLEtat(etat, mots);
        expect(dit.length, `${role} / ${etat}`).toBeGreaterThan(2);
        expect(dit, `${role} / ${etat}`).not.toBe(etat);
      }
    }
  });

  it("⭐ un état inconnu ne montre jamais sa clé technique", () => {
    // Le jour où la base gagne un état, l'écran doit rester lisible plutôt que d'afficher
    // « en_cours_de_verification_externe » au dirigeant.
    expect(motDeLEtat("un_etat_de_demain", motsDuTravail("administration"))).toBe("En cours");
  });

  it("⭐⭐ aucun mot du lexique interdit, aucun tiret, dans aucun rôle", () => {
    const interdits =
      /\b(IA|bots?|assistants?|agents?|automatisations?|GPT|prompts?|tokens?|workflows?|pipelines?|tâches? système)\b/i;

    for (const role of [...ROLES_CONNUS, null]) {
      const tout = JSON.stringify(motsDuTravail(role));
      expect(interdits.exec(tout)?.[0] ?? null, `rôle ${role}`).toBeNull();
      expect(tout, `rôle ${role}`).not.toMatch(/[—–]/);
    }
  });

  it("⭐ les états vides expliquent, ils ne constatent pas", () => {
    // « Aucun résultat » laisse le dirigeant se demander si le produit est cassé. Chaque état
    // vide dit ce qui se passe et ce qui arrivera.
    for (const role of [...ROLES_CONNUS, null]) {
      const vide = motsDuTravail(role).missionsVides;
      expect(vide.length, `rôle ${role}`).toBeGreaterThan(60);
      expect(vide, `rôle ${role}`).toMatch(/elle|vous verrez|reprendra|préviendra/i);
    }
  });
});
