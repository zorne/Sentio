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

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

import { BoutonsDeDecision } from "./BoutonsDeDecision";
import { DecisionSurLaProposition } from "./DecisionSurLaProposition";
import { ReglageDAutonomie } from "./ReglageDAutonomie";
import "./espace.css";

export const dynamic = "force-dynamic";

const MOTS_DE_L_AUTONOMIE: Record<string, string> = {
  confirm: "Vous validez chaque action qui sort de l'entreprise.",
  confirm_once: "Vous validez la première fois, puis les suivantes se font seules.",
  auto: "Les actions se font sans vous. Vous restez informé.",
};

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
      <main className="espace">
        <h1>Votre espace</h1>
        <p className="vide">
          Ce compte n'est rattaché à aucune entreprise. Si vous venez de régler votre abonnement,
          patientez quelques instants puis rechargez cette page.
        </p>
      </main>
    );
  }

  const [{ data: employes }, { data: objectifs }, { data: notifications }, { data: enAttente }] =
    await Promise.all([
      supabase.from("employee").select("id, autonomy, identity_id"),
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
      <main className="espace">
        <h1>Votre espace</h1>
        <p className="vide">
          Aucun employé n'a encore rejoint votre entreprise. Il apparaîtra ici dès que votre
          recrutement sera confirmé.
        </p>
      </main>
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

  const { data: capacites } = configuration
    ? await supabase
        .from("lady_configuration_capability")
        .select("capability(name)")
        .eq("configuration_id", configuration.id)
    : { data: null };

  const prenom = identite?.first_name ?? "Votre employé";
  const priorites = Array.isArray(configuration?.priorites)
    ? (configuration.priorites as string[])
    : [];

  return (
    <main className="espace">
      <header className="entete">
        <h1>{prenom}</h1>
        {configuration ? (
          <p className="role">
            Se concentre actuellement sur <strong>{motDuRole(configuration.role)}</strong>.
          </p>
        ) : (
          <p className="vide">
            Sa configuration n'est pas encore établie. Il ne travaillera pas tant qu'elle ne l'est
            pas — nous ne lui inventons pas un rôle.
          </p>
        )}
      </header>

      {/* ── Ce que le dirigeant a demandé, et ce qui a été fait. Rien d'estimé. ── */}
      <section className="carte">
        <h2>Votre objectif</h2>
        {objectif ? (
          <>
            <p className="chiffre">
              {objectif.target_value} <span>{motDeLaMetrique(objectif.metric)}</span>
            </p>
            <p className="detail">par {objectif.horizon}</p>
            <p className="detail sobre">
              La progression s'affichera ici dès que des résultats auront été déclarés. Nous
              n'affichons pas de chiffre que rien ne justifie.
            </p>
          </>
        ) : (
          <p className="vide">
            Aucun objectif déclaré. Votre employé ne travaillera pas tant qu'il n'en a pas : un
            employé lancé sans but travaille pour personne.
          </p>
        )}
      </section>

      {/* ── Ce qu'il sait faire pour vous — et rien de plus. ── */}
      <section className="carte">
        <h2>Ce qu'il fait pour vous</h2>
        {priorites.length > 0 ? (
          <ol className="priorites">
            {priorites.map((priorite) => (
              <li key={priorite}>{priorite}</li>
            ))}
          </ol>
        ) : (
          <p className="vide">Ses priorités seront établies avec sa configuration.</p>
        )}

        {capacites && capacites.length > 0 ? (
          <ul className="capacites">
            {capacites.map((ligne, rang) => (
              <li key={rang}>
                {(ligne.capability as { name?: string } | null)?.name ?? "capacité"}
              </li>
            ))}
          </ul>
        ) : null}

        {configuration?.raison ? (
          <p className="detail sobre">Pourquoi ce choix : {configuration.raison}</p>
        ) : null}
      </section>

      {/* ── Ce que son employé PROPOSE. Il ne l'a pas fait : il le demande (§10). ── */}
      {proposition ? (
        <section className="carte proposition">
          <h2>{prenom} propose de changer sa façon de travailler</h2>
          <p className="detail">
            Au vu de ses résultats, il se concentrerait plutôt sur{" "}
            <strong>{motDuRole(proposition.role)}</strong>.
          </p>
          {Array.isArray(proposition.priorites) && proposition.priorites.length > 0 ? (
            <ol className="priorites">
              {(proposition.priorites as string[]).map((priorite) => (
                <li key={priorite}>{priorite}</li>
              ))}
            </ol>
          ) : null}
          <p className="detail sobre">Ce qu'il a observé : {proposition.raison}</p>
          <DecisionSurLaProposition tenantId={tenantId} configurationId={proposition.id} />
          <p className="detail sobre">
            Rien ne change tant que vous n'avez pas répondu. Si vous préférez ne rien changer, il
            continue exactement comme aujourd'hui.
          </p>
        </section>
      ) : null}

      {/* ── Ce qui attend une décision. C'est le seul endroit où Lady s'arrête. ── */}
      <section className="carte">
        <h2>Ce qui attend votre accord</h2>
        {enAttente && enAttente.length > 0 ? (
          <ul className="attente">
            {enAttente.map((demande) => (
              <li key={demande.id}>
                <span>Une action attend votre accord depuis le {dateCourte(demande.requested_at)}.</span>
                <BoutonsDeDecision approvalId={demande.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="vide">Rien n'attend votre accord.</p>
        )}
      </section>

      {/* ── Le réglage le plus lourd du produit. Il publie une version, il ne modifie rien. ── */}
      <section className="carte">
        <h2>Son autonomie</h2>
        <p className="detail">{MOTS_DE_L_AUTONOMIE[employe.autonomy] ?? ""}</p>
        <ReglageDAutonomie
          tenantId={tenantId}
          employeeId={employe.id}
          niveau={employe.autonomy as "confirm" | "confirm_once" | "auto"}
        />
        <p className="detail sobre">
          Chaque changement est daté et conservé : vous pourrez toujours savoir ce qui était réglé,
          et quand.
        </p>
      </section>

      {/* ── Ce qui s'est passé. ── */}
      <section className="carte">
        <h2>Ce qui s'est passé</h2>
        {notifications && notifications.length > 0 ? (
          <ul className="notifications">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <time>{dateCourte(notification.created_at)}</time>
                <span>{notification.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vide">Rien à signaler pour l'instant.</p>
        )}
      </section>
    </main>
  );
}

/** Le rôle est une clé technique ; le dirigeant lit une phrase. */
function motDuRole(role: string): string {
  const mots: Record<string, string> = {
    prospection: "aller chercher de nouvelles entreprises",
    qualification: "ne retenir que les bonnes entreprises",
    relation_client: "reprendre vos demandes entrantes",
    administration_commerciale: "tenir vos fiches à jour",
    administration: "vos tâches administratives",
    suivi: "surveiller vos échéances",
    pilotage: "vous rendre compte de ce qui avance",
  };
  return mots[role] ?? role;
}

function motDeLaMetrique(metric: string): string {
  const mots: Record<string, string> = {
    rendez_vous_qualifies: "rendez-vous qualifiés",
    chiffre_affaires: "€ de chiffre d'affaires",
  };
  return mots[metric] ?? metric;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
