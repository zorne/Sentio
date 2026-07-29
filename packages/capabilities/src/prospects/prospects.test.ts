import { describe, expect, it } from "vitest";

import { evaluateReputation, suppressionFor } from "../email/reputation.js";
import { parseProspectImport, splitRow } from "./import.js";
import { qualifyLead, selectionReason } from "./qualify.js";

describe("Import de la liste du client", () => {
  const header = "entreprise;email;contact;secteur";

  it("lit un fichier ordinaire et normalise les adresses", () => {
    const report = parseProspectImport(
      [header, "Menuiseries Duval;Contact@Duval.FR;Marc Duval;menuiserie"].join("\n"),
      { source: "export CRM du client" },
    );

    expect(report.leads).toEqual([
      {
        companyName: "Menuiseries Duval",
        email: "contact@duval.fr",
        contactName: "Marc Duval",
        roleTitle: null,
        sector: "menuiserie",
        source: "export CRM du client",
      },
    ]);
  });

  it("accepte la virgule comme la virgule-point, et les guillemets", () => {
    const report = parseProspectImport(
      ['entreprise,email', '"Duval, Père et Fils",contact@duval.fr'].join("\n"),
      { source: "fichier client" },
    );

    expect(report.leads[0]?.companyName).toBe("Duval, Père et Fils");
    expect(splitRow('a;"b;c";d', ";")).toEqual(["a", "b;c", "d"]);
  });

  it("refuse ligne par ligne, avec la raison et le numéro de ligne", () => {
    const report = parseProspectImport(
      [
        header,
        "Bonne Entreprise;contact@bonne.fr;;menuiserie",
        ";orphelin@nulle-part.fr;;",
        "Adresse Cassée;pas-une-adresse;;",
        "Boîte Automatique;noreply@exemple.fr;;",
        "Doublon;contact@bonne.fr;;",
      ].join("\n"),
      { source: "fichier client" },
    );

    expect(report.leads).toHaveLength(1);
    expect(report.rejected).toEqual([
      { line: 3, reason: "entreprise manquante" },
      { line: 4, reason: "adresse invalide : « pas-une-adresse »" },
      { line: 5, reason: "adresse automatique, jamais démarchée" },
      { line: 6, reason: "doublon dans le fichier" },
    ]);
  });

  it("refuse un import sans origine — on ne saurait pas d'où vient la donnée", () => {
    expect(() => parseProspectImport(header, { source: "  " })).toThrow(/origine/);
  });

  it("refuse un fichier sans colonne entreprise plutôt que de deviner", () => {
    expect(() => parseProspectImport("email\ncontact@duval.fr", { source: "x" })).toThrow(
      /entreprise/,
    );
  });
});

describe("Qualification", () => {
  const base = {
    companyName: "Menuiseries Duval",
    email: "contact@duval.fr",
    sector: "menuiserie",
    source: "fichier client",
  };

  it("qualifie un prospect exploitable quand le client ne restreint rien", () => {
    expect(qualifyLead(base)).toMatchObject({ qualification: "qualifie" });
  });

  it("écarte sans adresse, sans entreprise, ou sans origine — dans cet ordre de gravité", () => {
    expect(qualifyLead({ ...base, email: null }).reason).toMatch(/aucune adresse/);
    expect(qualifyLead({ ...base, companyName: " " }).reason).toMatch(/entreprise inconnue/);
    expect(qualifyLead({ ...base, source: "" }).reason).toMatch(/origine/);
    // Une adresse manquante ne doit pas être expliquée par le secteur : ce serait une raison fausse.
    expect(qualifyLead({ ...base, email: null, sector: "boulangerie" }, { targetSectors: ["menuiserie"] }).reason)
      .toMatch(/aucune adresse/);
  });

  it("respecte les cibles et les exclusions du client", () => {
    expect(qualifyLead(base, { targetSectors: ["menuiserie", "charpente"] })).toMatchObject({
      qualification: "qualifie",
    });
    expect(qualifyLead({ ...base, sector: "boulangerie" }, { targetSectors: ["menuiserie"] })).toMatchObject({
      qualification: "ecarte",
    });
    expect(qualifyLead(base, { excludedSectors: ["menuiserie"] })).toMatchObject({
      qualification: "ecarte",
    });
    expect(qualifyLead(base, { excludedDomains: ["duval.fr"] }).reason).toMatch(/domaine exclu/);
  });

  it("l'exclusion l'emporte sur la cible", () => {
    // Un client qui vise un secteur et en exclut une partie doit voir l'exclusion gagner : c'est
    // toujours l'exclusion qui porte une raison précise.
    expect(
      qualifyLead(base, { targetSectors: ["menuiserie"], excludedDomains: ["duval.fr"] }),
    ).toMatchObject({ qualification: "ecarte" });
  });

  it("n'invente pas un secteur pour faire entrer un prospect dans la cible", () => {
    expect(qualifyLead({ ...base, sector: null }, { targetSectors: ["menuiserie"] })).toMatchObject({
      qualification: "ecarte",
    });
  });

  it("ne redécouvre pas un prospect déjà contacté", () => {
    expect(qualifyLead({ ...base, alreadyContacted: true }).reason).toBe("déjà contacté");
  });

  it("produit toujours un motif de sélection lisible", () => {
    const qualification = qualifyLead(base, { targetSectors: ["menuiserie"] });

    expect(selectionReason(base, qualification)).toContain("Menuiseries Duval");
    expect(selectionReason(base, qualification)).toContain("origine : fichier client");
  });
});

describe("Réputation d'envoi", () => {
  it("ne conclut rien sous le volume minimum", () => {
    // Un rebond sur deux envois donne 50 % : sans plancher, la montée en charge se suspendrait
    // elle-même dès le premier jour.
    expect(evaluateReputation({ sent: 2, bounced: 1, complained: 0 })).toMatchObject({
      suspend: false,
    });
  });

  it("suspend au-delà du taux de plaintes", () => {
    const verdict = evaluateReputation({ sent: 1000, bounced: 0, complained: 4 });

    expect(verdict.suspend).toBe(true);
    expect(verdict.suspend && verdict.reason).toMatch(/plaintes/);
  });

  it("suspend au-delà du taux de rebonds", () => {
    const verdict = evaluateReputation({ sent: 1000, bounced: 21, complained: 0 });

    expect(verdict.suspend).toBe(true);
    expect(verdict.suspend && verdict.reason).toMatch(/rebonds/);
  });

  it("laisse passer un domaine en bonne santé", () => {
    expect(evaluateReputation({ sent: 1000, bounced: 5, complained: 1 })).toMatchObject({
      suspend: false,
    });
  });

  it("la plainte prime sur le rebond dans l'explication", () => {
    // Les deux dépassent : on nomme le plus grave, celui qui vaut un signalement du destinataire.
    const verdict = evaluateReputation({ sent: 1000, bounced: 100, complained: 50 });

    expect(verdict.suspend && verdict.reason).toMatch(/plaintes/);
  });

  it("transforme un retour du service en exclusion définitive", () => {
    expect(suppressionFor({ kind: "bounce", email: " Contact@Prospect.FR " })).toEqual({
      pattern: "contact@prospect.fr",
      kind: "rebond",
      reason: "adresse injoignable",
    });
    expect(suppressionFor({ kind: "complaint", email: "x@y.fr" }).kind).toBe("plainte");
    expect(suppressionFor({ kind: "unsubscribe", email: "x@y.fr" }).kind).toBe("desinscription");
  });
});
