import { randomUUID } from "node:crypto";

import type { PasDuBattement } from "@sentio/core";
import type { EmployeeId, TenantId } from "@sentio/domain";
import { compterLeTravailQuiNAboutitPas } from "@sentio/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresClient, type PostgresClient } from "./adapters/postgres-node.js";

/**
 * Le compteur — « du travail se fait-il ? », et à qui le dire.
 *
 * ══ CE QUE CE FICHIER GARDE ══
 *
 * Le défaut qui a justifié tout le lot : `{traites:10, echoues:0}` avec dix missions reportées, en
 * production, comme comportement nominal. Le cron n'a pas été armé, sans quoi ce rapport serait
 * parti 144 fois par jour pendant que rien ne se faisait.
 *
 * Deux bords à tenir, et le second est le plus facile à perdre :
 *
 *   · **ne pas se taire** quand rien n'aboutit plusieurs jours de suite ;
 *   · **ne pas déranger le dirigeant** pour ce qu'il ne peut pas réparer. Un moteur non monté est
 *     un défaut produit ; le lui envoyer lui apprendrait que ce canal ne le concerne pas, et
 *     l'alerte suivante — celle qui le concerne — ne serait plus lue.
 */

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

let compteurUnique = Math.floor(Math.random() * 1_000_000);
const versionUnique = (): number => (compteurUnique = (compteurUnique + 1) % 2_000_000_000);

/** Trois jours consécutifs. Le compteur compte des JOURS, jamais des battements. */
const LUNDI = new Date("2026-09-07T06:00:00.000Z");
const MARDI = new Date("2026-09-08T06:00:00.000Z");
const MERCREDI = new Date("2026-09-09T06:00:00.000Z");
const JEUDI = new Date("2026-09-10T06:00:00.000Z");

describeIfDatabase("Le compteur, et à qui il parle", () => {
  let sql: PostgresClient;
  const tenants: string[] = [];

  beforeAll(() => {
    sql = createPostgresClient(connectionString as string);
  });

  afterAll(async () => {
    for (const tenantId of tenants) {
      await sql.withTransaction(async (tx) => {
        await tx.query("select set_config('sentio.retention_purge', 'on', true)", []);
        await tx.query("delete from execution_event where tenant_id = $1", [tenantId]);
        await tx.query("delete from tenant where id = $1", [tenantId]);
      });
    }
    await sql.close();
  });

  /**
   * Une entreprise avec son employée, dans l'état exact du produit.
   *
   * `capacites` est ce que le noyau rend concevable ; `activee` ce que le dirigeant a réellement
   * activé. C'est l'écart entre les deux qui donne « il vous manque tel outil ».
   */
  async function entreprise(options: {
    capacites: readonly string[];
    activee: string | null;
  }): Promise<{ tenantId: TenantId; employeeId: EmployeeId; prenom: string }> {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql.query("insert into tenant (id, name) values ($1, $2)", [tenantId, "Muette SARL"]);
    await sql.query(
      `insert into subscription (tenant_id, plan_id, status, current_period_start, current_period_end)
       select $1, p.id, 'active', now() - interval '1 day', now() + interval '29 days'
         from plan p where p.tier = 'start'`,
      [tenantId],
    );
    const [def] = await sql.query<{ id: string }>(
      `insert into employee_definition (gisement, version, dna, capacites)
       values ('commercial', $1, '{}'::jsonb, $2::jsonb) returning id`,
      [versionUnique(), JSON.stringify(options.capacites)],
    );
    const [identite] = await sql.query<{ id: string; first_name: string }>(
      "select * from reserve_identity($1)",
      ["commercial"],
    );
    const [employe] = await sql.query<{ id: string }>(
      `insert into employee (tenant_id, employee_definition_id, identity_id)
       values ($1, $2, $3) returning id`,
      [tenantId, def?.id, identite?.id],
    );

    if (options.activee !== null) {
      await sql.query(
        `insert into employee_capability (tenant_id, employee_id, capability_id, enabled)
         select $1, $2, c.id, true from capability c where c.key = $3`,
        [tenantId, employe?.id, options.activee],
      );
    }

    return {
      tenantId: tenantId as TenantId,
      employeeId: employe?.id as EmployeeId,
      prenom: identite?.first_name as string,
    };
  }

  function bloquee(
    qui: { tenantId: TenantId; employeeId: EmployeeId },
    manque: PasDuBattement["manque"],
  ): PasDuBattement {
    return {
      tenantId: qui.tenantId,
      employeeId: qui.employeeId,
      motif: "capacite_absente",
      manque,
    };
  }

  const NON_ACTIVEE = { cause: "capacite_non_activee", sujetKind: "lead" } as const;
  const MOTEUR_ABSENT = { cause: "moteur_non_monte", sujetKind: null } as const;

  async function battement(pas: readonly PasDuBattement[], maintenant: Date) {
    return compterLeTravailQuiNAboutitPas({ sql }, { pas, maintenant });
  }

  async function notifications(tenantId: TenantId) {
    return sql.query<{ message: string; kind: string }>(
      "select kind, message from notification where tenant_id = $1 order by created_at",
      [tenantId],
    );
  }

  it("⭐ le dirigeant est prévenu au seuil, et pas avant", async () => {
    // Le noyau de son employée conçoit d'écrire aux prospects, sa formule le sert, et il ne l'a
    // pas activé : c'est exactement le blocage qu'il peut lever lui-même.
    const qui = await entreprise({ capacites: ["envoyer.prospect"], activee: null });

    const lundi = await battement([bloquee(qui, NON_ACTIVEE)], LUNDI);
    expect(lundi.muets).toBe(1);
    expect(lundi.prevenus).toBe(0);

    await battement([bloquee(qui, NON_ACTIVEE)], MARDI);
    expect(await notifications(qui.tenantId)).toHaveLength(0);

    const mercredi = await battement([bloquee(qui, NON_ACTIVEE)], MERCREDI);
    expect(mercredi.prevenus).toBe(1);
    expect(mercredi.aNotreCharge).toBe(0);

    const [message] = await notifications(qui.tenantId);
    expect(message?.kind).toBe("travail");
    // Il doit y lire QUOI activer, pas seulement que quelque chose ne va pas.
    expect(message?.message).toContain("Écrire à un prospect");
    expect(message?.message).toContain(qui.prenom);
  });

  it("⭐ on ne prévient pas deux fois de la même série", async () => {
    // Une alerte qui se répète devient un bruit, et il finit par ne plus la lire.
    const qui = await entreprise({ capacites: ["envoyer.prospect"], activee: null });

    for (const jour of [LUNDI, MARDI, MERCREDI]) {
      await battement([bloquee(qui, NON_ACTIVEE)], jour);
    }
    const jeudi = await battement([bloquee(qui, NON_ACTIVEE)], JEUDI);

    expect(jeudi.prevenus).toBe(0);
    expect(await notifications(qui.tenantId)).toHaveLength(1);
  });

  it("⭐ un moteur non monté ne dérange JAMAIS le dirigeant", async () => {
    // Même motif, même mise de côté, même reprise — et l'inverse à l'alerte. Le monter est un
    // déploiement : lui demander de l'activer l'enverrait chercher un bouton qui n'existe pas.
    const qui = await entreprise({
      capacites: ["qualifier.prospect"],
      activee: "qualifier.prospect",
    });

    let dernier = await battement([bloquee(qui, MOTEUR_ABSENT)], LUNDI);
    for (const jour of [MARDI, MERCREDI]) {
      dernier = await battement([bloquee(qui, MOTEUR_ABSENT)], jour);
    }

    expect(dernier.prevenus).toBe(0);
    // Silencieux pour lui, mais pas silencieux : c'est notre canal qui doit sonner.
    expect(dernier.aNotreCharge).toBe(1);
    expect(await notifications(qui.tenantId)).toHaveLength(0);
  });

  it("⭐ rien à activer ⇒ le manque revient chez nous, quoi qu'en dise la cause", async () => {
    // La cause dit « capacité non activée », mais le dirigeant a déjà tout activé de ce que son
    // noyau conçoit. Lui écrire « activez un outil » l'enverrait chercher quoi. Le noyau ne
    // pouvait pas le savoir : c'est cette lecture, faite au moment de parler, qui tranche.
    const qui = await entreprise({
      capacites: ["qualifier.prospect"],
      activee: "qualifier.prospect",
    });

    let dernier = await battement([bloquee(qui, NON_ACTIVEE)], LUNDI);
    for (const jour of [MARDI, MERCREDI]) {
      dernier = await battement([bloquee(qui, NON_ACTIVEE)], jour);
    }

    expect(dernier.prevenus).toBe(0);
    expect(dernier.aNotreCharge).toBe(1);
    expect(await notifications(qui.tenantId)).toHaveLength(0);
  });

  it("⭐ le compteur compte des JOURS, pas des battements", async () => {
    // Le battement passe toutes les dix minutes : compter les passages franchirait un seuil de
    // trois en une demi-heure, sur une panne qui se résout avant midi.
    const qui = await entreprise({ capacites: ["envoyer.prospect"], activee: null });

    for (let i = 0; i < 6; i += 1) {
      const memeJour = new Date(LUNDI.getTime() + i * 10 * 60 * 1000);
      const rapport = await battement([bloquee(qui, NON_ACTIVEE)], memeJour);
      expect(rapport.prevenus).toBe(0);
    }

    const [ligne] = await sql.query<{ cycles: number }>(
      "select cycles from travail_muet where tenant_id = $1",
      [qui.tenantId],
    );
    expect(ligne?.cycles).toBe(1);
  });

  it("⭐ un cycle qui aboutit referme la série", async () => {
    // Sans cette remise à zéro, une entreprise prévenue une fois resterait marquée pour toujours,
    // et la deuxième panne — la vraie — ne dirait plus rien.
    const qui = await entreprise({ capacites: ["envoyer.prospect"], activee: null });

    await battement([bloquee(qui, NON_ACTIVEE)], LUNDI);
    await battement([bloquee(qui, NON_ACTIVEE)], MARDI);

    const reprise = await battement(
      [{ tenantId: qui.tenantId, employeeId: qui.employeeId, motif: "travail_acheve", manque: null }],
      MERCREDI,
    );
    expect(reprise.remisAZero).toBe(1);
    expect(
      await sql.query("select 1 from travail_muet where tenant_id = $1", [qui.tenantId]),
    ).toHaveLength(0);

    // Et le compte repart de zéro : le jeudi ne prévient personne.
    const jeudi = await battement([bloquee(qui, NON_ACTIVEE)], JEUDI);
    expect(jeudi.prevenus).toBe(0);
  });

  it("le seuil est une donnée, desserrable entreprise par entreprise", async () => {
    // Un client au cycle lent se règle sans redéploiement. C'est la règle de `garde_du_silence`,
    // et c'est la même ici.
    const qui = await entreprise({ capacites: ["envoyer.prospect"], activee: null });
    await sql.query(
      "insert into garde_du_travail (tenant_id, cycles_toleres) values ($1, 1)",
      [qui.tenantId],
    );

    const lundi = await battement([bloquee(qui, NON_ACTIVEE)], LUNDI);
    expect(lundi.prevenus).toBe(1);
  });

  it("une employée qui travaille n'est jamais comptée muette", async () => {
    const qui = await entreprise({ capacites: ["envoyer.prospect"], activee: null });

    const rapport = await battement(
      [
        bloquee(qui, NON_ACTIVEE),
        { tenantId: qui.tenantId, employeeId: qui.employeeId, motif: "pas_suivant", manque: null },
      ],
      LUNDI,
    );

    expect(rapport.muets).toBe(0);
    expect(await sql.query("select 1 from travail_muet where tenant_id = $1", [qui.tenantId])).toHaveLength(0);
  });
});
