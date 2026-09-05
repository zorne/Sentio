/**
 * INVITER — recruter une employée sans passer par le paiement.
 *
 *     pnpm run inviter -- --email=… --entreprise="…" --objectif="10 rendez-vous ce mois"
 *
 * ══ POURQUOI UNE COMMANDE, ET SURTOUT PAS UNE ROUTE ══
 *
 * Ce fichier donne le produit gratuitement. Une route qui fait ça, même bien cachée, même
 * protégée par un mot de passe dans une variable d'environnement, est une porte ouverte sur
 * internet : elle sera trouvée. Le dépôt en a déjà l'exemple, et il a coûté cher à repérer —
 * `CheckoutAction` livre aujourd'hui un compte à qui clique sur « Procéder au paiement » quand
 * la clé de paiement n'est pas posée (constat B4 de `docs/32`).
 *
 * Une commande, elle, ne s'exécute que depuis un poste qui a déjà la chaîne de connexion et les
 * clés. Elle n'ajoute aucune surface. Et le jour où le fondateur veut la retirer, il supprime un
 * fichier, pas un chemin qu'il faut se rappeler d'avoir désactivé.
 *
 * ══ CE QU'ELLE FAIT, DANS L'ORDRE ══
 *
 *   1. écrit un diagnostic et la recommandation qui va avec, parce que `recruter()` refuse de
 *      recruter sans savoir POUR QUOI (`20260815120009`) ;
 *   2. appelle `recruter()` avec une référence `invitation:…` au lieu d'une référence de
 *      paiement. Le recrutement entier tient dans cette transaction : entreprise, identité,
 *      employée, abonnement, objectif, configuration ;
 *   3. demande à Supabase un lien d'accès à USAGE UNIQUE pour l'adresse du client ;
 *   4. envoie l'email de présentation, qui porte ce lien et aucun mot de passe.
 *
 * ⚠️ LA RÉFÉRENCE DIT « invitation », ET C'EST CE QUI REND LA GRATUITÉ TRAÇABLE.
 *
 * `subscription.billing_reference` est unique : c'est ce qui rend le rejeu d'un webhook
 * inoffensif. En y écrivant `invitation:<identifiant>`, une entreprise offerte reste
 * reconnaissable en une requête, pour toujours. Écrire une fausse référence de paiement aurait
 * mélangé le gratuit et le payant dans la seule colonne qui les distingue — et le jour où on
 * compte le chiffre d'affaires, on compte faux.
 *
 * ⚠️ CE QU'ELLE NE FAIT PAS : elle n'envoie rien à un prospect, elle ne déclenche aucune mission.
 * Elle crée une employée qui attend, exactement comme après un paiement.
 */

import { randomUUID } from "node:crypto";

import { redigerLaPresentation } from "@sentio/domain";
import pg from "pg";

interface Arguments {
  readonly email: string;
  readonly entreprise: string;
  readonly objectif: string;
  readonly cible: number;
  readonly horizon: string;
  readonly secteur: string;
}

function lireLesArguments(argv: readonly string[]): Arguments {
  const lu = new Map<string, string>();
  for (const brut of argv) {
    const trouve = /^--([a-z]+)=(.*)$/.exec(brut);
    if (trouve) lu.set(trouve[1]!, trouve[2]!);
  }

  const exige = (cle: string): string => {
    const valeur = lu.get(cle)?.trim();
    if (!valeur) {
      throw new Error(
        `Argument --${cle} manquant.\n\n` +
          `  pnpm run inviter -- --email=vous@exemple.fr --entreprise="Votre société" \\\n` +
          `                      --objectif="10 rendez-vous qualifiés" --cible=10\n`,
      );
    }
    return valeur;
  };

  return {
    email: exige("email").toLowerCase(),
    entreprise: exige("entreprise"),
    objectif: exige("objectif"),
    cible: Number(lu.get("cible") ?? "10"),
    horizon: lu.get("horizon") ?? "ce mois",
    secteur: lu.get("secteur") ?? "non renseigne",
  };
}

/** Une variable d'environnement obligatoire. Absente, on s'arrête : mieux vaut ne rien faire que
 *  recruter à moitié et laisser une entreprise sans moyen d'entrer chez elle. */
function exigerEnv(nom: string, pourquoi: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`${nom} manquante. ${pourquoi}`);
  return valeur;
}

interface Recrutement {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly prenom: string;
  readonly role: string;
  readonly priorites: readonly string[];
  readonly dejaRecrute: boolean;
}

/**
 * Le diagnostic, la recommandation, puis le recrutement. En UNE transaction.
 *
 * ⚠️ Si l'envoi de l'email échoue plus tard, l'entreprise existe quand même — et c'est le bon
 * sens de l'échec. L'inverse (un email qui annonce une employée qui n'existe pas) serait
 * beaucoup plus difficile à rattraper.
 */
async function recruter(client: pg.Client, args: Arguments): Promise<Recrutement> {
  const reference = `invitation:${randomUUID()}`;

  await client.query("begin");
  try {
    const { rows: sessions } = await client.query<{ id: string }>(
      `insert into diagnostic_session (visitor_fingerprint, extracted_profile, detected_friction)
       values ($1, jsonb_build_object(
                 'sector', $2::text,
                 'objective', jsonb_build_object('metric', 'rendez_vous_qualifies',
                                                 'target', $3::numeric,
                                                 'horizon', $4::text)),
               'aucune_relance')
       returning id`,
      [`invitation-${args.email}`, args.secteur, args.cible, args.horizon],
    );
    const sessionId = sessions[0]!.id;

    // La configuration proposée. Volontairement la plus PRUDENTE que le noyau accepte : elle
    // qualifie et elle relance, elle demande l'accord avant chaque envoi. Une invitation ne doit
    // jamais créer une employée plus libre qu'un client payant.
    const proposition = {
      role: "prospection",
      capacites: ["relancer.prospect", "qualifier.prospect"],
      priorites: ["relancer ce qui est resté sans réponse"],
      autonomie: "confirm",
    };

    const { rows: recos } = await client.query<{ id: string }>(
      `insert into recommendation (diagnostic_session_id, status, justification, configuration_proposee)
       values ($1, 'proposed', $2, $3::jsonb)
       returning id`,
      [
        sessionId,
        "Accès offert par Sentio : la configuration la plus prudente, à ajuster ensuite.",
        JSON.stringify(proposition),
      ],
    );

    const { rows } = await client.query<{
      tenant_id: string;
      employee_id: string;
      deja_recrute: boolean;
    }>(`select * from recruter($1, $2, 'start', $3, $4)`, [
      recos[0]!.id,
      args.entreprise,
      reference,
      args.email,
    ]);
    const recrutement = rows[0]!;

    const { rows: qui } = await client.query<{ prenom: string }>(
      `select i.first_name as prenom
         from employee e join identity i on i.id = e.identity_id
        where e.id = $1`,
      [recrutement.employee_id],
    );

    await client.query("commit");

    return {
      tenantId: recrutement.tenant_id,
      employeeId: recrutement.employee_id,
      prenom: qui[0]?.prenom ?? "Votre employée",
      role: proposition.role,
      priorites: proposition.priorites,
      dejaRecrute: recrutement.deja_recrute,
    };
  } catch (erreur) {
    await client.query("rollback");
    throw erreur;
  }
}

/**
 * Le lien à usage unique, demandé à Supabase.
 *
 * On génère le lien plutôt que de laisser Supabase envoyer son propre email : le message qui
 * arrive au client doit être celui de Sentio, pas un gabarit par défaut en anglais.
 */
async function lienDAcces(email: string, origine: string): Promise<string> {
  const url = exigerEnv("NEXT_PUBLIC_SUPABASE_URL", "C'est le projet où vit le compte du client.");
  const service = exigerEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "Seule cette clé peut créer un accès pour quelqu'un d'autre. Elle ne quitte jamais ce poste.",
  );

  const reponse = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "invite",
      email,
      options: { redirect_to: `${origine}/auth/callback?next=/acces` },
    }),
  });

  if (!reponse.ok) {
    // ⚠️ Le corps de la réponse peut contenir des détails du projet : on dit le code, jamais le
    // corps, et surtout jamais la clé qui vient d'être utilisée.
    throw new Error(
      `Supabase a refusé de créer le lien d'accès (code ${reponse.status}). ` +
        `Si ce compte existe déjà, utilisez « mot de passe oublié » depuis la page de connexion.`,
    );
  }

  const corps = (await reponse.json()) as { action_link?: string; properties?: { action_link?: string } };
  const lien = corps.action_link ?? corps.properties?.action_link;
  if (!lien) throw new Error("Supabase n'a pas rendu de lien d'accès.");
  return lien;
}

/** L'envoi. Le seul endroit de ce fichier qui parle au monde extérieur. */
async function envoyer(destinataire: string, email: ReturnType<typeof redigerLaPresentation>): Promise<void> {
  const cle = exigerEnv("RESEND_API_KEY", "Sans elle, aucun email ne part.");
  const expediteur = exigerEnv(
    "SENTIO_EMAIL_EXPEDITEUR",
    'Par exemple : "Sentio <bonjour@votre-domaine.fr>". Un domaine à vous, jamais un domaine de test.',
  );

  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: expediteur,
      to: destinataire,
      subject: email.objet,
      html: email.html,
      text: email.texte,
    }),
  });

  if (!reponse.ok) throw new Error(`L'email n'est pas parti (code ${reponse.status}).`);
}

async function main(): Promise<void> {
  const args = lireLesArguments(process.argv.slice(2));
  const chaine = exigerEnv("SUPABASE_DB_URL", "C'est la base où l'entreprise sera créée.");
  const origine = (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");

  const client = new pg.Client({ connectionString: chaine });
  await client.connect();

  let recrutement: Recrutement;
  try {
    recrutement = await recruter(client, args);
  } finally {
    await client.end();
  }

  if (recrutement.dejaRecrute) {
    process.stdout.write(
      "Cette référence a déjà servi : aucune seconde entreprise n'a été créée.\n",
    );
    return;
  }

  const lien = await lienDAcces(args.email, origine);
  const email = redigerLaPresentation({
    prenom: recrutement.prenom,
    entreprise: args.entreprise,
    role: recrutement.role,
    priorites: recrutement.priorites,
    objectif: args.objectif,
    lienDAcces: lien,
    adresseDeConnexion: `${origine}/login`,
  });

  await envoyer(args.email, email);

  process.stdout.write(
    `${recrutement.prenom} a rejoint ${args.entreprise}.\n` +
      `Entreprise : ${recrutement.tenantId}\n` +
      `L'email de présentation est parti à ${args.email}.\n`,
  );
}

main().catch((erreur: unknown) => {
  process.stderr.write(`\n${erreur instanceof Error ? erreur.message : String(erreur)}\n\n`);
  process.exitCode = 1;
});
