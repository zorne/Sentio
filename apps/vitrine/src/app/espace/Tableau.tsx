"use client";

// ════════════════════════════════════════════════════════════════════
// LE TABLEAU — ce que le dirigeant voit SANS cliquer.
//
// ⚠️ TOUT CE QUI EST AFFICHÉ ICI VIENT D'UNE LIGNE EN BASE.
//
// Aucun chiffre estimé, aucune projection, aucun « équivalent temps
// gagné ». Ce qui n'est pas mesuré n'est pas affiché — et quand un
// chiffre n'est pas encore mesurable, on écrit POURQUOI plutôt que de
// laisser une case vide qui ressemble à une panne.
//
// ══ LA FORME, ET POURQUOI CELLE-LÀ ══
//
// Quatre nombres et une courbe. Ce ne sont pas des graphiques : une
// poignée de valeurs de tête se lit en pastilles, pas en histogramme —
// un graphique à quatre barres demande au lecteur de mesurer avec les
// yeux ce qu'un chiffre lui donnerait directement.
//
// La courbe, elle, porte la seule question qui demande une FORME :
// est-ce que ça progresse. Une seule série, donc une seule couleur et
// aucune légende — le titre la nomme.
// ════════════════════════════════════════════════════════════════════

import type { MotsDesIndicateurs } from "@sentio/domain";
import { useState } from "react";

export interface DonneesDuTableau {
  /**
   * Les mots de son travail, décidés par son RÔLE.
   *
   * ⚠️ Ce tableau annonçait « entreprises approchées » et « ventes déclarées » en dur. Ces mots
   * sont justes pour une employée qui prospecte, et faux dès que le diagnostic en compose une qui
   * tient une comptabilité ou reprend des demandes. Les faits sont les mêmes pour tout le monde ;
   * seuls les mots changent (`adr/0029`).
   */
  readonly mots: MotsDesIndicateurs;
  readonly contactes: number;
  readonly reponses: number;
  readonly rendezVous: number;
  readonly ventes: number;
  readonly chiffreAffaires: number;
  readonly entreprisesEngagees: number;
  readonly jours: number;
  /** Le taux de réponse, ou la raison pour laquelle il n'y en a pas encore. */
  readonly taux:
    | { readonly statut: "mesure"; readonly valeur: number; readonly sur: number }
    | { readonly statut: "trop_tot"; readonly manque: number; readonly sur: number };
  readonly evolution:
    | { readonly statut: "trop_tot"; readonly motif: string }
    | { readonly statut: "stable" }
    | { readonly statut: "bouge"; readonly points: number; readonly sens: "hausse" | "baisse" };
  /** La série, déjà ramenée entre 0 et 1, avec ses valeurs réelles pour l'infobulle. */
  readonly courbe: readonly { readonly jour: string; readonly part: number; readonly valeur: number }[];
}

export function Tableau(d: DonneesDuTableau) {
  return (
    <section className="tb" aria-label="Ce que votre employée a produit">
      {/* ── Les indicateurs. Une valeur, un libellé, un filet entre chacun : alignés sur une
             ligne de base commune, ils se lisent d'un balayage. Empilés sans structure, ils se
             lisent un par un. ── */}
      <dl className="tb-chiffres">
        <Pastille valeur={d.contactes} mot={d.mots.touches} />
        <Pastille valeur={d.reponses} mot={d.mots.reponses} />
        <Pastille valeur={d.entreprisesEngagees} mot={d.mots.suites} accent />
        <Pastille
          valeur={d.ventes}
          mot="ventes déclarées"
          {...(d.ventes > 0 && { precision: `${d.chiffreAffaires.toLocaleString("fr-FR")} €` })}
          accent
        />
      </dl>

      <div className="tb-taux">
        {d.taux.statut === "mesure" ? (
          <>
            <p className="tb-taux-nombre">
              <strong>{d.taux.valeur.toLocaleString("fr-FR")} %</strong>
              <span>taux de réponse</span>
            </p>
            <p className="tb-taux-base">
              Mesuré sur {d.taux.sur.toLocaleString("fr-FR")} {d.mots.touches}.
            </p>
          </>
        ) : (
          <>
            {/* ⚠️ Pas de « — » ni de case vide : on dit ce qui manque. Un taux calculé sur trop
                peu d'envois afficherait 50 % le premier jour et 8 % la semaine suivante, et le
                dirigeant croirait que tout s'écroule. */}
            <p className="tb-taux-nombre">
              <strong className="tb-pas-encore">pas encore de taux</strong>
            </p>
            <p className="tb-taux-base">
              Il faut {d.taux.manque.toLocaleString("fr-FR")} entreprises de plus pour qu&apos;un
              pourcentage veuille dire quelque chose.
            </p>
          </>
        )}
        <Tendance evolution={d.evolution} />
      </div>

      <Courbe points={d.courbe} jours={d.jours} mots={d.mots} />
    </section>
  );
}

function Pastille({
  valeur,
  mot,
  precision,
  accent,
}: {
  valeur: number;
  mot: string;
  precision?: string;
  accent?: boolean;
}) {
  return (
    <div className={`tb-pastille${accent ? " est-accent" : ""}`}>
      <dt>{mot}</dt>
      <dd>
        <strong>{valeur.toLocaleString("fr-FR")}</strong>
        {precision ? <span>{precision}</span> : null}
      </dd>
    </div>
  );
}

function Tendance({ evolution }: { evolution: DonneesDuTableau["evolution"] }) {
  if (evolution.statut === "trop_tot") {
    return <p className="tb-tendance tb-tendance--muette">{evolution.motif}</p>;
  }
  if (evolution.statut === "stable") {
    return <p className="tb-tendance">Stable d&apos;une moitié de période à l&apos;autre.</p>;
  }
  return (
    <p className={`tb-tendance tb-tendance--${evolution.sens}`}>
      <span className="tb-delta">
        {evolution.sens === "hausse" ? "▲" : "▼"} {evolution.points.toLocaleString("fr-FR")} pts
      </span>
      sur la seconde moitié de la période
    </p>
  );
}

/**
 * La courbe de ce qui a été traité, jour par jour, dans les mots de son rôle.
 *
 * ══ CE QUI LA REND LISIBLE, ET PAS SEULEMENT JOLIE ══
 *
 * Une ligne seule n'est pas un graphique : elle montre une forme sans donner d'ordre de grandeur.
 * Trois ajouts suffisent, et aucun de plus :
 *
 *   · **une graduation haute**, qui porte le maximum de la période. Sans elle, la même courbe
 *     décrit aussi bien 4 envois par jour que 400 ;
 *   · **une ligne de sol**, pour que le zéro soit une position et non une absence ;
 *   · **les deux bornes de dates**, aux extrémités. Un axe complet serait illisible sur 300 px
 *     de large — et personne n'a besoin de lire le douzième jour.
 *
 * ⚠️ Toujours **une seule série**, donc une seule couleur et **aucune légende** : la légende du
 * dessous la nomme. Et jamais un point sur chaque jour : quatorze marqueurs transforment une
 * tendance en nuage. Le point n'apparaît qu'au survol, là où le regard est déjà.
 */
function Courbe({
  points,
  jours,
  mots,
}: {
  points: DonneesDuTableau["courbe"];
  jours: number;
  mots: MotsDesIndicateurs;
}) {
  const [survole, setSurvole] = useState<number | null>(null);

  if (points.length < 2) return null;

  const L = 300;
  const H = 72;
  // Une marge latérale : sans elle, le trait du premier et du dernier jour est coupé en deux par
  // le bord du cadre, et le point de survol du dernier jour déborde du conteneur.
  const MARGE = 3;
  const HAUT = 10; // la graduation haute vit ici
  const SOL = H - 4;

  const x = (i: number) => MARGE + (i / (points.length - 1)) * (L - MARGE * 2);
  const y = (part: number) => SOL - part * (SOL - HAUT);

  const trace = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.part).toFixed(1)}`)
    .join(" ");
  const surface = `${trace} L ${x(points.length - 1).toFixed(1)} ${SOL} L ${MARGE} ${SOL} Z`;
  const actif = survole === null ? null : points[survole];
  const maximum = Math.max(...points.map((p) => p.valeur), 0);

  return (
    <figure className="tb-courbe">
      <figcaption>
        <span>{mots.courbe}</span>
        <span className="tb-fenetre">{jours} derniers jours</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${L} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Entreprises approchées sur ${jours} jours, maximum ${maximum} en une journée`}
      >
        <defs>
          {/* Le remplissage s'éteint vers le bas : il donne du poids à la courbe sans dessiner
              un bloc de couleur qui écraserait le trait. */}
          <linearGradient id="tb-degrade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* La graduation et le sol : récessifs, en pointillé pour le haut — une ligne pleine
            entrerait en concurrence avec la courbe qu'elle sert à mesurer. */}
        <line className="tb-graduation" x1={MARGE} y1={HAUT} x2={L - MARGE} y2={HAUT} />
        <line className="tb-sol" x1={MARGE} y1={SOL} x2={L - MARGE} y2={SOL} />

        <path className="tb-surface" d={surface} />
        <path className="tb-trace" d={trace} />

        {actif ? (
          <>
            <line className="tb-viseur" x1={x(survole!)} y1={HAUT} x2={x(survole!)} y2={SOL} />
            <circle className="tb-pointeur" cx={x(survole!)} cy={y(actif.part)} r={3} />
          </>
        ) : null}

        {/* Des cibles de survol plus larges que les points : viser un point de 3 px à la souris
            est un exercice, pas une lecture. */}
        {points.map((p, i) => (
          <rect
            key={p.jour}
            x={x(i) - (L - MARGE * 2) / points.length / 2}
            y={0}
            width={(L - MARGE * 2) / points.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setSurvole(i)}
            onMouseLeave={() => setSurvole(null)}
          />
        ))}
      </svg>

      {/* L'échelle et les bornes, en dehors du SVG : le texte d'un SVG étiré par
          `preserveAspectRatio="none"` se déforme avec lui. */}
      <div className="tb-echelle">
        <span className="tb-max">{maximum.toLocaleString("fr-FR")} le jour le plus fort</span>
        <span className="tb-bornes">
          {points[0] ? dateCourte(points[0].jour) : ""}
          <i />
          {points[points.length - 1] ? dateCourte(points[points.length - 1]!.jour) : ""}
        </span>
      </div>

      <p className={`tb-lu${actif ? " est-lu" : ""}`}>
        {actif
          ? `${dateCourte(actif.jour)} : ${actif.valeur.toLocaleString("fr-FR")} approchées`
          : "Survolez la courbe pour lire un jour."}
      </p>
    </figure>
  );
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
