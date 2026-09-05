/**
 * LADY-AI — le rôle décide des MOTS, jamais des faits.
 *
 * Le risque de ce module est un seul : glisser vers un catalogue de métiers. Un rôle inconnu qui
 * recevrait les mots de la prospection ferait dire à un employé administratif qu'il a des
 * prospects — et le produit aurait recommencé à se spécialiser, par la porte du vocabulaire.
 */

import { describe, expect, it } from "vitest";

import { motsDeLaRecolte } from "./recolte.js";

describe("Chaque rôle nomme sa récolte", () => {
  it("la prospection parle d'entreprises qui répondent", () => {
    expect(motsDeLaRecolte("prospection").titre).toContain("répondu");
  });

  it("la relation client parle de demandes, pas de prospects", () => {
    const mots = motsDeLaRecolte("relation_client");
    expect(mots.titre).toContain("demandes");
    expect(`${mots.titre} ${mots.vide}`).not.toContain("prospect");
  });
});

describe("Ce qui protège le noyau généraliste", () => {
  it("⭐⭐ un rôle inconnu reçoit des mots NEUTRES, jamais ceux de la prospection", () => {
    // La bibliothèque s'élargira ; un rôle qui n'est pas encore listé arrivera. Lui servir « vos
    // prospects » par défaut ferait dire à un employé administratif qu'il en a — c'est-à-dire
    // spécialiser le noyau par métier, par le vocabulaire (adr/0029).
    const mots = motsDeLaRecolte("comptabilite_fournisseurs");

    expect(mots.titre).toBe("Ce qui a abouti");
    expect(`${mots.titre} ${mots.vide}`).not.toContain("prospect");
  });

  it("⭐ sans rôle, on ne suppose rien", () => {
    expect(motsDeLaRecolte(null).titre).toBe("Ce qui a abouti");
  });

  it("aucun rôle ne rend un état vide muet", () => {
    for (const role of [null, "prospection", "suivi", "inconnu"]) {
      expect(motsDeLaRecolte(role).vide.length).toBeGreaterThan(20);
    }
  });
});
