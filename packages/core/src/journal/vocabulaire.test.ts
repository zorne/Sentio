import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../policy/engine.js";
import { decideNextAction } from "../runtime/next-action.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { ModelGateway } from "../model/gateway.js";
import { NATURES_CONNUES, estNatureConnue } from "./vocabulaire.js";

/**
 * ⚠️ CE FICHIER EXISTE À CAUSE D'UN BUG RÉEL, ET IL EST LÀ POUR QU'IL NE REVIENNE PAS.
 *
 * `EXEC-02` déclare un vocabulaire **fermé** : une nature inconnue fait échouer la reconstruction
 * du journal, au lieu d'être ignorée. C'est la bonne règle. Mais quatre natures réellement écrites
 * par le runtime n'y figuraient pas — `proposition_recue`, `proposition_illisible`,
 * `politique_allow`, `politique_refuse`. Conséquence : dès le premier pas réel, la reconstruction
 * refusait le journal entier, la mission partait en « attention requise », et l'employé
 * s'arrêtait. Chaque pièce était juste ; l'assemblage ne l'était pas.
 *
 * Une liste tenue à la main est une liste qui divergera. Ces tests **font écrire** les composants
 * et vérifient que chaque nature produite est déclarée — c'est la seule façon d'attraper le cas
 * qui a mordu, où la nature est construite (`politique_${outcome}`) et non écrite en toutes
 * lettres. Un contrôle statique ne l'aurait pas vu.
 */

/** Un journal qui ne fait que retenir les natures écrites. */
function journalEspion(): { natures: string[]; append: (entry: { kind: string }) => Promise<void> } {
  const natures: string[] = [];
  return {
    natures,
    append: async (entry) => {
      natures.push(entry.kind);
    },
  };
}

const DEMANDE = {
  tenantId: "t-1" as never,
  taskId: "tache-1" as never,
  employeeId: "e-1" as never,
  capabilityKey: "envoyer.prospect",
  autonomy: "confirm_once" as const,
};

describe("tout ce que le runtime écrit au journal est déclaré", () => {
  it("le Policy Engine — y compris les natures construites par interpolation", async () => {
    // `politique_${decision.outcome}` : c'est exactement la forme qui avait échappé à la liste.
    const espion = journalEspion();
    const accords = {
      hasStandingApproval: async () => true,
      requestApproval: async () => "accord-1",
    };
    const engine = new PolicyEngine(accords, espion as never);

    await engine.decide({ ...DEMANDE, effectClass: "read" }); // allow
    await engine.decide({ ...DEMANDE, effectClass: "external_irreversible" }); // allow, accord permanent
    await engine.refuse({ ...DEMANDE, effectClass: "read" }, ["autre_capacite"]); // refuse

    const sansAccord = new PolicyEngine(
      { ...accords, hasStandingApproval: async () => false },
      espion as never,
    );
    await sansAccord.decide({ ...DEMANDE, effectClass: "external_irreversible" }); // suspend

    expect(espion.natures.length).toBeGreaterThanOrEqual(4);
    for (const nature of espion.natures) {
      expect(estNatureConnue(nature), `« ${nature} » n'est pas déclarée`).toBe(true);
    }
  });

  it("la lecture de proposition — réponse exploitable comme réponse illisible", async () => {
    const registry = new CapabilityRegistry();
    registry.registerContract({
      key: "envoyer.prospect",
      effectClass: "internal_write",
      description: "…",
    });

    for (const reponse of [
      JSON.stringify({
        action: "agir",
        capacite: "envoyer.prospect",
        entree: {},
        pourquoi: "parce que",
      }),
      "ceci n'est pas du JSON",
    ]) {
      const espion = journalEspion();
      const gateway = {
        complete: async () => ({
          turn: { role: "assistant", type: "text", text: reponse },
          tokens: 1,
          providerKey: "faux",
          skipped: [],
        }),
      } as unknown as ModelGateway;

      await decideNextAction(
        {
          gateway,
          policy: new PolicyEngine(
            { hasStandingApproval: async () => true, requestApproval: async () => "a" },
            espion as never,
          ),
          registry,
          journal: espion as never,
        },
        {
          tenantId: "t-1" as never,
          taskId: "tache-1" as never,
          employeeId: "e-1" as never,
          turns: [{ role: "system", type: "text", text: "consigne" }],
          capacitesAutorisees: ["envoyer.prospect"],
          autonomy: "confirm_once",
          dataClass: "synthetic",
          envelope: "internal",
        },
      );

      expect(espion.natures.length).toBeGreaterThan(0);
      for (const nature of espion.natures) {
        expect(estNatureConnue(nature), `« ${nature} » n'est pas déclarée`).toBe(true);
      }
    }
  });

  it("la liste ne contient pas de doublon — un doublon masquerait une nature oubliée", () => {
    expect(new Set(NATURES_CONNUES).size).toBe(NATURES_CONNUES.length);
  });
});
