import { describe, expect, it } from "vitest";

import { decrireLaFormule, PRIX_PENDANT_LA_BETA, type QuotaDeFormule } from "./formules.js";

/**
 * La page des formules est le dernier écran avant que quelqu'un s'engage. Ce qui y est écrit doit
 * être VRAI, et le rester quand la base change.
 */

const QUOTAS_START: QuotaDeFormule[] = [
  { metric: "active_employees", quotaLimit: 1 },
  { metric: "tasks_per_period", quotaLimit: 300 },
  { metric: "outbound_messages_per_period", quotaLimit: 500 },
  { metric: "outbound_messages_per_day", quotaLimit: 30 },
  { metric: "inference_tokens_per_period", quotaLimit: 2_000_000 },
  { metric: "inference_tokens_per_day", quotaLimit: 200_000 },
];

describe("les formules dites au client", () => {
  it("nomme le palier sans jamais montrer son nom technique", () => {
    const formule = decrireLaFormule("start", true, QUOTAS_START);

    expect(formule?.nom).toBe("Premier employé");
    expect(formule?.pourQui).toContain("premier travail répétitif");
    // Le `tier` reste disponible pour le code, mais il n'est pas ce qu'on montre.
    expect(formule?.nom).not.toContain("start");
  });

  it("⭐⭐ dit les limites RÉELLES, celles que la base applique", () => {
    const formule = decrireLaFormule("start", true, QUOTAS_START);

    expect(formule?.limites).toContain("1 employé numérique");
    expect(formule?.limites).toContain("300 missions par mois");
    expect(formule?.limites).toContain("500 messages par mois");
    // Le plafond quotidien est dit AVEC sa raison : sinon il se lit comme une brimade.
    expect(formule?.limites.some((l) => l.includes("réputation"))).toBe(true);
  });

  it("⭐⭐ ne montre JAMAIS les jetons d'inférence", () => {
    // Un jeton ne veut rien dire pour un dirigeant, et `docs/17` interdit le mot. Il est
    // appliqué, il n'est pas affiché : lui faire visiter la salle des machines ne l'aide pas.
    const formule = decrireLaFormule("start", true, QUOTAS_START);

    for (const limite of formule?.limites ?? []) {
      expect(limite).not.toMatch(/jeton|token|inférence|inference/i);
    }
    expect(formule?.limites).toHaveLength(4);
  });

  it("⭐ n'annonce aucun prix, et le dit en clair", () => {
    // Le prix vit chez le prestataire de paiement (`docs/31` §5). Tant qu'il n'est pas branché,
    // il n'y a rien à afficher, et écrire « gratuit » est la seule chose vraie.
    const formule = decrireLaFormule("start", true, QUOTAS_START);

    // ⚠️ « EUR » sans borne de mot attrape « expéditeur ». Un test qui crie sur du vrai finit
    // par être desserré jusqu'à ne plus rien attraper.
    expect(JSON.stringify(formule)).not.toMatch(/€|\bEUR\b|\bprix\b|\b\d+\s*(?:euros?|mois)\b/i);
    expect(PRIX_PENDANT_LA_BETA).toContain("Gratuit");
    expect(PRIX_PENDANT_LA_BETA).not.toMatch(/\d/);
  });

  it("⭐⭐ dit qu'un palier non commercialisable ne l'est pas", () => {
    // La base marque `growth` et `scale` non commercialisables. Les montrer comme achetables
    // ferait acheter une formule que le recrutement refuserait ensuite, APRÈS le paiement.
    const indisponible = decrireLaFormule("growth", false, QUOTAS_START);

    expect(indisponible?.disponible).toBe(false);
    expect(decrireLaFormule("start", true, QUOTAS_START)?.disponible).toBe(true);
  });

  it("⭐ ne montre pas un palier qu'on n'a pas su nommer", () => {
    // Une formule ajoutée en base sans passer par ici disparaît de la page. C'est le bon défaut :
    // on ne vend pas quelque chose dont on n'a pas écrit le nom.
    expect(decrireLaFormule("entreprise_sur_mesure", true, QUOTAS_START)).toBeNull();
  });

  it("se passe d'un quota manquant sans inventer de valeur", () => {
    const formule = decrireLaFormule("start", true, [{ metric: "active_employees", quotaLimit: 1 }]);

    expect(formule?.limites).toEqual(["1 employé numérique"]);
  });
});
