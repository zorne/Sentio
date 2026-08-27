// ════════════════════════════════════════════════════════════════════
// L'espace du dirigeant — l'unique lieu de vie du client après la vente.
//
// ⚠️ TOUTES LES LECTURES PASSENT PAR LE CLIENT À SESSION.
//
// RLS s'applique donc : un dirigeant ne voit que son entreprise parce que la
// BASE le lui impose, pas parce que ce fichier y pense. C'est la règle du
// cœur (`docs/02-architecture.md`, deux zones étanches) — et elle diffère du
// `/dashboard` hérité, qui lit par un pool de service hors RLS.
//
// ⚠️ AUCUN CHIFFRE QUI NE VIENNE D'UNE LIGNE EN BASE (AGENTS.md, invariant 4).
// Pas de progression estimée, pas de « temps économisé » calculé au doigt
// mouillé. Ce qui n'est pas mesuré n'est pas affiché — on écrit qu'on ne le
// sait pas encore.
//
// Réalise : DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-10, DASH-11,
//           DASH-15, DASH-16
// ════════════════════════════════════════════════════════════════════

import { pool } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

import {
  courbe,
  motsDeLaRecolte,
  motsDuTravail,
  evolutionDuTauxDeReponse,
  tauxDeReponse,
  type JourDeTravail,
} from "@sentio/domain";

import { Scene } from "./Scene";
import "./espace.css";

export const dynamic = "force-dynamic";

export default async function EspacePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ⚠️ UNE SEULE ENTREPRISE À L'ÉCRAN, CHOISIE DE FAÇON DÉTERMINISTE.
  //
  // RLS borne la lecture aux appartenances de ce compte : il n'y a pas d'identifiant à passer,
  // donc pas d'identifiant à falsifier. Un INCONNU ne peut donc rien voir d'ici, et ça n'a jamais
  // été en cause.
  //
  // Ce qui l'était : RLS rend les lignes de TOUTES les entreprises de ce compte. Ce fichier
  // prenait la première venue (`[0]`), sans ordre, puis lisait employé, objectif, notifications
  // et mémoire SANS filtrer par entreprise. Un dirigeant rattaché à deux entreprises voyait donc
  // le nom et les chiffres de l'une avec l'employée de l'autre, et l'attribution pouvait changer
  // d'un rechargement à l'autre, puisque Postgres ne promet aucun ordre sans `order by`.
  //
  // Ce n'est pas une hypothèse d'école : deux invitations envoyées à la même adresse suffisent
  // (`docs/33`), et un dirigeant qui possède deux sociétés est un cas ordinaire.
  //
  // La correction tient en deux temps, et les deux comptent :
  //   1. l'entreprise est choisie par un ordre STABLE, la plus récemment rejointe ;
  //   2. **chaque lecture porte ensuite son `tenant_id`**. RLS reste la garantie contre un
  //      étranger ; le filtre explicite est la garantie contre un mélange entre SES entreprises.
  //      Une garantie qui protège d'autrui ne protège pas de soi-même.
  const { data: appartenances } = await supabase
    .from("tenant_member")
    .select("tenant_id, created_at")
    .order("created_at", { ascending: false });
  const tenantId = appartenances?.[0]?.tenant_id as string | undefined;
  const plusieursEntreprises = (appartenances?.length ?? 0) > 1;

  if (tenantId === undefined) {
    return (
      <SceneVide
        titre="Votre espace"
        mot="Ce compte n'est rattaché à aucune entreprise. Si vous venez de régler votre abonnement, patientez quelques instants puis rechargez cette page."
      />
    );
  }

  const [{ data: employes }, { data: objectifs }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("employee")
        .select("id, autonomy, identity_id, en_pause_depuis")
        .eq("tenant_id", tenantId),
      supabase
        .from("objective")
        .select("metric, target_value, horizon")
        .eq("tenant_id", tenantId)
        .eq("state", "actif"),
      supabase
        .from("notification")
        .select("id, kind, message, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const employe = employes?.[0];

  // ── Aucun employé : l'état vide compte autant que le reste. Un espace qui affiche des cadres
  //    creux se lit comme un produit inachevé (DASH-10).
  if (employe === undefined) {
    return (
      <SceneVide
        titre="Personne, encore"
        mot="Aucun employé n'a rejoint votre entreprise. Il apparaîtra ici dès que votre recrutement sera confirmé."
      />
    );
  }

  const [{ data: identites }, { data: configurations }, { data: propositions }] = await Promise.all([
    supabase.from("identity").select("first_name, last_name").eq("id", employe.identity_id),
    supabase
      .from("lady_configuration")
      .select("id, role, priorites, autonomie, raison, created_at")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employe.id)
      .eq("active", true),
    // La proposition en attente, s'il y en a une. Elle est INACTIVE : elle décrit ce que son
    // employé ferait, pas ce qu'il fait. Rien ne bouge tant que le dirigeant n'a pas répondu.
    supabase
      .from("lady_configuration")
      .select("id, role, priorites, raison, created_at")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employe.id)
      .eq("active", false)
      .is("refusee_le", null)
      .eq("declencheur", "resultats")
      .order("version", { ascending: false })
      .limit(1),
  ]);

  const identite = identites?.[0];
  const configuration = configurations?.[0];
  const proposition = propositions?.[0];
  const objectif = objectifs?.[0];

  // Ce qu'il a appris, et ce qu'il a retenu de ses propres résultats. Les deux lectures passent
  // par le client à session : RLS borne déjà chacune à cette entreprise.
  const [{ data: faits }, { data: progression }] = await Promise.all([
    supabase
      .from("learned_fact")
      .select("id, fact")
      .eq("tenant_id", tenantId)
      .eq("status", "actif")
      .order("usage_count", { ascending: false })
      .limit(5),
    supabase.from("tenant_variant_preference").select("kind, raison").eq("tenant_id", tenantId),
  ]);

  // ── CE QU'ELLE FAIT EN CE MOMENT ────────────────────────────────────────────────────────
  //
  // ⚠️ L'écran ne montrait AUCUNE mission. Il disait ce qu'elle sait faire, ce qu'elle a obtenu et
  // ce qu'elle a appris, jamais ce qu'elle est en train de faire. C'est pourtant la première
  // question d'un dirigeant qui ouvre son espace, et la seule à laquelle un employé humain
  // répondrait sans qu'on la pose.
  //
  // `task` porte déjà six états génériques et se lit sous RLS : rien à construire côté base.
  const { data: missions } = await supabase
    .from("task")
    .select("id, state, subject_kind, created_at")
    .eq("tenant_id", tenantId)
    .in("state", ["pending", "in_progress", "waiting_approval", "needs_attention"])
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: capacites } = configuration
    ? await supabase
        .from("lady_configuration_capability")
        .select("capability(name)")
        .eq("tenant_id", tenantId)
        .eq("configuration_id", configuration.id)
    : { data: null };

  // ── Ce que le dirigeant voit sans cliquer. Les deux fonctions sont `security definer` et
  //    révoquées au public : elles passent donc par le pool de service, après que RLS a déjà
  //    établi plus haut à quelle entreprise ce compte appartient.
  const JOURS = 14;
  const [{ rows: serieBrute }, { rows: bilanBrut }] = await Promise.all([
    pool.query<{
      jour: Date;
      contactes: number;
      reponses: number;
      rendez_vous: number;
      ventes: number;
    }>("select * from serie_quotidienne($1, $2)", [tenantId, JOURS]),
    pool.query<{
      contactes: number;
      reponses: number;
      rendez_vous: number;
      ventes: number;
      chiffre_affaires: string;
      entreprises_engagees: number;
      missions_agies: number;
    }>("select * from bilan_de_l_employe($1, $2)", [tenantId, JOURS]),
  ]);

  const serie: JourDeTravail[] = serieBrute.map((ligne) => ({
    jour: new Date(ligne.jour).toISOString().slice(0, 10),
    contactes: Number(ligne.contactes),
    reponses: Number(ligne.reponses),
    rendezVous: Number(ligne.rendez_vous),
    ventes: Number(ligne.ventes),
  }));

  const bilan = {
    contactes: Number(bilanBrut[0]?.contactes ?? 0),
    reponses: Number(bilanBrut[0]?.reponses ?? 0),
    rendezVous: Number(bilanBrut[0]?.rendez_vous ?? 0),
    ventes: Number(bilanBrut[0]?.ventes ?? 0),
    chiffreAffaires: Number(bilanBrut[0]?.chiffre_affaires ?? 0),
    entreprisesEngagees: Number(bilanBrut[0]?.entreprises_engagees ?? 0),
  };

  const parts = courbe(serie, (j) => j.contactes);

  // ── Ce qu'il paie, et ce qui lui reste. Le grief le plus répété contre les produits
  //    concurrents, après la qualité, est l'OPACITÉ : prix caché, coûts qui montent sans qu'on
  //    sache pourquoi, abonnement qu'on ne sait pas résilier. La réponse n'est pas une page de
  //    tarifs — c'est de montrer, dans l'espace, ce qui est en cours et ce qu'il en reste.
  //
  //    ⚠️ Tout vient de `abonnement_du_client()`, qui compte les VRAIES LIGNES. `usage_counter`
  //    ne reçoit que les jetons d'inférence : afficher un compteur de messages depuis cette table
  //    afficherait zéro pour toujours (LADY-AH).
  const { rows: abonnements } = await pool.query<{
    formule: string;
    periode_finit_le: Date;
    missions_utilisees: number;
    missions_plafond: number | null;
    messages_periode: number;
    messages_plafond_periode: number | null;
    messages_aujourdhui: number;
    messages_plafond_jour: number | null;
  }>("select * from abonnement_du_client($1)", [tenantId]);

  const abonnement = abonnements[0];

  // ── Ce qui a abouti. La fonction ne connaît AUCUN métier : elle rend les entreprises qui ont
  //    donné une suite. C'est le rôle qui NOMME la récolte, ici et nulle part ailleurs — sans quoi
  //    on spécialiserait le noyau par le vocabulaire (adr/0029).
  const { rows: recolte } = await pool.query<{
    entreprise: string;
    contact: string | null;
    quoi: string;
    valeur: string;
    quand: Date;
  }>("select * from recolte_du_client($1, $2)", [tenantId, 30]);

  const mots = motsDeLaRecolte(configuration?.role ?? null);

  // ── Ce qu'une proposition change EXACTEMENT. Une phrase de résumé dit une intention ; le
  //    dirigeant valide une conséquence. Il doit voir ce qu'elle gagne, ce qu'elle perd, et ce qui
  //    ne bouge pas.
  const { rows: changements } = proposition
    ? await pool.query<{
        role_actuel: string;
        role_propose: string;
        autonomie_actuelle: string;
        autonomie_proposee: string;
        priorites_actuelles: string[];
        priorites_proposees: string[];
        capacites_ajoutees: string[];
        capacites_retirees: string[];
      }>("select * from ce_que_change_la_proposition($1, $2)", [tenantId, proposition.id])
    : { rows: [] };

  const change = changements[0];

  // ── Ce qui attend un accord, avec CE QU'IL AUTORISE. Jamais « une action attend votre
  //    accord » : on demande d'autoriser une action irréversible, lui cacher laquelle rend la
  //    garde inutile ou bloquante.
  const { rows: accords } = await pool.query<{
    approval_id: string;
    demande_le: Date;
    capacite_cle: string | null;
    capacite_nom: string | null;
    entreprise: string | null;
    contact: string | null;
    objet: string | null;
    corps: string | null;
    pourquoi: string | null;
  }>("select * from ce_qui_attend_votre_accord($1)", [tenantId]);

  // ── De quoi préparer chaque rendez-vous obtenu.
  //    ⚠️ Le texte des réponses reçues n'est stocké nulle part : ce qui porte des mots venus de
  //    l'échange, ce sont les NOTES consignées par l'employée. Chaque élément est affiché avec sa
  //    provenance — un briefing dont on ignore d'où vient chaque ligne ne se défend pas en réunion.
  // ── CE QU'ELLE A FAIT, ET SI ELLE VOUS L'A DEMANDÉ ──────────────────────────────────────
  //
  // ⚠️ C'EST LA CONTREPARTIE DE « TOUJOURS AUTORISER », ET ELLE N'EST PAS NÉGOCIABLE.
  //
  // Autoriser une capacité pour toujours n'a de sens que si l'on voit ce qui passe ensuite. Sans
  // cette lecture, le dirigeant n'aurait aucun moyen de constater que ça lui déplaît, et l'accord
  // permanent reviendrait à fermer les yeux.
  //
  // La fonction est `security definer` parce que `execution_event` est FERMÉ au client : sa
  // charge utile porte des contenus bruts d'outils. Elle rend ce qui se lit, et rien d'autre.
  const { rows: journal } = await pool.query<{
    quand: Date;
    capacite_cle: string | null;
    capacite_nom: string | null;
    entreprise: string | null;
    sans_vous: boolean;
    accord_en_cours: boolean;
  }>("select * from ce_qu_elle_a_fait($1, $2)", [tenantId, 14]);

  const { rows: rendezVous } = await pool.query<{
    lead_id: string;
    entreprise: string;
    contact: string | null;
    fonction: string | null;
    secteur: string | null;
    pourquoi_retenue: string | null;
    dernier_objet: string | null;
    dernier_envoi: Date | null;
    messages_envoyes: number;
    premier_contact: Date | null;
    rendez_vous_le: Date;
    notes: { note: string; quand: string }[];
  }>("select * from avant_le_rendez_vous($1, $2)", [tenantId, 60]);

  const capacitesLisibles = (capacites ?? [])
    .map((ligne) => (ligne.capability as { name?: string } | null)?.name)
    .filter((nom): nom is string => typeof nom === "string" && nom.trim() !== "");

  // Le nom de l'entreprise n'est lu que s'il doit être affiché : une requête de plus sur un
  // écran qui n'en a pas besoin est une requête de trop.
  let nomDeLEntreprise: string | null = null;
  if (plusieursEntreprises) {
    const { data: entreprises } = await supabase
      .from("tenant")
      .select("name")
      .eq("id", tenantId);
    nomDeLEntreprise = entreprises?.[0]?.name ?? null;
  }

  return (
    <Scene
      tenantId={tenantId}
      nomDeLEntreprise={nomDeLEntreprise}
      employeeId={employe.id}
      prenom={identite?.first_name ?? "Votre employé"}
      role={configuration?.role ?? null}
      mots={motsDuTravail(configuration?.role ?? null)}
      missions={(missions ?? []).map((m) => ({
        id: m.id as string,
        etat: m.state as string,
        depuis: dateCourte(m.created_at as string),
      }))}
      arreteDepuis={employe.en_pause_depuis ? dateCourte(employe.en_pause_depuis) : null}
      autonomie={employe.autonomy as "confirm" | "confirm_once" | "auto"}
      capacites={capacitesLisibles}
      priorites={Array.isArray(configuration?.priorites) ? (configuration.priorites as string[]) : []}
      raisonDeLaConfiguration={configuration?.raison ?? null}
      objectif={
        objectif
          ? {
              cible: nombreLisible(objectif.target_value),
              metrique: motDeLaMetrique(objectif.metric),
              horizon: objectif.horizon,
            }
          : null
      }
      ceQuElleAFait={journal.map((j) => ({
        quand: dateCourte(j.quand.toISOString()),
        quoi: j.capacite_nom ?? "Action non identifiée au journal",
        capaciteCle: j.capacite_cle,
        entreprise: j.entreprise,
        sansVous: j.sans_vous,
        accordEnCours: j.accord_en_cours,
      }))}
      accords={accords.map((a) => ({
        id: a.approval_id,
        depuis: dateCourte(a.demande_le.toISOString()),
        // Sans nom de capacité, on reste factuel plutôt que vague : « une action » ne dit rien,
        // mais inventer un intitulé dirait faux.
        quoi: a.capacite_nom ?? "Action non identifiée au journal",
        capaciteCle: a.capacite_cle,
        entreprise: a.entreprise,
        contact: a.contact,
        objet: a.objet,
        corps: a.corps,
        pourquoi: a.pourquoi,
      }))}
      proposition={
        proposition
          ? {
              id: proposition.id as string,
              raison: proposition.raison as string,
              change:
                change === undefined
                  ? null
                  : {
                      roleActuel: change.role_actuel,
                      rolePropose: change.role_propose,
                      autonomieActuelle: change.autonomie_actuelle,
                      autonomieProposee: change.autonomie_proposee,
                      prioritesActuelles: change.priorites_actuelles ?? [],
                      prioritesProposees: change.priorites_proposees ?? [],
                      capacitesAjoutees: change.capacites_ajoutees ?? [],
                      capacitesRetirees: change.capacites_retirees ?? [],
                    },
            }
          : null
      }
      faits={(faits ?? []).map((fait) => fait.fact as string)}
      progression={(progression ?? []).map((preference) => ({
        quoi: motDuGenre(preference.kind as string),
        raison: preference.raison as string,
      }))}
      formule={
        abonnement === undefined
          ? null
          : {
              nom: motDeLaFormule(abonnement.formule),
              jusquAu: dateCourte(abonnement.periode_finit_le.toISOString()),
              missions: {
                fait: Number(abonnement.missions_utilisees),
                plafond:
                  abonnement.missions_plafond === null ? null : Number(abonnement.missions_plafond),
              },
              messages: {
                fait: Number(abonnement.messages_periode),
                plafond:
                  abonnement.messages_plafond_periode === null
                    ? null
                    : Number(abonnement.messages_plafond_periode),
              },
              messagesDuJour: {
                fait: Number(abonnement.messages_aujourdhui),
                plafond:
                  abonnement.messages_plafond_jour === null
                    ? null
                    : Number(abonnement.messages_plafond_jour),
              },
            }
      }
      rendezVous={rendezVous.map((r) => ({
        leadId: r.lead_id,
        entreprise: r.entreprise,
        contact: r.contact,
        fonction: r.fonction,
        secteur: r.secteur,
        pourquoiRetenue: r.pourquoi_retenue,
        dernierObjet: r.dernier_objet,
        dernierEnvoi: r.dernier_envoi ? dateCourte(r.dernier_envoi.toISOString()) : null,
        messagesEnvoyes: Number(r.messages_envoyes),
        depuis: r.premier_contact ? dateCourte(r.premier_contact.toISOString()) : null,
        obtenuLe: dateCourte(r.rendez_vous_le.toISOString()),
        notes: (r.notes ?? []).map((n) => ({
          note: n.note,
          quand: dateCourte(new Date(n.quand).toISOString()),
        })),
      }))}
      recolte={{
        titre: mots.titre,
        vide: mots.vide,
        lignes: recolte.map((ligne) => ({
          entreprise: ligne.entreprise,
          contact: ligne.contact,
          quoi: ligne.quoi,
          valeur: Number(ligne.valeur),
          quand: dateCourte(ligne.quand.toISOString()),
        })),
      }}
      tableau={{
        ...bilan,
        mots: motsDuTravail(configuration?.role ?? null).indicateurs,
        jours: JOURS,
        taux: tauxDeReponse(bilan),
        evolution: evolutionDuTauxDeReponse(serie),
        courbe: serie.map((jour, i) => ({
          jour: jour.jour,
          part: parts[i] ?? 0,
          valeur: jour.contactes,
        })),
      }}
      journal={(notifications ?? []).map((notification) => ({
        id: notification.id as string,
        quand: dateCourte(notification.created_at as string),
        quoi: notification.message as string,
      }))}
    />
  );
}

/**
 * Un état vide reste une SCÈNE, pas une page d'erreur.
 *
 * Le premier écran qu'un client voit après avoir payé peut très bien être celui-ci — le temps que
 * le paiement se propage. Lui servir un paragraphe nu à cet instant précis donnerait le sentiment
 * d'avoir acheté un formulaire.
 */
function SceneVide({ titre, mot }: { titre: string; mot: string }) {
  return (
    <main className="sc sc--vide">
      <div className="sc-scene">
        <div className="sc-identite">
          <h1>{titre}</h1>
          <p className="sc-etat">{mot}</p>
        </div>
      </div>
    </main>
  );
}


/**
 * Le nom d'une formule, tel que le dirigeant l'a achetée.
 *
 * ⚠️ **Aucun prix ici.** Le montant vit chez le prestataire de paiement, pas en base : l'écrire
 * dans le code serait afficher un chiffre que rien ne garantit, et le jour où un tarif change,
 * l'espace mentirait à celui qui paie l'autre montant.
 */
function motDeLaFormule(tier: string): string {
  const mots: Record<string, string> = {
    start: "Start",
    growth: "Growth",
    scale: "Scale",
  };
  return mots[tier] ?? tier;
}

/** Un genre de variante est notre vocabulaire. Le dirigeant lit ce que ça change pour lui. */
function motDuGenre(kind: string): string {
  const mots: Record<string, string> = {
    registre: "Sa façon de s'exprimer :",
    angle: "Sa façon d'aborder une entreprise :",
    moment_de_relance: "Le moment où il relance :",
  };
  return mots[kind] ?? "Sa façon de travailler :";
}

function motDeLaMetrique(metric: string): string {
  const mots: Record<string, string> = {
    rendez_vous_qualifies: "rendez-vous qualifiés",
    chiffre_affaires: "€ de chiffre d'affaires",
    mrr: "€ par mois",
  };
  return mots[metric] ?? metric;
}

/**
 * Un objectif se lit, il ne se déchiffre pas. « 10000 » demande un effort que « 10 000 » ne
 * demande pas — et c'est le chiffre que le dirigeant vient voir.
 *
 * ⚠️ Mise en forme seulement. La valeur reste celle de la base : on n'arrondit pas, on ne
 * convertit pas, on ne complète pas.
 */
function nombreLisible(valeur: number | string): string {
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre.toLocaleString("fr-FR") : String(valeur);
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
