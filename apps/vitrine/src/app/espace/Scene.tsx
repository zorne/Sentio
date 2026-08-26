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
  /**
   * Ce qui attend un accord, EN TOUTES LETTRES.
   *
   * ⚠️ Jamais « une action attend votre accord ». On demande au dirigeant d'autoriser une action
   * irréversible : lui cacher laquelle rend la garde inutile (il clique sans savoir) ou bloquante
   * (il n'ose pas cliquer).
   */
  readonly accords: readonly {
    readonly id: string;
    readonly depuis: string;
    readonly quoi: string;
    readonly entreprise: string | null;
    readonly contact: string | null;
    readonly objet: string | null;
    readonly corps: string | null;
    readonly pourquoi: string | null;
  }[];
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
  /**
   * Ce qu'il faut savoir avant chaque rendez-vous obtenu.
   *
   * ⚠️ Chaque élément porte sa PROVENANCE. Le texte des réponses reçues n'est stocké nulle part :
   * ce qui vient de l'échange, ce sont les **notes consignées** par l'employée.
   */
  readonly rendezVous: readonly {
    readonly leadId: string;
    readonly entreprise: string;
    readonly contact: string | null;
    readonly fonction: string | null;
    readonly secteur: string | null;
    readonly pourquoiRetenue: string | null;
    readonly dernierObjet: string | null;
    readonly dernierEnvoi: string | null;
    readonly messagesEnvoyes: number;
    readonly depuis: string | null;
    readonly obtenuLe: string;
    readonly notes: readonly { readonly note: string; readonly quand: string }[];
  }[];
  /** Ce qui a abouti — NOMMÉ selon le rôle, jamais dérivé d'un métier en base (adr/0029). */
  readonly recolte: {
    readonly titre: string;
    readonly vide: string;
    readonly lignes: readonly {
      readonly entreprise: string;
      readonly contact: string | null;
      readonly quoi: string;
      readonly valeur: number;
      readonly quand: string;
    }[];
  };
  /** Sa formule et ce qu'il lui reste. Nul quand aucun abonnement n'est actif. */
  readonly formule: {
    readonly nom: string;
    readonly jusquAu: string;
    readonly missions: Consommation;
    readonly messages: Consommation;
    readonly messagesDuJour: Consommation;
  } | null;
}

/** Ce qui a été consommé, et la limite. Jamais un pourcentage — voir `Jauge`. */
export interface Consommation {
  readonly fait: number;
  readonly plafond: number | null;
}

type Panneau =
  | "capacites"
  | "parler"
  | "objectif"
  | "attente"
  | "memoire"
  | "recolte"
  | "rendezvous"
  | "main";

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
      {/* ── La barre. Des icônes, pas des mots : le nom apparaît au survol.
             ⚠️ Ce qui attend une réponse est une NOTIFICATION — une boîte aux lettres avec un
             point rouge — et pas une pastille de plus. C'est le seul élément de cette barre qui
             a le droit d'appeler le regard, et il ne le fait que s'il a quelque chose à dire. ── */}
      <nav className="sc-orbes" aria-label="Son travail">
        <Orbe
          nom="À décider"
          icone="boite"
          compte={enAttente}
          alerte={enAttente > 0}
          actif={panneau === "attente"}
          onClick={() => setPanneau(panneau === "attente" ? null : "attente")}
        />
        <Orbe
          nom="Ce qu'elle a appris"
          icone="progres"
          actif={panneau === "memoire"}
          onClick={() => setPanneau(panneau === "memoire" ? null : "memoire")}
        />
        <Orbe
          nom={d.recolte.titre}
          icone="recolte"
          compte={d.recolte.lignes.length}
          actif={panneau === "recolte"}
          onClick={() => setPanneau(panneau === "recolte" ? null : "recolte")}
        />
        <Orbe
          nom="Avant vos rendez-vous"
          icone="rendezvous"
          compte={d.rendezVous.length}
          actif={panneau === "rendezvous"}
          onClick={() => setPanneau(panneau === "rendezvous" ? null : "rendezvous")}
        />
        <Orbe
          nom="Votre objectif"
          icone="objectif"
          actif={panneau === "objectif"}
          onClick={() => setPanneau(panneau === "objectif" ? null : "objectif")}
        />
        <Orbe
          nom="Vous"
          icone="vous"
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
                    <p className="sc-dit">
                      {accord.quoi}
                      {accord.entreprise ? (
                        <>
                          {" à "}
                          <em>{accord.entreprise}</em>
                        </>
                      ) : null}
                      {accord.contact ? `, ${accord.contact}` : ""}
                    </p>

                    {/* Le message, tel qu'il partirait. C'est ce qu'on autorise : le lui cacher
                        reviendrait à lui faire signer une page blanche. */}
                    {accord.objet || accord.corps ? (
                      <div className="ac-message">
                        {accord.objet ? <p className="ac-objet">{accord.objet}</p> : null}
                        {accord.corps ? <p className="ac-corps">{accord.corps}</p> : null}
                      </div>
                    ) : (
                      <p className="sc-note">
                        Le contenu de cette action n&apos;a pas été retrouvé au journal. Ne
                        l&apos;autorisez pas sans savoir ce qu&apos;elle contient.
                      </p>
                    )}

                    {accord.pourquoi ? (
                      <p className="sc-note">Pourquoi elle le propose : {accord.pourquoi}</p>
                    ) : null}
                    <p className="sc-note">En attente depuis le {accord.depuis}.</p>

                    <BoutonsDeDecision approvalId={accord.id} />
                  </div>
                ))}

                {enAttente === 0 ? (
                  <p className="sc-vide">Rien n&apos;attend votre réponse.</p>
                ) : null}
              </Contenu>
            ) : null}

            {panneau === "rendezvous" ? (
              <Contenu titre="Avant vos rendez-vous">
                {d.rendezVous.length > 0 ? (
                  <div className="rv">
                    {d.rendezVous.map((r) => (
                      <article key={r.leadId} className="rv-fiche">
                        <header>
                          <strong>{r.entreprise}</strong>
                          {r.contact ? (
                            <span className="rv-qui">
                              {r.contact}
                              {r.fonction ? `, ${r.fonction}` : ""}
                            </span>
                          ) : null}
                          <time>obtenu le {r.obtenuLe}</time>
                        </header>

                        {/* ⚠️ Chaque ligne dit D'OÙ elle vient. Un briefing dont on ignore la
                            provenance ne se défend pas en réunion. */}
                        {r.notes.length > 0 ? (
                          <ul className="rv-notes">
                            {r.notes.map((n) => (
                              <li key={n.quand}>
                                <span className="rv-source">Ce qu&apos;elle a retenu, le {n.quand}</span>
                                {n.note}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="rv-rien">
                            Rien n&apos;a été consigné sur cet échange. Je ne garde pas le texte
                            des réponses reçues, seulement ce que j&apos;en ai noté.
                          </p>
                        )}

                        <dl className="rv-faits">
                          {r.pourquoiRetenue ? (
                            <>
                              <dt>Pourquoi elle a été retenue</dt>
                              <dd>{r.pourquoiRetenue}</dd>
                            </>
                          ) : null}
                          {r.dernierObjet ? (
                            <>
                              <dt>Dernier message envoyé</dt>
                              <dd>
                                « {r.dernierObjet} »{r.dernierEnvoi ? `, envoyé le ${r.dernierEnvoi}` : ""}
                              </dd>
                            </>
                          ) : null}
                          {r.secteur ? (
                            <>
                              <dt>Secteur</dt>
                              <dd>{r.secteur}</dd>
                            </>
                          ) : null}
                          {r.messagesEnvoyes > 0 ? (
                            <>
                              <dt>Échange</dt>
                              <dd>
                                {r.messagesEnvoyes.toLocaleString("fr-FR")} message
                                {r.messagesEnvoyes > 1 ? "s" : ""} envoyé
                                {r.messagesEnvoyes > 1 ? "s" : ""}
                                {r.depuis ? `, depuis le ${r.depuis}` : ""}
                              </dd>
                            </>
                          ) : null}
                        </dl>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="sc-vide">
                    Aucun rendez-vous en attente. Vous verrez ici, avant chacun, ce qu&apos;il faut
                    savoir : ce qu&apos;elle a retenu de l&apos;échange, ce qui a été écrit, et
                    pourquoi cette entreprise a été retenue.
                  </p>
                )}
              </Contenu>
            ) : null}

            {panneau === "recolte" ? (
              <Contenu titre={d.recolte.titre}>
                {d.recolte.lignes.length > 0 ? (
                  <ul className="rc">
                    {d.recolte.lignes.map((ligne) => (
                      <li key={`${ligne.entreprise}-${ligne.quand}`}>
                        <span className="rc-qui">
                          <strong>{ligne.entreprise}</strong>
                          {ligne.contact ? <em>, {ligne.contact}</em> : null}
                        </span>
                        <span className="rc-quoi">
                          {ligne.quoi}
                          {ligne.valeur > 0 ? ` pour ${ligne.valeur.toLocaleString("fr-FR")} €` : ""}
                        </span>
                        <time>{ligne.quand}</time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sc-vide">{d.recolte.vide}</p>
                )}
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
                {/* ── Ce qu'il paie, et ce qui lui reste. Le grief le plus répété contre les
                       produits concurrents, après la qualité, est l'OPACITÉ : coûts qui montent
                       sans qu'on sache pourquoi, abonnement qu'on ne sait pas résilier. La
                       réponse n'est pas une page de tarifs — c'est de le montrer ici. ── */}
                {d.formule ? (
                  <div className="sc-formule">
                    <p className="sc-dit">Formule {d.formule.nom}</p>
                    <p className="sc-note">Période en cours jusqu&apos;au {d.formule.jusquAu}.</p>

                    <Jauge mot="missions ce mois" c={d.formule.missions} />
                    <Jauge mot="messages ce mois" c={d.formule.messages} />
                    <Jauge mot="messages aujourd&apos;hui" c={d.formule.messagesDuJour} />

                    {/* ⚠️ Pas de montant : le prix vit chez le prestataire de paiement, pas en
                        base. L'écrire ici afficherait un chiffre que rien ne garantit — et le
                        jour où un tarif change, l'espace mentirait à celui qui paie. */}
                    <p className="sc-note">
                      Rien ne s&apos;ajoute à votre facture sans que vous l&apos;ayez décidé : au
                      bout de ces plafonds, votre employée s&apos;arrête et vous le dit.
                    </p>
                  </div>
                ) : (
                  <p className="sc-vide">
                    Aucun abonnement actif. Votre employée ne travaillera pas tant qu&apos;il
                    n&apos;y en a pas.
                  </p>
                )}

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
  icone,
  compte,
  alerte,
  actif,
  onClick,
}: {
  nom: string;
  icone: NomDIcone;
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
      aria-label={nom}
      title={nom}
    >
      <Icone nom={icone} />
      {/* Le nom n'apparaît qu'au survol : une barre de cinq libellés redevient un menu, et la
          page cesse d'être une scène. */}
      <span className="sc-orbe-nom">{nom}</span>
      {compte !== undefined && compte > 0 ? (
        <span className={`sc-orbe-compte${alerte ? " est-alerte" : ""}`}>{compte}</span>
      ) : null}
    </button>
  );
}

type NomDIcone = "boite" | "progres" | "recolte" | "rendezvous" | "objectif" | "vous";

/**
 * Les icônes, dessinées à la main en SVG.
 *
 * ⚠️ Aucune bibliothèque : cinq traits ne valent pas une dépendance livrée au navigateur, et une
 * police d'icônes ferait apparaître des carrés le temps de son chargement. `currentColor` partout,
 * pour qu'elles s'allument avec le reste de l'orbe sans une seule règle de plus.
 */
function Icone({ nom }: { nom: NomDIcone }) {
  const commun = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (nom) {
    // La boîte aux lettres : c'est l'image que tout le monde reconnaît pour « il y a quelque
    // chose pour vous, et personne ne l'ouvrira à votre place ».
    case "boite":
      return (
        <svg {...commun}>
          <path d="M3 8.5 12 14l9-5.5" />
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
        </svg>
      );
    // Une courbe qui monte : ce qu'elle a appris se voit à ce qui progresse.
    case "progres":
      return (
        <svg {...commun}>
          <path d="M3 17.5 9 11l4 4 7.5-8" />
          <path d="M15 3.5h5.5V9" />
        </svg>
      );
    // Une étoile : ce qui a abouti, et qui compte plus que le volume.
    case "recolte":
      return (
        <svg {...commun}>
          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8z" />
        </svg>
      );
    // Deux personnes face à face : un rendez-vous, c'est une conversation à préparer.
    case "rendezvous":
      return (
        <svg {...commun}>
          <circle cx="8" cy="9" r="2.6" />
          <circle cx="16" cy="9" r="2.6" />
          <path d="M3 19c0-2.6 2.2-4 5-4s5 1.4 5 4" />
          <path d="M13.5 19c0-2.6 1.9-4 4.5-4 1.4 0 2.6.4 3.5 1.1" />
        </svg>
      );
    case "objectif":
      return (
        <svg {...commun}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.6" fill="currentColor" />
        </svg>
      );
    // Une personne : ce que le dirigeant garde en main.
    case "vous":
      return (
        <svg {...commun}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
        </svg>
      );
  }
}

/**
 * Une jauge — et surtout PAS un pourcentage.
 *
 * Le nombre consommé ET la limite sont écrits en toutes lettres : « 41 sur 300 ». Un pourcentage
 * obligerait le lecteur à refaire le calcul dans l'autre sens pour obtenir ce qu'il cherche
 * vraiment, c'est-à-dire ce qu'il lui reste.
 *
 * ⚠️ Sans plafond, aucune piste n'est dessinée : une jauge sans bord se lit comme une jauge
 * pleine, donc comme une limite atteinte.
 */
function Jauge({ mot, c }: { mot: string; c: Consommation }) {
  const part = c.plafond === null || c.plafond === 0 ? 0 : Math.min(c.fait / c.plafond, 1);
  // À 80 %, on le signale — pendant qu'il reste le temps d'y faire quelque chose. Prévenir à
  // 100 % serait annoncer un arrêt déjà survenu.
  const serre = c.plafond !== null && part >= 0.8;

  return (
    <div className={`ab-jauge${serre ? " est-serre" : ""}`}>
      <span className="ab-jauge-mot">{mot}</span>
      <span className="ab-jauge-nombre">
        {c.fait.toLocaleString("fr-FR")}
        {c.plafond === null ? (
          <em>, sans plafond</em>
        ) : (
          <em> sur {c.plafond.toLocaleString("fr-FR")}</em>
        )}
      </span>
      {c.plafond === null ? null : (
        <span className="ab-jauge-piste" aria-hidden="true">
          <i style={{ width: `${(part * 100).toFixed(1)}%` }} />
        </span>
      )}
    </div>
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
