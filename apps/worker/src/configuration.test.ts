import { describe, expect, it } from "vitest";

import {
  ConfigurationInvalide,
  LONGUEUR_MINIMALE_DU_SECRET,
  VARIABLES,
  lireLaConfiguration,
} from "@sentio/runtime";

const SECRET = "s".repeat(LONGUEUR_MINIMALE_DU_SECRET);

const COMPLET: Record<string, string> = {
  [VARIABLES.databaseUrl]: "postgres://postgres@127.0.0.1:5432/sentio",
  [VARIABLES.secret]: SECRET,
  [VARIABLES.principal.url]: "https://api.exemple.eu/v1",
  [VARIABLES.principal.modele]: "modele-eu-small",
  [VARIABLES.principal.cle]: "cle-de-test",
  [VARIABLES.principal.politique]: "no_train",
};

function manquements(env: Record<string, string | undefined>): string[] {
  try {
    lireLaConfiguration(env);
  } catch (erreur) {
    if (erreur instanceof ConfigurationInvalide) return [...erreur.manquements];
    throw erreur;
  }
  return [];
}

describe("un environnement complet monte", () => {
  it("rend une configuration exploitable", () => {
    const config = lireLaConfiguration(COMPLET);
    expect(config.databaseUrl).toBe(COMPLET[VARIABLES.databaseUrl]);
    expect(config.fournisseurs).toHaveLength(1);
    expect(config.fournisseurs[0]?.dataPolicy).toBe("no_train");
    expect(config.port).toBe(8080);
  });

  it("ordonne la chaîne de repli : le principal d'abord, le secours ensuite", () => {
    // L'ORDRE fait la chaîne. L'inverser enverrait une requête vers le secours en premier.
    const config = lireLaConfiguration({
      ...COMPLET,
      [VARIABLES.secours.url]: "https://secours.exemple.eu/v1",
      [VARIABLES.secours.modele]: "modele-secours",
      [VARIABLES.secours.cle]: "cle-secours",
      [VARIABLES.secours.politique]: "free",
    });
    expect(config.fournisseurs.map((f) => f.key)).toEqual(["principal", "secours"]);
  });
});

describe("le drapeau d'opt-out est fermé par défaut", () => {
  it("vaut faux quand la variable est absente", () => {
    // ⚠️ Faux veut dire : aucune donnée réelle ne part vers un modèle (invariant 5). Un défaut
    // ouvert ferait de l'oubli d'une variable une autorisation de transférer des données.
    expect(lireLaConfiguration(COMPLET).flags.inferenceOptOutProven).toBe(false);
  });

  it("ne s'ouvre que sur « true », exactement", () => {
    expect(
      lireLaConfiguration({ ...COMPLET, [VARIABLES.optOutProuve]: "true" }).flags
        .inferenceOptOutProven,
    ).toBe(true);
    expect(
      lireLaConfiguration({ ...COMPLET, [VARIABLES.optOutProuve]: "false" }).flags
        .inferenceOptOutProven,
    ).toBe(false);
  });

  it("refuse une valeur approchante au lieu de la lire comme fausse", () => {
    // « TRUE », « oui », « 1 » : lues comme fausses, elles feraient croire à une preuve absente
    // alors que quelqu'un a cru l'activer. Le silence serait pire que le refus.
    for (const valeur of ["TRUE", "oui", "1", "vrai"]) {
      expect(manquements({ ...COMPLET, [VARIABLES.optOutProuve]: valeur })).toEqual([
        expect.stringContaining(VARIABLES.optOutProuve),
      ]);
    }
  });
});

describe("ce qui manque est refusé, et dit d'un coup", () => {
  it("rend TOUS les manquements, pas le premier", () => {
    // Échouer sur le premier oblige à redéployer pour découvrir le second.
    const trouves = manquements({});
    expect(trouves.length).toBeGreaterThanOrEqual(3);
    expect(trouves.some((m) => m.includes(VARIABLES.databaseUrl))).toBe(true);
    expect(trouves.some((m) => m.includes(VARIABLES.secret))).toBe(true);
    expect(trouves.some((m) => m.includes(VARIABLES.principal.url))).toBe(true);
  });

  it("refuse un secret trop court — un secret devinable vaut un point d'entrée public", () => {
    const trouves = manquements({ ...COMPLET, [VARIABLES.secret]: "trop-court" });
    expect(trouves).toEqual([expect.stringContaining(VARIABLES.secret)]);
  });

  it("refuse une base qui n'est pas Postgres", () => {
    expect(manquements({ ...COMPLET, [VARIABLES.databaseUrl]: "mysql://ailleurs" })).toEqual([
      expect.stringContaining(VARIABLES.databaseUrl),
    ]);
  });

  it("refuse un worker sans aucun fournisseur : il ne pourrait rien décider", () => {
    const sansModele = { ...COMPLET };
    for (const nom of Object.values(VARIABLES.principal)) delete sansModele[nom];
    expect(manquements(sansModele)).toEqual([expect.stringContaining(VARIABLES.principal.url)]);
  });

  it("refuse un groupe de fournisseur à moitié rempli, au lieu de le compléter", () => {
    const sansPolitique = { ...COMPLET };
    delete sansPolitique[VARIABLES.principal.politique];
    // Une adresse et une clé sans politique de données : on ne devine pas si le fournisseur est
    // « sans entraînement ». Deviner, ici, c'est risquer d'y envoyer une donnée réelle.
    expect(manquements(sansPolitique)).toEqual([
      expect.stringContaining(VARIABLES.principal.politique),
    ]);
  });

  it("refuse une politique de données inventée", () => {
    expect(
      manquements({ ...COMPLET, [VARIABLES.principal.politique]: "probablement_no_train" }),
    ).toEqual([expect.stringContaining(VARIABLES.principal.politique)]);
  });

  it("refuse une adresse de fournisseur non chiffrée", () => {
    // Une clé d'API sur du HTTP en clair est une clé compromise.
    expect(manquements({ ...COMPLET, [VARIABLES.principal.url]: "http://api.exemple.eu/v1" })).toEqual(
      [expect.stringContaining(VARIABLES.principal.url)],
    );
  });

  it("refuse un port qui n'en est pas un", () => {
    for (const port of ["zero", "0", "70000", "8080.5"]) {
      expect(manquements({ ...COMPLET, [VARIABLES.port]: port })).toEqual([
        expect.stringContaining(VARIABLES.port),
      ]);
    }
  });

  it("relaie le refus des réglages du runtime sans en réécrire un second", () => {
    expect(manquements({ ...COMPLET, SENTIO_PAS_MAX_PAR_RUN: "dix" })).toEqual([
      expect.stringContaining("SENTIO_PAS_MAX_PAR_RUN"),
    ]);
  });
});

describe("aucun secret ne sort de ce module", () => {
  it("ne cite jamais une valeur dans un message d'erreur", () => {
    // Cette erreur est faite pour être journalisée. Un mot de passe de base ou une clé de
    // fournisseur qui y figurerait finirait chez un tiers, dans un outil de suivi d'incidents.
    const secretsEnClair = [
      "mot-de-passe-tres-secret",
      "cle-api-tres-secrete",
      "secret-de-battement-tres-long-et-tres-secret",
    ];
    const trouves = manquements({
      [VARIABLES.databaseUrl]: `mysql://user:${secretsEnClair[0]}@ailleurs/db`,
      [VARIABLES.secret]: secretsEnClair[2],
      [VARIABLES.principal.url]: "http://api.exemple.eu/v1",
      [VARIABLES.principal.modele]: "m",
      [VARIABLES.principal.cle]: secretsEnClair[1],
      [VARIABLES.principal.politique]: "no_train",
    });

    expect(trouves.length).toBeGreaterThan(0);
    const tout = trouves.join("\n");
    for (const secret of secretsEnClair) expect(tout).not.toContain(secret);
  });

  it("ne cite pas non plus les valeurs dans le message de l'erreur assemblée", () => {
    try {
      lireLaConfiguration({ ...COMPLET, [VARIABLES.databaseUrl]: "mysql://u:motdepasse@h/d" });
      throw new Error("attendu un refus");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(ConfigurationInvalide);
      expect((erreur as Error).message).not.toContain("motdepasse");
    }
  });
});
