import { randomUUID } from "node:crypto";

import {
  RechercherProspectsCapability,
  type AnnuaireDEntreprises,
  type EntrepriseTrouvee,
} from "@sentio/capabilities";
import { GisementDeProspects, RegistreDeProspectsPostgres, jourUtc } from "@sentio/runtime";
import type { EmployeeId, TenantId } from "@sentio/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * P0-1 — le premier maillon de la chaîne, du repérage jusqu'à la mission ouverte.
 *
 * ══ CE QUE CE FICHIER PROUVE, ET QU'AUCUN AUTRE NE PROUVAIT ══
 *
 * Avant le 2026-08-28, **rien ne remplissait la table `lead`** : ni route, ni écran, ni worker, ni
 * migration. Les missions ne s'ouvrant que depuis cette table, le runtime tournait à vide —
 * définitivement, et sans que rien ne le signale. C'est le constat P0-1 de `docs/35`.
 *
 * On vérifie donc ce que le produit promet réellement : des entreprises inscrites, dédoublonnées,
 * et **du travail qui s'ouvre pour elles**.
 *
 * ⚠️ SANS RÉSEAU, DÉLIBÉRÉMENT. L'annuaire de l'État est ici un double. Une suite qui appellerait
 * un service public à chaque exécution échouerait le jour d'une panne chez eux, apprendrait à
 * relancer jusqu'au vert, et finirait par ne plus rien prouver. Les règles d'écartement — non
 * diffusible, entrepreneur individuel, établissement fermé — sont éprouvées séparément, sur la
 * forme réelle de leur réponse, dans `packages/capabilities/src/prospects/annuaire.test.ts`.
 */

let sql: PostgresClient;

function annuaireQuiRend(entreprises: readonly EntrepriseTrouvee[]): AnnuaireDEntreprises {
  return { chercher: async () => entreprises };
}

function entreprise(reference: string, nom: string): EntrepriseTrouvee {
  return { reference, nom, secteur: "43.32A", commune: "LILLE", codePostal: "59000" };
}

describe("P0-1 — d'où viennent les entreprises à approcher", () => {
  let tenantId: TenantId;
  let employeeId: EmployeeId;

  beforeAll(async () => {
    const connectionString = process.env["DATABASE_URL"];
    if (connectionString === undefined) throw new Error("DATABASE_URL est requise.");
    sql = createPostgresClient(connectionString);

    tenantId = randomUUID() as TenantId;
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Courtage d'essai"]);

    const [definition] = await sql.query<{ id: string }>(
      "select id from employee_definition order by version desc limit 1",
      [],
    );
    const [identite] = await sql.query<{ id: string }>("select id from reserve_identity($1)", [
      "commercial",
    ]);
    const [employe] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, definition?.id, identite?.id],
    );
    employeeId = employe?.id as EmployeeId;
  });

  afterAll(async () => {
    if (sql !== undefined) {
      await sql.query("delete from tenant where id = $1", [tenantId]);
      await sql.close();
    }
  });

  it("⭐ inscrit les entreprises trouvées, et le travail s'ouvre pour elles", async () => {
    const moteur = new RechercherProspectsCapability(
      annuaireQuiRend([
        entreprise("48250999900023", "MENUISERIES DU NORD"),
        entreprise("48250999900031", "ATELIER DU BOIS"),
      ]),
      new RegistreDeProspectsPostgres(sql),
    );

    const resultat = await moteur.execute({
      tenantId,
      quoi: "menuiserie",
      codePostal: "59000",
      limite: 15,
    });

    expect(resultat).toEqual({ status: "trouve", examinees: 2, ajoutees: 2 });

    // ⚠️ ET ELLES SONT ÉLIGIBLES. C'est le vrai enjeu : une fiche inscrite qui n'ouvre aucune
    // mission ne sert à rien, et c'est exactement ce qui serait arrivé tant que l'éligibilité
    // exigeait une adresse email — que l'annuaire public ne donne jamais.
    const gisement = new GisementDeProspects(sql);
    const eligibles = await gisement.sujetsEligibles({
      tenantId,
      employeeId,
      limite: 50,
      jour: jourUtc(new Date()),
    });
    expect(eligibles).toHaveLength(2);
  });

  it("⭐ ne réinscrit pas la même entreprise à la recherche suivante", async () => {
    // Sans clé de dédoublonnage, chaque battement aurait regonflé la liste du dirigeant des mêmes
    // sociétés. « email » ne pouvait pas jouer ce rôle : il est nul, et Postgres autorise autant
    // de nuls qu'on veut dans une contrainte d'unicité.
    const moteur = new RechercherProspectsCapability(
      annuaireQuiRend([
        entreprise("48250999900023", "MENUISERIES DU NORD"),
        entreprise("48250999900049", "CHARPENTES LILLOISES"),
      ]),
      new RegistreDeProspectsPostgres(sql),
    );

    const resultat = await moteur.execute({ tenantId, quoi: "menuiserie", limite: 15 });

    // Deux examinées, UNE seule ajoutée : la première était déjà connue.
    expect(resultat).toEqual({ status: "trouve", examinees: 2, ajoutees: 1 });

    const [total] = await sql.query<{ n: string }>(
      "select count(*)::text as n from lead where tenant_id = $1",
      [tenantId],
    );
    expect(Number(total?.n)).toBe(3);
  });

  it("dit « rien de nouveau » plutôt que de prétendre avoir trouvé", async () => {
    // Toutes déjà connues n'est pas un échec : c'est le résultat, et il doit se lire comme tel.
    // Annoncer « j'ai trouvé deux entreprises » quand aucune n'est entrée serait un chiffre faux
    // à la première personne — précisément ce que l'invariant 4 du dépôt interdit.
    const moteur = new RechercherProspectsCapability(
      annuaireQuiRend([entreprise("48250999900023", "MENUISERIES DU NORD")]),
      new RegistreDeProspectsPostgres(sql),
    );

    expect(await moteur.execute({ tenantId, quoi: "menuiserie", limite: 15 })).toEqual({
      status: "rien_de_nouveau",
      examinees: 1,
    });
  });

  it("⭐ garde la trace de l'origine, pour l'obligation d'information", async () => {
    // L'article 14 impose de dire au prospect d'où vient sa fiche, dès le premier contact
    // (`docs/10`, § Prospection commerciale). Sans cette trace écrite au moment de la collecte,
    // il faudrait le deviner des mois plus tard.
    const [fiche] = await sql.query<{
      source: string;
      selection_reason: string;
      collected_at: string | null;
      source_detail: Record<string, unknown>;
    }>(
      `select source, selection_reason, collected_at, source_detail
         from lead where tenant_id = $1 and external_ref = '48250999900023'`,
      [tenantId],
    );

    expect(fiche?.source).toBe("annuaire_public");
    expect(fiche?.collected_at).not.toBeNull();
    expect(fiche?.selection_reason).toContain("annuaire public");
    expect(fiche?.source_detail["annuaire"]).toBe("recherche-entreprises.api.gouv.fr");
  });

  it("⭐ n'inscrit aucune donnée personnelle", async () => {
    // L'annuaire rend les dirigeants ; la seule protection qui vaille est de ne pas avoir de
    // colonne où les mettre. Ce test constate qu'aucun nom de personne n'est entré.
    const [fiche] = await sql.query<{ contact_name: string | null; email: string | null }>(
      "select contact_name, email from lead where tenant_id = $1 and source = 'annuaire_public' limit 1",
      [tenantId],
    );

    expect(fiche?.contact_name).toBeNull();
    expect(fiche?.email).toBeNull();
  });
});
