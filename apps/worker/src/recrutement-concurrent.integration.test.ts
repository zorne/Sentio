import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * LADY-W — plusieurs clients recrutent EN MÊME TEMPS, et chacun reçoit LE SIEN.
 *
 * ══ POURQUOI CE TEST EXISTE ══
 *
 * Exigence du fondateur, le 2026-08-27 : *« je ne veux pas qu'il y ait de problème de
 * configuration d'agent même s'il y a plusieurs personnes qui parlent à Lady en même temps […]
 * si un client parle à Lady lors de l'achat, c'est bien et seulement son agent à lui, et pas
 * l'agent d'un autre individu qui va lui être envoyé en mail. »*
 *
 * C'est la classe de défaut la plus grave que ce produit puisse avoir, et la plus difficile à
 * voir : elle ne se manifeste jamais quand on essaie seul. Une relecture ne la trouve pas, un
 * test séquentiel non plus. Il faut vraiment lancer plusieurs recrutements à la même seconde,
 * sur un vrai Postgres, et regarder ce qui est sorti.
 *
 * ══ CE QUI POURRAIT MAL TOURNER, ET QUE CHAQUE ASSERTION SURVEILLE ══
 *
 *   · deux entreprises se partagent une identité, donc deux clients reçoivent « Julie » ;
 *   · un employé se retrouve rattaché à l'entreprise du voisin ;
 *   · l'attente de rattachement d'une adresse pointe vers l'entreprise d'une autre ;
 *   · deux connexions simultanées se disputent la même attente, et une entreprise payée
 *     n'est rattachée à personne.
 *
 * ⚠️ CE TEST N'EST PAS UN TEST DE PERFORMANCE. Le parallélisme n'est pas là pour mesurer une
 * vitesse : il est là parce que la faute qu'on cherche N'EXISTE QUE dans le parallélisme.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

/** Assez pour que les transactions se chevauchent réellement, assez peu pour rester rapide. */
const SIMULTANES = 8;

describeIfDatabase("LADY-W — plusieurs recrutements simultanés, chacun le sien", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];
  const utilisateurs: string[] = [];

  beforeAll(() => {
    sql = createPostgresClient(connectionString as string, { maxConnections: SIMULTANES + 2 });
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await sql.withTransaction(async (tx) => {
        await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
        await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
        await tx.query("delete from tenant where id = $1", [tenantId]);
      });
    }
    for (const userId of utilisateurs) {
      await sql.query("delete from auth.users where id = $1", [userId]);
    }
    await sql.close();
  });

  /** Un candidat au recrutement : son diagnostic, sa recommandation, son adresse, son entreprise. */
  interface Candidat {
    readonly email: string;
    readonly entreprise: string;
    readonly recommandation: string;
  }

  async function preparerUnCandidat(rang: number): Promise<Candidat> {
    const marque = randomUUID().slice(0, 8);
    const email = `client-${rang}-${marque}@essai.test`;
    const entreprise = `Entreprise ${rang} ${marque}`;

    const [session] = await sql.query<{ id: string }>(
      `insert into diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
       values ($1, jsonb_build_object(
                 'sector', 'menuiserie',
                 'objective', jsonb_build_object('metric', 'rendez_vous_qualifies',
                                                 'target', $2::numeric, 'horizon', 'ce mois')),
               'aucune_relance')
       returning id`,
      [`concurrent-${marque}`, 10 + rang],
    );

    const [reco] = await sql.query<{ id: string }>(
      `insert into recommendation (diagnostic_session_id, status, justification, configuration_proposee)
       values ($1, 'proposed', $2, $3::jsonb)
       returning id`,
      [
        session!.id,
        `Recommandation du candidat ${rang}.`,
        JSON.stringify({
          role: "prospection",
          capacites: ["relancer.prospect", "qualifier.prospect"],
          priorites: [`priorité propre au candidat ${rang}`],
          autonomie: "confirm",
        }),
      ],
    );

    return { email, entreprise, recommandation: reco!.id };
  }

  it("⭐⭐ huit recrutements à la même seconde : huit entreprises, huit employées, huit identités", async () => {
    const candidats = await Promise.all(
      Array.from({ length: SIMULTANES }, (_, rang) => preparerUnCandidat(rang)),
    );

    // ⚠️ LE CŒUR DU TEST. `Promise.all` lance les huit `recruter()` sans attendre les précédents :
    // les transactions se chevauchent, et c'est exactement la situation qu'on veut éprouver.
    const resultats = await Promise.all(
      candidats.map((candidat) =>
        sql.query<{ tenant_id: string; employee_id: string }>(
          `select tenant_id, employee_id from recruter($1, $2, 'start', $3, $4)`,
          [candidat.recommandation, candidat.entreprise, `invitation:${randomUUID()}`, candidat.email],
        ),
      ),
    );

    const obtenus = resultats.map((lignes) => lignes[0]!);
    tenants.push(...obtenus.map((r) => r.tenant_id));

    // Huit entreprises distinctes, huit employées distinctes.
    expect(new Set(obtenus.map((r) => r.tenant_id)).size).toBe(SIMULTANES);
    expect(new Set(obtenus.map((r) => r.employee_id)).size).toBe(SIMULTANES);

    // ⭐ Huit IDENTITÉS distinctes. C'est `reserve_identity` et son `for update skip locked` qui
    // le tiennent : sans lui, deux clients recevraient le même prénom, et « votre employée
    // Julie » désignerait deux personnes différentes chez deux entreprises différentes.
    const [identites] = await sql.query<{ n: string }>(
      `select count(distinct e.identity_id) as n from employee e where e.tenant_id = any($1::uuid[])`,
      [tenants],
    );
    expect(Number(identites?.n)).toBe(SIMULTANES);

    // ⭐⭐ Et surtout : chaque employée appartient à l'entreprise de SON candidat, avec la
    // configuration de SON diagnostic. C'est la question du fondateur, posée à la base.
    for (let rang = 0; rang < SIMULTANES; rang += 1) {
      const attendu = obtenus[rang]!;
      const candidat = candidats[rang]!;

      const [ligne] = await sql.query<{
        nom: string;
        employee_id: string;
        priorite: string;
      }>(
        `select t.name as nom,
                e.id   as employee_id,
                c.priorites->>0 as priorite
           from tenant t
           join employee e on e.tenant_id = t.id
           join lady_configuration c on c.tenant_id = t.id and c.active
          where t.id = $1`,
        [attendu.tenant_id],
      );

      expect(ligne?.nom).toBe(candidat.entreprise);
      expect(ligne?.employee_id).toBe(attendu.employee_id);
      expect(ligne?.priorite).toBe(`priorité propre au candidat ${rang}`);
    }
  });

  it("⭐⭐ l'attente de chaque adresse désigne SON entreprise, jamais celle d'une autre", async () => {
    const candidats = await Promise.all(
      Array.from({ length: SIMULTANES }, (_, rang) => preparerUnCandidat(100 + rang)),
    );

    const resultats = await Promise.all(
      candidats.map((candidat) =>
        sql.query<{ tenant_id: string }>(
          `select tenant_id from recruter($1, $2, 'start', $3, $4)`,
          [candidat.recommandation, candidat.entreprise, `invitation:${randomUUID()}`, candidat.email],
        ),
      ),
    );
    const parEmail = new Map(
      candidats.map((candidat, rang) => [candidat.email, resultats[rang]![0]!.tenant_id]),
    );
    tenants.push(...parEmail.values());

    for (const [email, tenantId] of parEmail) {
      const [attente] = await sql.query<{ tenant_id: string; n: string }>(
        `select tenant_id, count(*) over () as n
           from rattachement_attendu where email = $1 and consomme_le is null`,
        [email],
      );
      // Une seule attente par adresse, et elle pointe vers l'entreprise de cette adresse.
      expect(Number(attente?.n)).toBe(1);
      expect(attente?.tenant_id).toBe(tenantId);
    }

    // ⭐⭐ Huit connexions simultanées : chacun n'entre que chez lui.
    //
    // C'est la dernière marche, et la seule qui prouve ce que le client vit. Tout le reste
    // pourrait être juste et cette étape suffirait à envoyer un dirigeant chez son voisin.
    const comptes = await Promise.all(
      [...parEmail.keys()].map(async (email) => {
        const userId = randomUUID();
        await sql.query("insert into auth.users (id) values ($1)", [userId]);
        utilisateurs.push(userId);
        return { userId, email };
      }),
    );

    await Promise.all(
      comptes.map((compte) =>
        sql.query("select rattacher_par_email($1, $2)", [compte.userId, compte.email]),
      ),
    );

    for (const compte of comptes) {
      const appartenances = await sql.query<{ tenant_id: string }>(
        "select tenant_id from tenant_member where user_id = $1",
        [compte.userId],
      );

      // Une appartenance, et une seule : celle de son entreprise.
      expect(appartenances).toHaveLength(1);
      expect(appartenances[0]?.tenant_id).toBe(parEmail.get(compte.email));
    }
  });

  it("⭐ deux arrivées simultanées de LA MÊME personne ne laissent aucune entreprise orpheline", async () => {
    // Le cas du fondateur : deux invitations envoyées à la même adresse. Sans verrou sur
    // l'attente, les deux connexions lisaient la même ligne, rattachaient la même entreprise,
    // et la seconde restait sans propriétaire (`20260815120037`).
    const marque = randomUUID().slice(0, 8);
    const email = `double-${marque}@essai.test`;

    const deux = await Promise.all(
      [0, 1].map(async (rang) => {
        const candidat = await preparerUnCandidat(200 + rang);
        const [ligne] = await sql.query<{ tenant_id: string }>(
          `select tenant_id from recruter($1, $2, 'start', $3, $4)`,
          [candidat.recommandation, `Double ${rang} ${marque}`, `invitation:${randomUUID()}`, email],
        );
        return ligne!.tenant_id;
      }),
    );
    tenants.push(...deux);

    const userId = randomUUID();
    await sql.query("insert into auth.users (id) values ($1)", [userId]);
    utilisateurs.push(userId);

    // Deux connexions à la même seconde, la même adresse.
    await Promise.all(
      [0, 1].map(() => sql.query("select rattacher_par_email($1, $2)", [userId, email])),
    );

    const appartenances = await sql.query<{ tenant_id: string }>(
      "select tenant_id from tenant_member where user_id = $1 and tenant_id = any($2::uuid[])",
      [userId, deux],
    );

    // Les DEUX entreprises lui reviennent : aucune ne reste sans propriétaire.
    expect(new Set(appartenances.map((a) => a.tenant_id))).toEqual(new Set(deux));
  });
});
