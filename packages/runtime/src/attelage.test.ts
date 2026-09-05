/**
 * L'attelage — et surtout ce qu'il refuse.
 *
 * Le cas qui compte n'est pas « l'entrée est bien construite » : c'est **une réponse de modèle
 * qui désigne une autre cible**. C'est le scénario d'injection de `docs/10-securite-rgpd.md`, et
 * la seule chose qui se tient entre lui et un effet réel, c'est ce fichier.
 *
 * Réalise : EXEC-19
 */

import { CAPACITES } from "@sentio/domain";
import type { EmployeeId, TaskId, TenantId } from "@sentio/domain";
import { describe, expect, it, vi } from "vitest";

import { ATTELAGES, atteler, EntreeRefusee } from "./attelage.js";

const MISSION = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  employeeId: "22222222-2222-2222-2222-222222222222" as EmployeeId,
  taskId: "33333333-3333-3333-3333-333333333333" as TaskId,
  sujetKind: "lead",
  sujetId: "44444444-4444-4444-4444-444444444444",
};

const moteurMuet = () => ({
  engineKey: "base",
  capabilityKey: CAPACITES.mettreAJourProspect,
  execute: vi.fn(async () => ({ status: "mise_a_jour" })),
});

describe("Le modèle choisit le geste, jamais la cible", () => {
  it("⭐⭐ refuse une entrée qui désigne un autre prospect", async () => {
    // Le scénario réel : une consigne glissée dans un nom d'entreprise ou un email reçu, que le
    // modèle recopie docilement. Sans ce refus, elle ferait agir sur la fiche d'un autre.
    const moteur = moteurMuet();
    const attele = atteler(moteur, CAPACITES.mettreAJourProspect, MISSION);

    await expect(
      attele.execute({ statut: "exclu", lead_id: "99999999-9999-9999-9999-999999999999" }),
    ).rejects.toBeInstanceOf(EntreeRefusee);

    // Et rien n'a été tenté : le refus précède le moteur.
    expect(moteur.execute).not.toHaveBeenCalled();
  });

  it("⭐⭐ refuse une entrée qui désigne une autre entreprise", async () => {
    const moteur = moteurMuet();
    const attele = atteler(moteur, CAPACITES.mettreAJourProspect, MISSION);

    await expect(
      attele.execute({ statut: "contacte", tenantId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(/tenantId/);
    expect(moteur.execute).not.toHaveBeenCalled();
  });

  it("⭐ refuse au lieu de remplacer en silence", async () => {
    // Remplacer l'identifiant sans rien dire ferait d'une tentative détectée un incident
    // invisible. Le champ fautif doit se retrouver dans le message, donc au journal.
    const attele = atteler(moteurMuet(), CAPACITES.mettreAJourProspect, MISSION);
    await expect(attele.execute({ statut: "contacte", lead_id: "x" })).rejects.toThrow(/lead_id/);
  });

  it("prend la cible dans la mission, et le contenu dans le modèle", async () => {
    const moteur = moteurMuet();
    const attele = atteler(moteur, CAPACITES.mettreAJourProspect, MISSION);

    await attele.execute({ statut: "repondu", note: "Rappeler en septembre." });

    expect(moteur.execute).toHaveBeenCalledWith(
      {
        tenantId: MISSION.tenantId,
        leadId: MISSION.sujetId,
        status: "repondu",
        note: "Rappeler en septembre.",
      },
      expect.objectContaining({ employeeId: MISSION.employeeId }),
    );
  });
});

describe("Ce que la base refuserait, l'attelage le refuse d'abord", () => {
  it("⭐ refuse un statut inventé", async () => {
    // Sans ça, l'erreur arriverait au moment de l'écriture — donc après avoir compté une
    // tentative, et avec un message qui parle de contrainte au lieu de parler du travail.
    const attele = atteler(moteurMuet(), CAPACITES.mettreAJourProspect, MISSION);
    await expect(attele.execute({ statut: "chaud" })).rejects.toThrow(/Statut de fiche inconnu/);
  });

  it("refuse une note qui n'est pas du texte", async () => {
    const attele = atteler(moteurMuet(), CAPACITES.mettreAJourProspect, MISSION);
    await expect(attele.execute({ statut: "contacte", note: 42 })).rejects.toBeInstanceOf(
      EntreeRefusee,
    );
  });

  it("refuse d'agir sur un sujet qui n'est pas un prospect", async () => {
    const attele = atteler(moteurMuet(), CAPACITES.mettreAJourProspect, {
      ...MISSION,
      sujetKind: "facture",
    });
    await expect(attele.execute({ statut: "contacte" })).rejects.toThrow(/facture/);
  });
});

describe("La qualification n'accepte AUCUN champ", () => {
  it("⭐⭐ le modèle demande la qualification, il ne l'oriente pas", async () => {
    // C'est la formulation la plus nette de la règle : la décision est déterministe, donc
    // rejouable et explicable. Un « secteur » soufflé par le modèle la rendrait ni l'un ni l'autre.
    const moteur = {
      engineKey: "base",
      capabilityKey: CAPACITES.qualifierProspect,
      execute: vi.fn(async () => ({ status: "qualifie" })),
    };
    const attele = atteler(moteur, CAPACITES.qualifierProspect, MISSION);

    await expect(attele.execute({ secteur: "santé" })).rejects.toThrow(/aucun champ/);

    await attele.execute({});
    expect(moteur.execute).toHaveBeenCalledWith(
      { tenantId: MISSION.tenantId, leadId: MISSION.sujetId },
      expect.anything(),
    );
  });
});

describe("Écrire à une entreprise : le message vient du modèle, l'adresse de la mission", () => {
  it("⭐ même pour un envoi, la cible n'est pas négociable", async () => {
    const moteur = {
      engineKey: "base",
      capabilityKey: CAPACITES.envoyerProspect,
      execute: vi.fn(async () => ({ message_id: "m" })),
    };
    const attele = atteler(moteur, CAPACITES.envoyerProspect, MISSION);

    await expect(
      attele.execute({ objet: "Bonjour", corps: "...", lead_id: "autre" }),
    ).rejects.toBeInstanceOf(EntreeRefusee);

    await attele.execute({ objet: "Bonjour", corps: "Votre chantier..." });
    expect(moteur.execute).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: MISSION.sujetId, objet: "Bonjour" }),
      expect.anything(),
    );
  });

  it("refuse un message vide", async () => {
    const attele = atteler(moteurMuet(), CAPACITES.envoyerProspect, MISSION);
    await expect(attele.execute({ objet: "  ", corps: "..." })).rejects.toThrow(/obligatoire/);
  });
});

describe("Une capacité sans attelage n'agit pas", () => {
  it("⭐ échoue franchement plutôt que de deviner une entrée", async () => {
    // Filet de sécurité, pas garde-fou : une capacité sans MOTEUR échoue déjà avant d'arriver
    // ici. Ce cas couvre l'inverse — un moteur enregistré dont personne n'a écrit la traduction.
    //
    // ⚠️ L'EXEMPLE A CHANGÉ LE 2026-08-28, PAS LA RÈGLE. Ce test prenait `rechercher.prospect`
    // comme illustration d'une capacité sans attelage — elle en a un depuis que le constat P0-1
    // a été corrigé. L'invariant vérifié est le même, mot pour mot ; il lui fallait un exemple
    // encore vrai. Une clé inventée le restera : aucune raison ne poussera jamais à lui écrire un
    // attelage, alors que les cinq capacités réelles finiront toutes par en avoir un.
    const capaciteSansAttelage = "inventer.licorne";
    expect(ATTELAGES.has(capaciteSansAttelage)).toBe(false);

    const moteur = moteurMuet();
    const attele = atteler(moteur, capaciteSansAttelage, MISSION);

    await expect(attele.execute({ limite: 10 })).rejects.toThrow(/Aucun attelage/);
    expect(moteur.execute).not.toHaveBeenCalled();
  });
});
