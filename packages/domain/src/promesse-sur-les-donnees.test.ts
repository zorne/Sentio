import { describe, expect, it } from "vitest";

import {
  DONNEES_EN_DEUX_PHRASES,
  DONNEES_EN_UNE_PHRASE,
  DONNEES_EXPLIQUEES,
} from "./promesse-sur-les-donnees.js";

/**
 * Ce que le produit promet sur les données est la chose la plus grave qu'il puisse écrire de
 * travers. Le client ne peut pas le vérifier lui-même : il nous croit, ou il part.
 *
 * Ces tests ne vérifient pas que la promesse est TENUE — c'est le rôle de
 * `verify_tenant_isolation` et des invariants d'isolation. Ils vérifient qu'elle reste **dite de
 * la même façon partout**, et qu'aucune réécriture ne l'affaiblit sans qu'on s'en aperçoive.
 */

const TOUTES = [
  DONNEES_EN_UNE_PHRASE,
  DONNEES_EN_DEUX_PHRASES,
  DONNEES_EXPLIQUEES.titre,
  DONNEES_EXPLIQUEES.corps,
  DONNEES_EXPLIQUEES.limite,
];

describe("la promesse sur les données", () => {
  it("⭐⭐ dit toujours à quoi les données SERVENT, pas seulement ce qu'on n'en fait pas", () => {
    // « Nous ne vendons pas vos données » est ce que tout le monde écrit et que personne ne lit.
    // La promesse commence par l'usage, parce que c'est la vraie question du dirigeant.
    expect(DONNEES_EN_UNE_PHRASE).toMatch(/sert à votre employé/i);
    expect(DONNEES_EN_DEUX_PHRASES).toMatch(/lui sert à travailler/i);
    expect(DONNEES_EXPLIQUEES.corps).toMatch(/s'en sert pour travailler/i);
  });

  it("⭐⭐ dit toujours où elles s'arrêtent", () => {
    expect(DONNEES_EN_UNE_PHRASE).toMatch(/rien ne sort/i);
    expect(DONNEES_EN_DEUX_PHRASES).toMatch(/n'atteint une autre entreprise/i);
    expect(DONNEES_EXPLIQUEES.limite).toMatch(/aucune donnée ne circule vers un autre client/i);
  });

  it("⭐ promet l'étanchéité SANS échappatoire", () => {
    // « en principe », « sauf obligation », « autant que possible » : chacun de ces mots vide la
    // phrase et se défend devant un juriste. Aucun n'a sa place ici, parce que la garantie est
    // réellement absolue (`adr/0014`) et tenue par la base.
    for (const texte of TOUTES) {
      expect(texte).not.toMatch(/en principe|autant que possible|sauf|dans la mesure/i);
    }
    expect(DONNEES_EXPLIQUEES.limite).toMatch(/jamais/i);
    expect(DONNEES_EXPLIQUEES.limite).toMatch(/même si on nous le demandait/i);
  });

  it("⭐ n'annonce aucun résultat chiffré", () => {
    // « il s'améliore » est vrai et mesurable en base ; « +40 % » ne l'est pas.
    for (const texte of TOUTES) {
      expect(texte).not.toMatch(/\d+\s*%|\bfois plus\b|\bgarantit\b/i);
    }
  });

  it("⭐⭐ tient le lexique et n'a aucun tiret", () => {
    const interdits =
      /\b(IA|intelligence artificielle|bots?|assistants?|agents?|automatisations?|GPT|prompts?|tokens?|workflows?|modèles?|données personnelles)\b/i;

    for (const texte of TOUTES) {
      expect(interdits.exec(texte)?.[0] ?? null, `mot interdit dans « ${texte.slice(0, 40)} »`).toBeNull();
      expect(texte).not.toMatch(/[—–]/);
    }
  });

  it("reste courte là où elle doit l'être", () => {
    // Un long texte de réassurance juste après une saisie donne le sentiment qu'il y a quelque
    // chose à se faire pardonner.
    expect(DONNEES_EN_UNE_PHRASE.length).toBeLessThan(120);
    expect(DONNEES_EN_DEUX_PHRASES.length).toBeLessThan(260);
  });
});
