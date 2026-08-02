import { describe, expect, it } from "vitest";

import { UpdateFicheCapability, type FicheEventJournal, type LeadStatusStore } from "./update-fiche.js";

function build(options: { found?: boolean } = {}) {
  const updates: Array<{ tenantId: string; leadId: string; status: string }> = [];
  const journalEntries: Array<{
    tenantId: string;
    leadId: string;
    employeeId: string;
    status: string;
    note: string | null;
  }> = [];

  const leads: LeadStatusStore = {
    async updateStatus(input) {
      updates.push(input);
      return options.found ?? true;
    },
  };
  const journal: FicheEventJournal = {
    async record(input) {
      journalEntries.push(input);
    },
  };

  const capability = new UpdateFicheCapability(leads, journal);
  return { capability, updates, journalEntries };
}

describe("UpdateFicheCapability — ce que consigne une mise à jour de fiche", () => {
  it("met à jour le statut et journalise, note comprise", async () => {
    const { capability, updates, journalEntries } = build();
    const result = await capability.execute(
      { tenantId: "t-1", leadId: "l-1", status: "repondu", note: "Intéressé par une démo." },
      { employeeId: "e-1" },
    );

    expect(result).toEqual({ status: "mise_a_jour", leadId: "l-1" });
    expect(updates).toEqual([{ tenantId: "t-1", leadId: "l-1", status: "repondu" }]);
    expect(journalEntries).toEqual([
      {
        tenantId: "t-1",
        leadId: "l-1",
        employeeId: "e-1",
        status: "repondu",
        note: "Intéressé par une démo.",
      },
    ]);
  });

  it("n'écrit aucun événement pour une note absente", async () => {
    const { capability, journalEntries } = build();
    await capability.execute({ tenantId: "t-1", leadId: "l-1", status: "contacte" }, { employeeId: "e-1" });
    expect(journalEntries[0]?.note).toBeNull();
  });

  it("traite une note faite uniquement d'espaces comme absente", async () => {
    const { capability, journalEntries } = build();
    await capability.execute(
      { tenantId: "t-1", leadId: "l-1", status: "contacte", note: "   " },
      { employeeId: "e-1" },
    );
    expect(journalEntries[0]?.note).toBeNull();
  });

  it("retourne prospect_inconnu et ne journalise rien si la fiche n'existe pas", async () => {
    const { capability, journalEntries } = build({ found: false });
    const result = await capability.execute(
      { tenantId: "t-1", leadId: "l-inconnu", status: "exclu" },
      { employeeId: "e-1" },
    );
    expect(result).toEqual({ status: "prospect_inconnu" });
    expect(journalEntries).toHaveLength(0);
  });

  it("recadre les espaces superflus d'une note réelle", async () => {
    const { capability, journalEntries } = build();
    await capability.execute(
      { tenantId: "t-1", leadId: "l-1", status: "repondu", note: "  bien  " },
      { employeeId: "e-1" },
    );
    expect(journalEntries[0]?.note).toBe("bien");
  });
});
