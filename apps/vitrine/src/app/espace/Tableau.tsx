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

import { useState } from "react";

export interface DonneesDuTableau {
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
      <div className="tb-chiffres">
        <Pastille valeur={d.contactes} mot="entreprises approchées" />
        <Pastille valeur={d.reponses} mot="ont répondu" />
        <Pastille valeur={d.entreprisesEngagees} mot="ont donné une suite" accent />
        <Pastille
          valeur={d.ventes}
          mot={d.ventes > 0 ? `ventes — ${d.chiffreAffaires.toLocaleString("fr-FR")} €` : "vente"}
          accent
        />
      </div>

      <div className="tb-taux">
        <div className="tb-taux-nombre">
          {d.taux.statut === "mesure" ? (
            <>
              <strong>{d.taux.valeur.toLocaleString("fr-FR")} %</strong>
              <span>
                de réponses, sur {d.taux.sur.toLocaleString("fr-FR")} entreprises approchées
              </span>
            </>
          ) : (
            <>
              {/* ⚠️ Pas de « — » ni de case vide : on dit ce qui manque. Un taux calculé sur trop
                  peu d'envois afficherait 50 % le premier jour et 8 % la semaine suivante, et le
                  dirigeant croirait que tout s'écroule. */}
              <strong className="tb-pas-encore">pas encore de taux</strong>
              <span>
                {d.taux.manque.toLocaleString("fr-FR")} entreprises de plus à approcher pour
                qu&apos;un pourcentage veuille dire quelque chose
              </span>
            </>
          )}
        </div>
        <Tendance evolution={d.evolution} />
      </div>

      <Courbe points={d.courbe} jours={d.jours} />
    </section>
  );
}

function Pastille({ valeur, mot, accent }: { valeur: number; mot: string; accent?: boolean }) {
  return (
    <div className={`tb-pastille${accent ? " est-accent" : ""}`}>
      <strong>{valeur.toLocaleString("fr-FR")}</strong>
      <span>{mot}</span>
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
      {evolution.sens === "hausse" ? "▲" : "▼"} {evolution.points.toLocaleString("fr-FR")} points
      {evolution.sens === "hausse" ? " de mieux" : " de moins"} sur la seconde moitié de la période
    </p>
  );
}

/**
 * La courbe des entreprises approchées, jour par jour.
 *
 * ⚠️ **Tous les jours sont là, y compris les jours vides.** Une courbe qui saute les jours sans
 * travail relie lundi à jeudi en ligne droite et donne à voir une progression continue là où il
 * ne s'est rien passé.
 *
 * Une seule série : donc une seule couleur, et aucune légende — le titre la nomme. Les valeurs ne
 * sont pas écrites sur chaque point (ce serait illisible) : elles apparaissent au survol.
 */
function Courbe({
  points,
  jours,
}: {
  points: DonneesDuTableau["courbe"];
  jours: number;
}) {
  const [survole, setSurvole] = useState<number | null>(null);

  if (points.length < 2) return null;

  const L = 300;
  const H = 64;
  // Une marge latérale : sans elle, le trait du premier et du dernier jour est coupé en deux par
  // le bord du cadre — et le point de survol du dernier jour déborde du conteneur.
  const MARGE = 3;
  const x = (i: number) => MARGE + (i / (points.length - 1)) * (L - MARGE * 2);
  // Le tracé garde une marge en haut et en bas : une courbe qui touche le bord se lit comme
  // tronquée, et son maximum devient indistinguable d'un dépassement.
  const y = (part: number) => H - MARGE - part * (H - MARGE * 3);

  const trace = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.part).toFixed(1)}`).join(" ");
  const surface = `${trace} L ${x(points.length - 1).toFixed(1)} ${H} L ${MARGE} ${H} Z`;
  const actif = survole === null ? null : points[survole];

  return (
    <figure className="tb-courbe">
      <figcaption>
        Entreprises approchées, jour par jour — {jours} derniers jours
        {actif ? (
          <span className="tb-point-lu">
            {dateCourte(actif.jour)} · {actif.valeur.toLocaleString("fr-FR")}
          </span>
        ) : null}
      </figcaption>

      <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Entreprises approchées sur ${jours} jours`}>
        <defs>
          {/* Le remplissage s'éteint vers le bas : il donne du poids à la courbe sans dessiner
              un bloc de couleur qui écraserait le trait. */}
          <linearGradient id="tb-degrade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="tb-surface" d={surface} />
        <path className="tb-trace" d={trace} />
        {actif ? (
          <>
            <line className="tb-viseur" x1={x(survole!)} y1={0} x2={x(survole!)} y2={H} />
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
    </figure>
  );
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
