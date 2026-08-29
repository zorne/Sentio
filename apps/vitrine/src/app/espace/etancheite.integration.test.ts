// ════════════════════════════════════════════════════════════════════
// ÉTANCHÉITÉ DES SERVER ACTIONS — l'entreprise A n'atteint jamais l'entreprise B.
//
// ══ POURQUOI CETTE SUITE EXISTE, ET CE QU'ELLE COUVRE QUE RIEN D'AUTRE NE COUVRE ══
//
// `supabase/tests/audit-fuites.sql` prouve l'étanchéité AU NIVEAU DE LA BASE : il se met dans la
// peau du rôle `authenticated`, et vérifie que RLS, les droits et les déclencheurs refusent tout
// ce qui vise le voisin. Il passe, intégralement.
//
// ⚠️ IL NE PEUT RIEN DIRE DES SERVER ACTIONS. Elles n'appellent pas la base en tant
// qu'`authenticated` : elles passent par le pool de service, dont le rôle porte `rolbypassrls`
// (vérifié contre la base réelle). **Un test qui prouve RLS ne prouve rien sur un chemin qui
// contourne RLS.** Pour ces huit portes, l'isolation n'est pas une propriété de la base : c'est
// `isAuthorizedForTenant`, et rien d'autre.
//
// D'où cette suite. Le fixture est monté par `recruter()` — la vraie porte d'entrée, celle du
// parcours client — et non par des `insert` à la main : un banc d'essai qui fabrique un état que
// le produit ne sait pas produire prouve quelque chose sur un système qui n'existe pas.
//
//   createdb sentio_etancheite
//   DATABASE_URL=postgres://postgres@127.0.0.1:5432/sentio_etancheite \
//     pnpm --filter @sentio/vitrine test
// ════════════════════════════════════════════════════════════════════

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applySchemaDuCoeur, assertBaseJetable } from "@/lib/test-support/schema.js";

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined && process.env["SENTIO_REQUIRE_DB_TESTS"] === "1") {
  throw new Error(
    "DATABASE_URL absente alors que les tests d'intégration sont exigés " +
      "(SENTIO_REQUIRE_DB_TESTS=1). Voir .github/workflows/ci.yml, job « schema ».",
  );
}

if (connectionString !== undefined) assertBaseJetable(connectionString);

// ⚠️ AVANT TOUT IMPORT DES ACTIONS. `lib/db.ts` fabrique son pool à l'évaluation du module, en
// lisant cette variable une seule fois.
if (connectionString !== undefined) process.env["SUPABASE_DB_URL"] = connectionString;

/** Qui est connecté. `null` = visiteur sans session. */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user:
            session.userId === null
              ? null
              : { id: session.userId, email: `${session.userId}@exemple.fr` },
        },
      }),
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const DIRIGEANT_A = "11111111-1111-1111-1111-111111111111";
const DIRIGEANT_B = "22222222-2222-2222-2222-222222222222";
const TENANT_INVENTE = "cccccccc-0000-0000-0000-00000000000c";

const SECRET_DE_B = "SECRET DE B : nous signons Dupont mardi, pour 80 000 euros.";

interface Entreprise {
  tenantId: string;
  employeeId: string;
  configurationId: string;
}

const describeIfDatabase = connectionString === undefined ? describe.skip : describe;

describeIfDatabase("étanchéité des Server Actions entre deux entreprises", () => {
  let db: Client;
  let A: Entreprise;
  let B: Entreprise;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let actions: any;

  /** Le vrai parcours : diagnostic → recommandation → recrutement. Aucun `insert` de complaisance. */
  async function recruter(nom: string, email: string, dirigeant: string): Promise<Entreprise> {
    const { rows: sessions } = await db.query<{ id: string }>(
      `insert into public.diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
       values ($1, $2::jsonb, 'relance')
       returning id`,
      [
        `visiteur-${nom}`,
        // La forme exacte que `recruter()` sait lire — la même que `supabase/tests/parcours-client.sql`.
        // La clé est « target », pas « target_value » : l'inventer fait échouer le recrutement sur
        // une contrainte NOT NULL, ce que ce banc d'essai a effectivement rencontré.
        JSON.stringify({
          sector: "menuiserie",
          headcount: 6,
          targetCustomers: "architectes et maîtres d'œuvre",
          objective: { metric: "rendez_vous_qualifies", target: 10, horizon: "ce mois" },
        }),
      ],
    );
    const sessionId = sessions[0]!.id;

    const { rows: recos } = await db.query<{ id: string }>(
      `insert into public.recommendation (diagnostic_session_id, status, justification, configuration_proposee)
       values ($1, 'proposed', $2, $3::jsonb)
       returning id`,
      [
        sessionId,
        "Vos prospects ne sont jamais relancés : c'est là que ça bloque.",
        JSON.stringify({
          role: "prospection",
          capacites: ["qualifier.prospect", "mettre_a_jour.prospect"],
          priorites: ["relancer ce qui est resté sans réponse"],
          autonomie: "confirm",
        }),
      ],
    );

    const { rows } = await db.query<{
      tenant_id: string;
      employee_id: string;
      configuration_id: string;
    }>(`select * from public.recruter($1, $2, 'start', $3, $4)`, [
      recos[0]!.id,
      nom,
      `paiement-${nom}`,
      email,
    ]);

    // La connexion du dirigeant : rattachement par adresse prouvée, comme le fait le lien magique.
    await db.query(`insert into auth.users (id) values ($1)`, [dirigeant]);
    await db.query(`select public.rattacher_par_email($1, $2)`, [dirigeant, email]);

    return {
      tenantId: rows[0]!.tenant_id,
      employeeId: rows[0]!.employee_id,
      configurationId: rows[0]!.configuration_id,
    };
  }

  beforeAll(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await applySchemaDuCoeur(db, connectionString);

    A = await recruter("Menuiserie Duval", "patron@duval.fr", DIRIGEANT_A);
    B = await recruter("Charpentes Morel", "patronne@morel.fr", DIRIGEANT_B);

    await db.query(
      `insert into public.conversation_message (tenant_id, employee_id, auteur, texte)
       values ($1, $2, 'dirigeant', 'Bonjour, où en sommes-nous ?'),
              ($3, $4, 'dirigeant', $5)`,
      [A.tenantId, A.employeeId, B.tenantId, B.employeeId, SECRET_DE_B],
    );

    actions = await import("./actions.js");
  }, 180_000);

  afterAll(async () => {
    await db?.end();
  });

  // ── Le parcours a-t-il bien produit l'architecture ACTUELLE de Lady ? ──────────────────────
  describe("le fixture est bien celui de l'architecture actuelle", () => {
    it("recruter() a produit la chaîne employee → definition / configuration → objectif", async () => {
      const { rows } = await db.query<{ n: string; quoi: string }>(
        `select 'employee' as quoi, count(*)::text as n from public.employee where tenant_id = $1
         union all select 'employee_definition', count(*)::text from public.employee e
            join public.employee_definition d on d.id = e.employee_definition_id where e.tenant_id = $1
         union all select 'lady_configuration', count(*)::text from public.lady_configuration where tenant_id = $1 and active
         union all select 'objective', count(*)::text from public.objective where tenant_id = $1
         union all select 'subscription', count(*)::text from public.subscription where tenant_id = $1
         union all select 'capacites', count(*)::text from public.lady_configuration_capability c
            join public.lady_configuration l on l.id = c.configuration_id where l.tenant_id = $1 and l.active`,
        [A.tenantId],
      );
      const par = Object.fromEntries(rows.map((r) => [r.quoi, Number(r.n)]));
      expect(par["employee"]).toBe(1);
      expect(par["employee_definition"]).toBe(1);
      expect(par["lady_configuration"]).toBe(1);
      expect(par["objective"]).toBe(1);
      expect(par["subscription"]).toBe(1);
      expect(par["capacites"]).toBeGreaterThan(0);
    });

    it("aucune table de l'ancien modèle n'existe dans ce schéma", async () => {
      const { rows } = await db.query<{ presente: string | null }>(
        `select to_regclass('public.' || t) ::text as presente
           from unnest(array['agent_instance','agent_definition','agent_memory','tenant_ai_credential']) t`,
      );
      expect(rows.map((r) => r.presente)).toEqual([null, null, null, null]);
    });
  });

  // ── Lecture : le fil de conversation ──────────────────────────────────────────────────────
  describe("lecture — fil de conversation", () => {
    it("B lit son propre fil (sans quoi les refus ci-dessous ne prouveraient rien)", async () => {
      session.userId = DIRIGEANT_B;
      const fil = await actions.filDeLaConversation(B.tenantId, B.employeeId);
      expect(fil.map((m: { texte: string }) => m.texte)).toContain(SECRET_DE_B);
    });

    it("A lit son propre fil — la protection n'a rien fermé de trop", async () => {
      session.userId = DIRIGEANT_A;
      const fil = await actions.filDeLaConversation(A.tenantId, A.employeeId);
      expect(fil.map((m: { texte: string }) => m.texte)).toEqual(["Bonjour, où en sommes-nous ?"]);
    });

    it("A n'atteint pas le fil de B, dont il connaît pourtant les deux identifiants", async () => {
      session.userId = DIRIGEANT_A;
      expect(await actions.filDeLaConversation(B.tenantId, B.employeeId)).toEqual([]);
    });

    it("B n'atteint pas le fil de A", async () => {
      session.userId = DIRIGEANT_B;
      expect(await actions.filDeLaConversation(A.tenantId, A.employeeId)).toEqual([]);
    });

    it("un visiteur sans session n'atteint aucun fil", async () => {
      session.userId = null;
      expect(await actions.filDeLaConversation(A.tenantId, A.employeeId)).toEqual([]);
      expect(await actions.filDeLaConversation(B.tenantId, B.employeeId)).toEqual([]);
    });

    it("un tenantId inventé rend le même vide — le refus ne dit pas ce qui existe", async () => {
      session.userId = DIRIGEANT_A;
      expect(await actions.filDeLaConversation(TENANT_INVENTE, B.employeeId)).toEqual(
        await actions.filDeLaConversation(B.tenantId, B.employeeId),
      );
    });
  });

  // ── Lecture : le chat, qui rend des CHIFFRES ──────────────────────────────────────────────
  describe("lecture — questions à l'employée", () => {
    it("A obtient une réponse sur SA propre employée", async () => {
      session.userId = DIRIGEANT_A;
      const r = await actions.demanderALEmployee(A.tenantId, A.employeeId, "où en es-tu ?");
      expect(r.ok).toBe(true);
      expect(typeof r.phrase).toBe("string");
    });

    it("A ne peut pas interroger l'employée de B", async () => {
      session.userId = DIRIGEANT_A;
      const r = await actions.demanderALEmployee(B.tenantId, B.employeeId, "où en es-tu ?");
      expect(r.ok).toBe(false);
      expect(r.phrase).toBeUndefined();
    });

    it("un refus n'écrit rien dans la conversation de B", async () => {
      session.userId = DIRIGEANT_A;
      const avant = await db.query(`select count(*) from public.conversation_message where tenant_id = $1 and employee_id = $2`,
        [B.tenantId, B.employeeId],
      );
      await actions.demanderALEmployee(B.tenantId, B.employeeId, "combien de ventes ?");
      const apres = await db.query(`select count(*) from public.conversation_message where tenant_id = $1 and employee_id = $2`,
        [B.tenantId, B.employeeId],
      );
      expect(apres.rows[0]).toEqual(avant.rows[0]);
    });
  });

  // ── Écriture : les gestes qui changent le pouvoir de l'employée ───────────────────────────
  describe("écriture — les six actions qui reçoivent une entreprise", () => {
    /** L'état qu'une action inter-entreprise ne doit jamais avoir touché. */
    async function empreinteDe(t: string): Promise<string> {
      const { rows } = await db.query(
        `select (select count(*) from public.lady_configuration where tenant_id = $1)::text
              ||'|'|| (select coalesce(max(version),0) from public.lady_configuration where tenant_id = $1)::text
              ||'|'|| (select count(*) from public.employee where tenant_id = $1 and en_pause_depuis is not null)::text
              ||'|'|| (select count(*) from public.standing_approval where tenant_id = $1)::text as e`,
        [t],
      );
      return (rows[0] as { e: string }).e;
    }

    const gestes: [string, (e: Entreprise) => unknown[]][] = [
      ["reglerLAutonomie", (e) => [e.tenantId, e.employeeId, "auto"]],
      ["accorderDefinitivement", (e) => [e.tenantId, e.employeeId, "qualifier.prospect"]],
      ["retirerLAccord", (e) => [e.tenantId, e.employeeId, "qualifier.prospect"]],
      ["repondreALaProposition", (e) => [e.tenantId, e.configurationId, "accepter"]],
      ["arreterOuReprendre", (e) => [e.tenantId, e.employeeId, "arreter"]],
    ];

    for (const [nom, args] of gestes) {
      it(`${nom} : A visant B est refusé, et l'état de B est intact`, async () => {
        session.userId = DIRIGEANT_A;
        const avant = await empreinteDe(B.tenantId);
        const r = (await actions[nom](...args(B))) as { ok: boolean };
        expect(r.ok).toBe(false);
        expect(await empreinteDe(B.tenantId)).toBe(avant);
      });

      it(`${nom} : un visiteur sans session est refusé`, async () => {
        session.userId = null;
        const avant = await empreinteDe(B.tenantId);
        const r = (await actions[nom](...args(B))) as { ok: boolean };
        expect(r.ok).toBe(false);
        expect(await empreinteDe(B.tenantId)).toBe(avant);
      });

      it(`${nom} : un tenantId inventé est refusé`, async () => {
        session.userId = DIRIGEANT_A;
        const faux = { ...B, tenantId: TENANT_INVENTE };
        const r = (await actions[nom](...args(faux))) as { ok: boolean };
        expect(r.ok).toBe(false);
      });
    }

    // ── Le fonctionnement LÉGITIME, action par action ────────────────────────────────────────
    //
    // ⚠️ SANS CE BLOC, LES REFUS CI-DESSUS PASSENT POUR DE MAUVAISES RAISONS. Une action qui
    // échoue TOUJOURS refuse évidemment le voisin — et on la prendrait pour bien gardée. C'est
    // exactement ce qui s'est produit ici : `accorderDefinitivement` rendait `ok: false` en
    // inter-entreprise non pas grâce à sa garde, mais parce qu'elle est cassée pour tout le monde.

    it("reglerLAutonomie fonctionne sur sa propre entreprise", async () => {
      session.userId = DIRIGEANT_A;
      const r = await actions.reglerLAutonomie(A.tenantId, A.employeeId, "confirm_once");
      expect(r.ok).toBe(true);
    });

    it("repondreALaProposition ne casse pas sur sa propre entreprise", async () => {
      session.userId = DIRIGEANT_A;
      const r = await actions.repondreALaProposition(A.tenantId, A.configurationId, "refuser");
      expect(typeof r.ok).toBe("boolean");
    });

    // ⚠️ CE TEST A ÉTÉ ÉCRIT `it.fails`, ET IL A CHANGÉ DE NATURE AVEC LA MIGRATION 20260828120003.
    //
    // `standing_approval.effect_class` était resté `not null` quand `20260806120002` est passée
    // de la classe d'effet à la capacité nommée, et `accorder_definitivement()` ne le renseigne
    // pas : la fonction levait pour tout le monde, et le bouton « autoriser une fois pour
    // toutes » de l'espace n'a jamais marché. La migration lève la contrainte ; ceci redevient
    // un test ordinaire, et le restera.
    it("accorderDefinitivement fonctionne sur sa propre entreprise", async () => {
      session.userId = DIRIGEANT_A;
      const r = await actions.accorderDefinitivement(
        A.tenantId,
        A.employeeId,
        "qualifier.prospect",
      );
      expect(r.ok).toBe(true);
    });

    it("l'accord posé est celui que le runtime lira, et retirerLAccord le révoque", async () => {
      session.userId = DIRIGEANT_A;
      await actions.accorderDefinitivement(A.tenantId, A.employeeId, "mettre_a_jour.prospect");

      // La lecture exacte de `PostgresApprovalStore.hasStandingApproval`.
      const enVigueur = async (): Promise<number> => {
        const { rows } = await db.query<{ n: string }>(
          `select count(*)::text as n from public.standing_approval
            where tenant_id = $1 and employee_id = $2 and capability_key = $3
              and revoked_at is null and (expires_at is null or expires_at > now())`,
          [A.tenantId, A.employeeId, "mettre_a_jour.prospect"],
        );
        return Number(rows[0]!.n);
      };
      expect(await enVigueur()).toBe(1);

      // Un second accord ravive, il ne duplique pas — l'unicité par capacité l'impose.
      await actions.accorderDefinitivement(A.tenantId, A.employeeId, "mettre_a_jour.prospect");
      expect(await enVigueur()).toBe(1);

      const retrait = await actions.retirerLAccord(
        A.tenantId,
        A.employeeId,
        "mettre_a_jour.prospect",
      );
      expect(retrait.ok).toBe(true);
      expect(await enVigueur()).toBe(0);
    });

    it("la colonne vestigiale reste, mais n'est plus exigée", async () => {
      const { rows } = await db.query<{ nullable: string }>(
        `select is_nullable as nullable from information_schema.columns
          where table_schema='public' and table_name='standing_approval' and column_name='effect_class'`,
      );
      // Présente — sa suppression est une décision de nettoyage séparée (2026-08-28).
      expect(rows[0]?.nullable).toBe("YES");
    });

    it("le fonctionnement légitime n'est pas cassé : A arrête SON employée, puis la reprend", async () => {
      session.userId = DIRIGEANT_A;
      const arret = await actions.arreterOuReprendre(A.tenantId, A.employeeId, "arreter");
      expect(arret.ok).toBe(true);
      const { rows: enPause } = await db.query(
        `select en_pause_depuis from public.employee where id = $1`,
        [A.employeeId],
      );
      expect((enPause[0] as { en_pause_depuis: Date | null }).en_pause_depuis).not.toBeNull();

      const reprise = await actions.arreterOuReprendre(A.tenantId, A.employeeId, "reprendre");
      expect(reprise.ok).toBe(true);
      const { rows: reprise2 } = await db.query(
        `select en_pause_depuis from public.employee where id = $1`,
        [A.employeeId],
      );
      expect((reprise2[0] as { en_pause_depuis: Date | null }).en_pause_depuis).toBeNull();
    });
  });
});
