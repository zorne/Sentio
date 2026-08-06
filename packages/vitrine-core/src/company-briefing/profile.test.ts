import { describe, expect, it } from "vitest";

import { BRIEFING_TOOL } from "./prompt.js";
import {
  PROFILE_FIELDS,
  REQUIRED_FIELDS,
  buildProfileBriefing,
  composeSystemPrompt,
  parseProfile,
  readProfileFromConfig,
} from "./profile.js";

const DEFAUT = "Vous êtes un employé commercial.";
const ACCUEIL = "Vous travaillez pour Menuiserie Kerbrat, dans le mobilier sur mesure.";

describe("l'outil d'extraction et le profil ne peuvent pas diverger", () => {
  // Sans ce test, un champ ajouté à l'outil mais absent du profil serait demandé au client,
  // reçu du modèle, puis jeté par parseProfile — en silence, sans erreur nulle part.
  it("expose exactement les champs du profil, et exige exactement les champs requis", () => {
    expect(Object.keys(BRIEFING_TOOL.parameters.properties).sort()).toEqual(
      PROFILE_FIELDS.map((f) => f.key).sort(),
    );
    expect([...BRIEFING_TOOL.parameters.required].sort()).toEqual([...REQUIRED_FIELDS].sort());
  });
});

describe("parseProfile — ce qu'on accepte de retenir", () => {
  it("retient tous les champs facultatifs réellement renseignés", () => {
    const parsed = parseProfile({
      cible: "Architectes en Bretagne",
      offre: "Devis sous 48h",
      objections: "« trop cher » — nous posons nous-mêmes, sans sous-traitance",
      exclusions: "Jamais les cuisinistes, ce sont nos apporteurs",
    });
    if (!("profile" in parsed)) throw new Error("attendu un profil");
    expect(parsed.profile.objections).toBe("« trop cher » — nous posons nous-mêmes, sans sous-traitance");
    expect(parsed.profile.exclusions).toBe("Jamais les cuisinistes, ce sont nos apporteurs");
  });

  it("laisse absent un champ facultatif vide plutôt que d'écrire une clé vide", () => {
    const parsed = parseProfile({ cible: "Architectes", offre: "Devis", ton: "   " });
    if (!("profile" in parsed)) throw new Error("attendu un profil");
    expect("ton" in parsed.profile).toBe(false);
  });

  it("ne réclame jamais un champ facultatif", () => {
    const parsed = parseProfile({ activite: "Menuiserie" });
    if (!("missing" in parsed)) throw new Error("attendu des manques");
    expect([...parsed.missing].sort()).toEqual(["cible", "offre"]);
  });

  it("refuse un candidat qui n'est pas un objet", () => {
    expect(parseProfile("Architectes en Bretagne")).toEqual({ missing: REQUIRED_FIELDS });
  });
});

describe("readProfileFromConfig — relire ce qui a été écrit, quelle que soit la génération", () => {
  it("lit les deux clés du formulaire historique comme cible et offre", () => {
    expect(readProfileFromConfig({ prospectingCriteria: "Architectes", prospectingOffer: "Devis" })).toEqual({
      cible: "Architectes",
      offre: "Devis",
    });
  });

  it("fait primer companyProfile quand les deux coexistent", () => {
    const profil = readProfileFromConfig({
      prospectingCriteria: "Ancienne cible",
      companyProfile: { cible: "Nouvelle cible", ton: "direct" },
    });
    expect(profil.cible).toBe("Nouvelle cible");
    expect(profil.ton).toBe("direct");
  });

  it("ne se casse pas sur une config vide, nulle ou d'un autre type", () => {
    expect(readProfileFromConfig({})).toEqual({});
    expect(readProfileFromConfig(null)).toEqual({});
    expect(readProfileFromConfig("companyProfile")).toEqual({});
  });
});

describe("buildProfileBriefing — ce que l'employé relit", () => {
  it("rend un bloc vide quand il n'y a rien à dire, plutôt qu'un en-tête sans contenu", () => {
    expect(buildProfileBriefing({})).toBe("");
  });

  it("suit l'ordre de PROFILE_FIELDS, pas celui de l'objet reçu", () => {
    const bloc = buildProfileBriefing({ ton: "direct", cible: "Architectes", activite: "Menuiserie" });
    expect(bloc.indexOf("Menuiserie")).toBeLessThan(bloc.indexOf("Architectes"));
    expect(bloc.indexOf("Architectes")).toBeLessThan(bloc.indexOf("direct"));
  });
});

describe("composeSystemPrompt — le défaut qui rendait la configuration invisible", () => {
  // Le cas de tous les vrais clients : ils passent par le chat d'accueil, donc ils ONT un
  // systemPrompt. L'ancienne loadIdentity retournait celui-ci et s'arrêtait — le profil
  // recueilli après l'achat n'atteignait jamais l'employé.
  it("ajoute le profil au prompt d'accueil au lieu de le remplacer", () => {
    const prompt = composeSystemPrompt(DEFAUT, {
      systemPrompt: ACCUEIL,
      companyProfile: { cible: "Architectes en Bretagne", offre: "Devis sous 48h" },
    });
    expect(prompt).toContain(ACCUEIL);
    expect(prompt).toContain("Architectes en Bretagne");
    expect(prompt).toContain("Devis sous 48h");
    expect(prompt).not.toContain(DEFAUT);
  });

  it("part du prompt par défaut quand le client n'est pas passé par l'accueil", () => {
    const prompt = composeSystemPrompt(DEFAUT, { companyProfile: { cible: "Architectes", offre: "Devis" } });
    expect(prompt).toContain(DEFAUT);
    expect(prompt).toContain("Architectes");
  });

  it("n'ajoute rien quand rien n'a été configuré", () => {
    expect(composeSystemPrompt(DEFAUT, {})).toBe(DEFAUT);
    expect(composeSystemPrompt(DEFAUT, null)).toBe(DEFAUT);
  });

  it("porte jusqu'à l'employé les champs que l'ancienne version ne savait pas transporter", () => {
    const prompt = composeSystemPrompt(DEFAUT, {
      systemPrompt: ACCUEIL,
      companyProfile: {
        cible: "Architectes",
        offre: "Devis",
        exclusions: "Jamais les cuisinistes",
        interdits: "Ne jamais promettre de délai de pose",
      },
    });
    expect(prompt).toContain("Jamais les cuisinistes");
    expect(prompt).toContain("Ne jamais promettre de délai de pose");
  });
});
