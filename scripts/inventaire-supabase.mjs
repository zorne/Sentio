/**
 * L'INVENTAIRE — tout ce qui doit se trouver sur le Supabase, et ce qui y manque.
 *
 *     pnpm run supabase:inventaire                      # ce que les migrations produisent
 *     pnpm run supabase:inventaire -- --cible="<url>"   # ce qui manque à une base réelle
 *
 * ══ POURQUOI CE SCRIPT PLUTÔT QU'UNE LISTE ══
 *
 * « N'oublie rien » est une promesse qu'une liste écrite à la main ne tient pas. Elle est juste le
 * jour où on l'écrit, puis une migration ajoute une fonction, un déclencheur, une politique, et
 * personne ne pense à revenir la corriger. Six mois plus tard elle rassure sans rien garantir,
 * ce qui est pire que de ne pas l'avoir.
 *
 * Ici, **la référence est la base locale elle-même**, reconstruite à partir des migrations. Elle
 * ne peut pas dériver : elle EST le schéma. Il n'y a aucun fichier d'attendu à tenir à jour, donc
 * aucun fichier d'attendu à oublier.
 *
 * ══ CE QU'IL NE FAIT JAMAIS ══
 *
 * Il ne pousse rien, ne crée rien, n'efface rien. Il LIT deux bases et dit ce qui diffère.
 * Appliquer le schéma sur une base réelle est un geste humain (`docs/31` §2).
 *
 * ⚠️ Il lit la base cible en lecture seule, mais il s'y connecte : ne le pointer que vers une base
 * dont on a le droit de lire le catalogue.
 */

import pg from "pg";

const CIBLE = lireArgument("cible");
const REFERENCE = lireArgument("reference") ?? process.env["DATABASE_URL"];

function lireArgument(nom) {
  for (const brut of process.argv.slice(2)) {
    const trouve = new RegExp(`^--${nom}=(.*)$`).exec(brut);
    if (trouve) return trouve[1];
  }
  return undefined;
}

/**
 * Les relevés du catalogue. Chacun rend une LISTE DE NOMS stables, comparables d'une base à
 * l'autre.
 *
 * ⚠️ Ce qui est volontairement exclu : tout ce qui porte un identifiant engendré, une taille ou
 * une date. On compare ce que le schéma PROMET, pas l'état d'une base à un instant.
 */
const RELEVES = [
  {
    cle: "extensions",
    quoi: "extensions",
    sql: `select extname as nom from pg_extension order by 1`,
  },
  {
    cle: "tables",
    quoi: "tables",
    sql: `select tablename as nom from pg_tables where schemaname = 'public' order by 1`,
  },
  {
    cle: "vues",
    quoi: "vues",
    sql: `select viewname as nom from pg_views where schemaname = 'public' order by 1`,
  },
  {
    // Le type compte autant que le nom : une colonne présente mais en `text` là où le cœur attend
    // un `uuid` casse une jointure sans jamais manquer à l'appel.
    cle: "colonnes",
    quoi: "colonnes",
    sql: `select table_name || '.' || column_name || ' ' || data_type as nom
            from information_schema.columns
           where table_schema = 'public' order by 1`,
  },
  {
    // La signature entière : une fonction recréée avec un argument de moins est une AUTRE
    // fonction, et l'appelant échoue au moment le plus coûteux.
    cle: "fonctions",
    quoi: "fonctions",
    sql: `select p.proname || '(' || pg_get_function_arguments(p.oid) || ')' as nom
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' order by 1`,
  },
  {
    // ⚠️ Les garanties du produit vivent ici. Un déclencheur absent, et l'ADN redevient
    // modifiable, le journal redevient réinscriptible, le cliquet d'autonomie disparaît.
    cle: "declencheurs",
    quoi: "déclencheurs",
    sql: `select c.relname || ' : ' || t.tgname as nom
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and not t.tgisinternal order by 1`,
  },
  {
    cle: "rls",
    quoi: "tables avec RLS active",
    sql: `select c.relname as nom
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1`,
  },
  {
    // Une politique absente ne refuse pas : elle laisse la table sans règle, donc fermée si RLS
    // est active, et grande ouverte si elle ne l'est pas.
    cle: "politiques",
    quoi: "politiques d'isolation",
    sql: `select tablename || ' : ' || policyname as nom
            from pg_policies where schemaname = 'public' order by 1`,
  },
  {
    // ⚠️ Piège 6 de `docs/31` : droit ≠ politique. Une politique sans `grant` refuse le client
    // AVANT que RLS ne s'exprime, avec un message qui parle de permission et que personne ne
    // relie à la bonne cause.
    cle: "droits",
    quoi: "droits accordés aux rôles du client",
    sql: `select grantee || ' ' || privilege_type || ' ' || table_name as nom
            from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon', 'authenticated')
           order by 1`,
  },
  {
    // Les index uniques partiels PORTENT des règles métier : une mission par sujet, une identité
    // jamais réutilisée, une référence de paiement unique. Les perdre, c'est perdre la règle.
    cle: "index",
    quoi: "index",
    sql: `select indexname as nom from pg_indexes where schemaname = 'public' order by 1`,
  },
  {
    cle: "contraintes",
    quoi: "contraintes",
    sql: `select conrelid::regclass::text || ' : ' || conname as nom
            from pg_constraint c
            join pg_namespace n on n.oid = c.connamespace
           where n.nspname = 'public' order by 1`,
  },
];

/**
 * Les données de référence : sans elles, le schéma est complet et le produit ne fonctionne pas.
 *
 * ⚠️ CE N'EST PAS DU JEU D'ESSAI. Sans `plan`, aucun abonnement ne peut exister ; sans
 * `capability_binding`, une capacité n'a aucun moteur ; sans `identity`, aucun employé ne peut
 * être recruté. Elles sont posées par des migrations, donc elles voyagent avec le schéma — mais
 * un `on conflict do nothing` mal placé ou une migration à moitié appliquée les laisse à zéro,
 * et rien ne le crie.
 */
const DONNEES_DE_REFERENCE = [
  { table: "plan", minimum: 3, pourquoi: "sans formule, aucun abonnement ne peut exister" },
  { table: "plan_quota", minimum: 15, pourquoi: "un plafond absent n'est pas un plafond infini, c'est un oubli" },
  { table: "capability", minimum: 5, pourquoi: "la bibliothèque d'actes" },
  { table: "capability_binding", minimum: 5, pourquoi: "une capacité sans moteur ne s'exécute pas" },
  { table: "employee_definition", minimum: 1, pourquoi: "l'ADN sur lequel un employé est figé" },
  { table: "strategy_variant", minimum: 1, pourquoi: "sans variante par défaut, aucun comportement à jouer" },
  {
    table: "identity",
    minimum: 1,
    pourquoi: "le réservoir de prénoms : épuisé, plus aucun recrutement n'est possible",
    filtre: "status = 'free'",
  },
];

/** Ce qui doit exister mais que le schéma ne peut pas porter. Vérifié à l'œil, pas ici. */
const HORS_SCHEMA = [
  ["Fonctions déployées", "diagnostic, desinscription, battement, recrutement (`supabase functions deploy`)"],
  ["Secrets des fonctions", "voir `pnpm run deploiement:verifier`, qui en vérifie les NOMS sans lire les valeurs"],
  ["Fournisseur de modèle", "au moins une ligne dans `provider_credential`. Un `no_train` EXIGE une preuve d'opt-out datée"],
  ["Authentification", "l'adresse de retour `/auth/callback` doit être autorisée, sinon les liens d'accès sont refusés"],
  ["Emails de Supabase", "désactivés : c'est Sentio qui rédige et envoie (`docs/33`)"],
];

async function relever(url) {
  const client = new pg.Client({
    connectionString: url,
    ssl: /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const releve = {};
    for (const { cle, sql } of RELEVES) {
      const { rows } = await client.query(sql);
      releve[cle] = rows.map((ligne) => ligne.nom);
    }

    releve.donnees = {};
    for (const { table, filtre } of DONNEES_DE_REFERENCE) {
      const ou = filtre ? ` where ${filtre}` : "";
      try {
        const { rows } = await client.query(`select count(*)::int as n from public.${table}${ou}`);
        releve.donnees[table] = rows[0].n;
      } catch {
        // Table absente : le relevé des tables l'a déjà signalé, on ne le dit pas deux fois.
        releve.donnees[table] = null;
      }
    }
    return releve;
  } finally {
    await client.end();
  }
}

function afficherInventaire(releve) {
  process.stdout.write("\nCE QUI DOIT SE TROUVER SUR LE SUPABASE\n\n");
  for (const { cle, quoi } of RELEVES) {
    process.stdout.write(`  ${String(releve[cle].length).padStart(4)}  ${quoi}\n`);
  }
  process.stdout.write("\n  Données de référence, indispensables au fonctionnement :\n\n");
  for (const { table, pourquoi } of DONNEES_DE_REFERENCE) {
    const n = releve.donnees[table];
    process.stdout.write(
      `  ${String(n ?? "—").padStart(4)}  ${table.padEnd(22)} ${pourquoi}\n`,
    );
  }
  process.stdout.write("\n  Ce que le schéma ne porte pas, et qu'il faut poser à côté :\n\n");
  for (const [quoi, detail] of HORS_SCHEMA) {
    process.stdout.write(`        ${quoi.padEnd(24)} ${detail}\n`);
  }
  process.stdout.write("\n");
}

function comparer(reference, cible) {
  let manquants = 0;
  process.stdout.write("\nCE QUI MANQUE À LA BASE CIBLE\n\n");

  for (const { cle, quoi } of RELEVES) {
    const attendus = new Set(reference[cle]);
    const presents = new Set(cible[cle]);
    const absents = [...attendus].filter((nom) => !presents.has(nom));
    const enTrop = [...presents].filter((nom) => !attendus.has(nom));

    if (absents.length === 0 && enTrop.length === 0) {
      process.stdout.write(`  ✓  ${quoi} : ${attendus.size}, à l'identique\n`);
      continue;
    }
    manquants += absents.length;
    process.stdout.write(`  ✗  ${quoi} : ${absents.length} absent(s), ${enTrop.length} en trop\n`);
    for (const nom of absents.slice(0, 12)) process.stdout.write(`       absent  ${nom}\n`);
    if (absents.length > 12) process.stdout.write(`       … et ${absents.length - 12} autre(s)\n`);
    // Ce qui est « en trop » n'est pas forcément une faute : la plateforme ajoute ses propres
    // objets. On le montre, on ne le compte pas comme un manque.
    for (const nom of enTrop.slice(0, 6)) process.stdout.write(`       en trop ${nom}\n`);
    if (enTrop.length > 6) process.stdout.write(`       … et ${enTrop.length - 6} autre(s)\n`);
  }

  process.stdout.write("\n  Données de référence :\n\n");
  for (const { table, minimum, pourquoi } of DONNEES_DE_REFERENCE) {
    const n = cible.donnees[table];
    const ok = n !== null && n >= minimum;
    if (!ok) manquants += 1;
    process.stdout.write(
      `  ${ok ? "✓" : "✗"}  ${table.padEnd(22)} ${String(n ?? "table absente").padStart(6)}` +
        `${ok ? "" : `   attendu au moins ${minimum} : ${pourquoi}`}\n`,
    );
  }

  process.stdout.write("\n  À vérifier à la main, le schéma ne peut pas le porter :\n\n");
  for (const [quoi, detail] of HORS_SCHEMA) {
    process.stdout.write(`     ${quoi.padEnd(24)} ${detail}\n`);
  }

  if (manquants > 0) {
    process.stdout.write(
      `\n${manquants} élément(s) manquant(s). Appliquer les migrations est un geste humain : ` +
        `\`supabase db push\`, jamais un script.\n\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("\nLa base cible porte tout ce que les migrations produisent.\n\n");
}

async function main() {
  if (!REFERENCE) {
    throw new Error(
      "Aucune base de référence. Passer --reference=<url>, ou poser DATABASE_URL sur la base " +
        "locale reconstruite par `supabase/tests/run.sh`.",
    );
  }

  const reference = await relever(REFERENCE);
  if (!CIBLE) {
    afficherInventaire(reference);
    return;
  }
  comparer(reference, await relever(CIBLE));
}

main().catch((erreur) => {
  process.stderr.write(`\n${erreur instanceof Error ? erreur.message : String(erreur)}\n\n`);
  process.exitCode = 1;
});
