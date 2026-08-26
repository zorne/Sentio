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

  // L'entreprise du compte connecté. RLS borne déjà la lecture à ses appartenances : il n'y a
  // pas d'identifiant à passer, donc pas d'identifiant à falsifier.
  const { data: appartenances } = await supabase.from("tenant_member").select("tenant_id");
  const tenantId = appartenances?.[0]?.tenant_id as string | undefined;

  if (tenantId === undefined) {
    return (
      <ScenteVide
        titre="Votre espace"
        mot="Ce compte n'est rattaché à aucune entreprise. Si vous venez de régler votre abonnement, patientez quelques instants puis rechargez cette page."
      />
    );
  }

  const [{ data: employes }, { data: objectifs }, { data: notifications }, { data: enAttente }] =
    await Promise.all([
      supabase.from("employee").select("id, autonomy, identity_id, en_pause_depuis"),
      supabase.from("objective").select("metric, target_value, horizon").eq("state", "actif"),
      supabase
        .from("notification")
        .select("id, kind, message, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("approval").select("id, requested_at").eq("state", "requested"),
    ]);

  const employe = employes?.[0];

  // ── Aucun employé : l'état vide compte autant que le reste. Un espace qui affiche des cadres
  //    creux se lit comme un produit inachevé (DASH-10).
  if (employe === undefined) {
    return (
      <ScenteVide
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
      .eq("employee_id", employe.id)
      .eq("active", true),
    // La proposition en attente, s'il y en a une. Elle est INACTIVE : elle décrit ce que son
    // employé ferait, pas ce qu'il fait. Rien ne bouge tant que le dirigeant n'a pas répondu.
    supabase
      .from("lady_configuration")
      .select("id, role, priorites, raison, created_at")
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
      .eq("status", "actif")
      .order("usage_count", { ascending: false })
      .limit(5),
    supabase.from("tenant_variant_preference").select("kind, raison"),
  ]);

  const { data: capacites } = configuration
    ? await supabase
        .from("lady_configuration_capability")
        .select("capability(name)")
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

  const capacitesLisibles = (capacites ?? [])
    .map((ligne) => (ligne.capability as { name?: string } | null)?.name)
    .filter((nom): nom is string => typeof nom === "string" && nom.trim() !== "");

  return (
    <Scene
      tenantId={tenantId}
      employeeId={employe.id}
      prenom={identite?.first_name ?? "Votre employé"}
      role={configuration?.role ?? null}
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
      accords={(enAttente ?? []).map((demande) => ({
        id: demande.id as string,
        depuis: dateCourte(demande.requested_at as string),
      }))}
      proposition={
        proposition
          ? {
              id: proposition.id as string,
              role: proposition.role as string,
              priorites: Array.isArray(proposition.priorites)
                ? (proposition.priorites as string[])
                : [],
              raison: proposition.raison as string,
            }
          : null
      }
      faits={(faits ?? []).map((fait) => fait.fact as string)}
      progression={(progression ?? []).map((preference) => ({
        quoi: motDuGenre(preference.kind as string),
        raison: preference.raison as string,
      }))}
      tableau={{
        ...bilan,
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
function ScenteVide({ titre, mot }: { titre: string; mot: string }) {
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
