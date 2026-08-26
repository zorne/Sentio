"use client";

// ════════════════════════════════════════════════════════════════════
// LA SCÈNE — l'espace du dirigeant comme une PRÉSENCE, pas un tableau.
//
// ══ CE QUI A CHANGÉ, ET POURQUOI ══
//
// La version précédente était une pile de huit cartes de texte. Tout y
// était vrai, lisible, justifié — et personne n'ouvrait ça douze fois par
// jour. Un dirigeant ne vient pas lire un rapport : il vient voir si son
// employée tourne, et s'il y a quelque chose à décider.
//
// La scène répond à ces deux questions SANS UNE PHRASE : la silhouette
// est là (elle tourne), un point ambré bat quand quelque chose attend.
// Tout le reste est derrière un geste.
//
// ══ LA RÈGLE DE CE FICHIER ══
//
// **Au repos, la page ne dit presque rien. Rien n'est caché pour autant.**
// Ce qui était accessible l'est resté — l'accord, la proposition, le
// réglage d'autonomie, l'arrêt — mais rangé derrière un clic au lieu
// d'être empilé. Ce qui ATTEND une personne, en revanche, se signale
// toujours de soi-même : c'est la seule chose qui a le droit d'appeler.
//
// ⚠️ La silhouette est ANONYME, et c'est un choix de produit : on vend un
// employé, pas un avatar de personne qui n'existe pas. Un buste filaire
// porte une présence sans prétendre à un visage.
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";

import { AgentHologramStage } from "@/components/landing/AgentHologramStage";

import { ArretDUrgence } from "./ArretDUrgence";
import { Conversation } from "./Conversation";
import { BoutonsDeDecision } from "./BoutonsDeDecision";
import { DecisionSurLaProposition } from "./DecisionSurLaProposition";
import { ReglageDAutonomie } from "./ReglageDAutonomie";
import { Tableau, type DonneesDuTableau } from "./Tableau";

export interface DonneesDeLaScene {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly prenom: string;
  readonly role: string | null;
  readonly arreteDepuis: string | null;
  readonly autonomie: "confirm" | "confirm_once" | "auto";
  readonly capacites: readonly string[];
  readonly priorites: readonly string[];
  readonly raisonDeLaConfiguration: string | null;
  readonly objectif: { readonly cible: string; readonly metrique: string; readonly horizon: string } | null;
  readonly accords: readonly { readonly id: string; readonly depuis: string }[];
  readonly proposition: {
    readonly id: string;
    readonly role: string;
    readonly priorites: readonly string[];
    readonly raison: string;
  } | null;
  readonly faits: readonly string[];
  readonly progression: readonly { readonly quoi: string; readonly raison: string }[];
  readonly journal: readonly { readonly id: string; readonly quand: string; readonly quoi: string }[];
  /** Ce que le dirigeant voit sans cliquer. */
  readonly tableau: DonneesDuTableau;
}

type Panneau = "capacites" | "parler" | "objectif" | "attente" | "memoire" | "main";

const MOTS_DE_L_AUTONOMIE: Record<string, string> = {
  confirm: "Vous validez chaque action qui sort de l'entreprise.",
  confirm_once: "Vous validez la première fois, puis les suivantes se font seules.",
  auto: "Les actions se font sans vous. Vous restez informé.",
};

export function Scene(d: DonneesDeLaScene) {
  const [panneau, setPanneau] = useState<Panneau | null>(null);
  // L'entrée est jouée UNE fois, au montage. Pas à chaque ouverture de tiroir : une scène qui se
  // remonte à chaque geste donne le sentiment que la page recharge.
  const [monte, setMonte] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMonte(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Une décision en attente et une proposition sont la même chose du point de vue du dirigeant :
  // quelque chose s'est arrêté et attend sa réponse. Un seul compteur, un seul point qui bat.
  const enAttente = d.accords.length + (d.proposition ? 1 : 0);
  const arrete = d.arreteDepuis !== null;

  const fermer = useCallback(() => setPanneau(null), []);

  // ── Parallaxe. La présence suit le pointeur de quelques pixels : c'est ce qui fait la
  //    différence entre une image posée sur un fond et quelque chose qui occupe un espace.
  //
  // ⚠️ Bornée à ±1 et lissée par `requestAnimationFrame` : sans la borne, un mouvement rapide
  // envoie la silhouette de travers ; sans le lissage, on repeint à chaque événement de souris,
  // c'est-à-dire des centaines de fois par seconde pour un déplacement de six pixels.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let image = 0;
    const suivre = (e: PointerEvent) => {
      if (image !== 0) return;
      image = requestAnimationFrame(() => {
        image = 0;
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        const racine = document.querySelector<HTMLElement>(".sc");
        racine?.style.setProperty("--px", Math.max(-1, Math.min(1, x)).toFixed(3));
        racine?.style.setProperty("--py", Math.max(-1, Math.min(1, y)).toFixed(3));
      });
    };

    window.addEventListener("pointermove", suivre, { passive: true });
    return () => {
      window.removeEventListener("pointermove", suivre);
      if (image !== 0) cancelAnimationFrame(image);
    };
  }, []);

  // Échap ferme, toujours. Une surface qu'on ouvre d'un clic et dont on ne sort qu'en cherchant
  // la petite croix est une surface dans laquelle on se sent enfermé.
  useEffect(() => {
    if (panneau === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panneau, fermer]);

  return (
    <main
      className={`sc${arrete ? " sc--arrete" : ""}`}
      data-monte={monte ? "1" : "0"}
      data-tiroir={panneau === null ? "0" : "1"}
    >
      {/* ── La barre. Deux informations, aux deux bords : de qui est cet espace, et est-ce que
             ça tourne. Elle ancre la page comme un produit — sans elle, la scène flotte. ── */}
      <header className="sc-barre">
        <span className="sc-marque">Sentio</span>
        <span className={`sc-vie${arrete ? " est-arretee" : ""}`}>
          <i aria-hidden="true" />
          {arrete ? "à l'arrêt" : "en service"}
        </span>
      </header>

      {/* ── La présence. Elle occupe l'écran, et elle est le bouton principal. ── */}
      <div className="sc-scene">
        <button
          type="button"
          className={`sc-corps${panneau === "capacites" ? " est-ouvert" : ""}`}
          onClick={() => setPanneau(panneau === "capacites" ? null : "capacites")}
          aria-expanded={panneau === "capacites"}
          aria-label={`Ce que ${d.prenom} sait faire`}
        >
          {/* Les trois couches de présence. Elles vivent DERRIÈRE l'hologramme, jamais devant :
              ce qu'on regarde est elle, pas la mise en scène. */}
          <span className="sc-aura" aria-hidden="true" />
          <span className="sc-anneau sc-anneau--large" aria-hidden="true" />
          <span className="sc-anneau sc-anneau--serre" aria-hidden="true" />
          <AgentHologramStage />
          {/* Un point par capacité, à la place qu'elle occupera. Au repos, la STRUCTURE se
              devine ; au clic, elle se nomme. C'est ce qui donne envie de cliquer sans qu'aucun
              texte n'ait à le demander. */}
          <span className="sc-jalons" aria-hidden="true">
            {d.capacites.map((capacite, i) => {
              const angle = (i / Math.max(d.capacites.length, 1)) * Math.PI * 2 - Math.PI / 2;
              return (
                <i
                  key={capacite}
                  style={
                    {
                      "--i": i,
                      "--x": `${Math.cos(angle).toFixed(3)}`,
                      "--y": `${Math.sin(angle).toFixed(3)}`,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </span>
          {/* Le halo bat quand quelque chose attend. C'est la seule chose de cette page qui
              a le droit d'appeler le regard sans qu'on le lui demande. */}
          {enAttente > 0 && !arrete ? <span className="sc-halo" aria-hidden="true" /> : null}
        </button>

        {/* Les capacités s'équipent AUTOUR d'elle, en couronne. Chacune part du centre : ce
            sont ses pouvoirs à elle, pas une liste posée à côté.

            ⚠️ Un conteneur ENVELOPPE la liste, et il n'est pas décoratif : sur téléphone, la
            couronne devient une colonne qui doit s'ouvrir et se refermer sans que le nom saute.
            C'est `grid-template-rows: 0fr → 1fr` qui le permet, et cette technique exige un
            enfant unique. Sans lui, il fallait deviner une hauteur maximale — donc se tromper
            dès qu'une capacité de plus est activée. */}
        <div
          className={`sc-couronne${panneau === "capacites" ? " est-ouverte" : ""}`}
          aria-hidden={panneau !== "capacites"}
        >
          <ul>
            {d.capacites.map((capacite, i) => {
              const angle = (i / Math.max(d.capacites.length, 1)) * Math.PI * 2 - Math.PI / 2;
              return (
                <li
                  key={capacite}
                  style={
                    {
                      "--i": i,
                      "--x": `${Math.cos(angle).toFixed(3)}`,
                      "--y": `${Math.sin(angle).toFixed(3)}`,
                    } as React.CSSProperties
                  }
                >
                  {capacite}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="sc-identite">
          <h1>{d.prenom}</h1>
          <p className="sc-etat">
            {arrete ? (
              <span className="sc-arret-mot">À l&apos;arrêt</span>
            ) : d.role ? (
              motDuRole(d.role)
            ) : (
              "en attente de configuration"
            )}
          </p>
        </div>
      </div>

      {/* ── Lui parler. Le geste que tout le monde cherche en premier : il est donc SOUS son
             nom, pas rangé avec les autres — on parle à quelqu'un, on ne consulte pas un menu. ── */}
      <button
        type="button"
        className={`sc-parler${panneau === "parler" ? " est-actif" : ""}`}
        onClick={() => setPanneau(panneau === "parler" ? null : "parler")}
      >
        <span className="sc-parler-onde" aria-hidden="true" />
        Lui parler
      </button>

      {/* ── Ce que ça donne. Visible d'emblée : c'est la première question qu'on se pose en
             ouvrant l'espace, et la faire attendre derrière un clic serait la cacher. ── */}
      <Tableau {...d.tableau} />

      {/* ── Les orbes. Quatre mots, pas une phrase. ── */}
      <nav className="sc-orbes" aria-label="Son travail">
        <Orbe
          nom="Objectif"
          actif={panneau === "objectif"}
          onClick={() => setPanneau(panneau === "objectif" ? null : "objectif")}
        />
        <Orbe
          nom="À décider"
          compte={enAttente}
          alerte={enAttente > 0}
          actif={panneau === "attente"}
          onClick={() => setPanneau(panneau === "attente" ? null : "attente")}
        />
        <Orbe
          nom="Mémoire"
          actif={panneau === "memoire"}
          onClick={() => setPanneau(panneau === "memoire" ? null : "memoire")}
        />
        <Orbe
          nom="Vous"
          alerte={arrete}
          actif={panneau === "main"}
          onClick={() => setPanneau(panneau === "main" ? null : "main")}
        />
      </nav>

      {/* ── Le tiroir. Un seul à la fois : deux surfaces ouvertes, c'est un tableau de bord. ── */}
      {panneau !== null ? (
        <>
          <div className="sc-voile" onClick={fermer} aria-hidden="true" />
          <section className="sc-tiroir" role="dialog" aria-modal="false">
            <button type="button" className="sc-fermer" onClick={fermer} aria-label="Fermer">
              ✕
            </button>

            {panneau === "capacites" ? (
              <Contenu titre={`Ce que ${d.prenom} sait faire`}>
                {d.priorites.length > 0 ? (
                  <ol className="sc-priorites">
                    {d.priorites.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="sc-vide">Ses priorités seront établies avec sa configuration.</p>
                )}
                {d.raisonDeLaConfiguration ? (
                  <p className="sc-note">{d.raisonDeLaConfiguration}</p>
                ) : null}
              </Contenu>
            ) : null}

            {panneau === "parler" ? (
              <Contenu titre={`Demandez à ${d.prenom}`}>
                <Conversation tenantId={d.tenantId} prenom={d.prenom} />
              </Contenu>
            ) : null}

            {panneau === "objectif" ? (
              <Contenu titre="Votre objectif">
                {d.objectif ? (
                  <>
                    <p className="sc-chiffre">
                      {d.objectif.cible} <span>{d.objectif.metrique}</span>
                    </p>
                    <p className="sc-note">par {d.objectif.horizon}</p>
                    <p className="sc-note">
                      La progression s&apos;affichera dès que des résultats auront été déclarés.
                      Nous n&apos;affichons pas de chiffre que rien ne justifie.
                    </p>
                  </>
                ) : (
                  <p className="sc-vide">
                    Aucun objectif déclaré. Votre employé ne travaillera pas tant qu&apos;il
                    n&apos;en a pas.
                  </p>
                )}
              </Contenu>
            ) : null}

            {panneau === "attente" ? (
              <Contenu titre="Ce qui attend votre réponse">
                {d.proposition ? (
                  <div className="sc-proposition">
                    <p className="sc-dit">
                      {d.prenom} se concentrerait plutôt sur{" "}
                      <em>{motDuRole(d.proposition.role)}</em>.
                    </p>
                    <p className="sc-note">{d.proposition.raison}</p>
                    <DecisionSurLaProposition
                      tenantId={d.tenantId}
                      configurationId={d.proposition.id}
                    />
                  </div>
                ) : null}

                {d.accords.map((accord) => (
                  <div key={accord.id} className="sc-accord">
                    <p className="sc-dit">Une action attend votre accord.</p>
                    <p className="sc-note">Depuis le {accord.depuis}.</p>
                    <BoutonsDeDecision approvalId={accord.id} />
                  </div>
                ))}

                {enAttente === 0 ? (
                  <p className="sc-vide">Rien n&apos;attend votre réponse.</p>
                ) : null}
              </Contenu>
            ) : null}

            {panneau === "memoire" ? (
              <Contenu titre={`Ce que ${d.prenom} a appris`}>
                {d.faits.length > 0 ? (
                  <ul className="sc-faits">
                    {d.faits.map((fait) => (
                      <li key={fait}>{fait}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="sc-vide">
                    Rien encore. Elle ne retient que ce qu&apos;elle a réellement observé en
                    travaillant pour vous.
                  </p>
                )}

                {d.progression.length > 0 ? (
                  <ul className="sc-progression">
                    {d.progression.map((p) => (
                      <li key={p.quoi}>
                        <strong>{p.quoi}</strong> {p.raison}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {d.journal.length > 0 ? (
                  <ul className="sc-journal">
                    {d.journal.map((ligne) => (
                      <li key={ligne.id}>
                        <time>{ligne.quand}</time>
                        <span>{ligne.quoi}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Contenu>
            ) : null}

            {panneau === "main" ? (
              <Contenu titre="Ce que vous gardez en main">
                <p className="sc-note">{MOTS_DE_L_AUTONOMIE[d.autonomie]}</p>
                <ReglageDAutonomie
                  tenantId={d.tenantId}
                  employeeId={d.employeeId}
                  niveau={d.autonomie}
                />
                <p className="sc-note">
                  Vous seul pouvez lui donner plus de liberté : ni un diagnostic, ni une mesure de
                  ses résultats ne peut le faire à votre place.
                </p>

                <div className="sc-separateur">
                  {arrete ? (
                    <p className="sc-note">
                      À l&apos;arrêt depuis le {d.arreteDepuis}. Plus rien ne s&apos;ouvre, plus
                      rien ne part. Ce qui était préparé vous attend.
                    </p>
                  ) : (
                    <p className="sc-note">
                      À tout moment, vous pouvez tout arrêter. Rien ne repart ensuite sans vous.
                    </p>
                  )}
                  <ArretDUrgence
                    tenantId={d.tenantId}
                    employeeId={d.employeeId}
                    arrete={arrete}
                  />
                </div>
              </Contenu>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function Orbe({
  nom,
  compte,
  alerte,
  actif,
  onClick,
}: {
  nom: string;
  compte?: number;
  alerte?: boolean;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sc-orbe${actif ? " est-actif" : ""}${alerte ? " est-alerte" : ""}`}
      onClick={onClick}
      aria-pressed={actif}
    >
      <span className="sc-orbe-point" aria-hidden="true" />
      <span className="sc-orbe-nom">{nom}</span>
      {compte !== undefined && compte > 0 ? <span className="sc-orbe-compte">{compte}</span> : null}
    </button>
  );
}

function Contenu({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="sc-contenu">
      <h2>{titre}</h2>
      {children}
    </div>
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
