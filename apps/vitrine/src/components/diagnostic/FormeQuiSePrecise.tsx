"use client";

// ════════════════════════════════════════════════════════════════════════════════════════════
// LA FORME QUI SE PRÉCISE — ce qui se passe à l'écran pendant qu'on parle.
//
// ══ POURQUOI ELLE EXISTE ══
//
// La page d'accueil promet que l'employé « se dessine sous vos yeux ». Pendant la conversation,
// il ne se passait rien : une phrase, une ligne, un fond noir. Le visiteur parlait à un vide, et
// rien ne lui disait qu'il avançait.
//
// ⚠️ ET SURTOUT : ELLE NE MENT PAS.
//
// Une barre « profil complété à 60 % » aurait été un chiffre inventé — le moteur décide seul
// quand il en sait assez, et l'écran n'a aucun moyen de le savoir avant lui. Ce qu'on peut
// montrer honnêtement, c'est le NOMBRE D'ÉCHANGES : à chaque réponse, un trait de plus, et les
// précédents deviennent plus nets. On ne promet aucune fin, on montre que ça prend forme.
//
// ══ TROIS DÉCISIONS DE FORME ══
//
// 1. **Elle ne bouge QUE quand quelque chose change.** Pas de rotation lente, pas de respiration.
//    Une lueur qui vit en permanence cesse d'être un signal en deux jours — c'est la règle du
//    fondateur, et elle vaut ici : le seul mouvement de cet écran doit venir de ce que le
//    dirigeant vient de dire.
//
// 2. **Elle ENTOURE le texte, elle ne se pose pas dessus.** Premier essai : un petit cercle
//    derrière la question. Il tombait entre le titre et la ligne d'écriture, et se lisait comme
//    une tache mal placée. Le premier anneau est donc plus large que tout le bloc de texte : la
//    conversation se déroule À L'INTÉRIEUR de la figure, et celle-ci s'élargit autour du
//    dirigeant à chaque réponse. Sur un écran bas, les anneaux débordent en haut et en bas — ce
//    n'est pas un défaut : deux arcs symétriques se lisent comme un horizon, et le débordement
//    dit que la figure devient plus grande que le cadre.
//
//    Elle reste très basse en contraste. Le jour où on la remarque avant la question, elle est
//    trop forte.
//
// 3. **Elle se précise, elle ne se remplit pas.** Chaque anneau est ENTIER dès qu'il paraît,
//    mais pointillé ; ses points se rejoignent à chaque réponse jusqu'au trait continu. C'est la
//    bonne métaphore : au début on ne sait presque rien de l'entreprise, et chaque réponse rend
//    le contour plus net. Une jauge qui se remplit aurait raconté une course vers une fin qu'on
//    ne connaît pas — et le moteur seul décide quand il en sait assez.
//
//    ⚠️ ESSAYÉ ET REJETÉ : un arc partiel qui se referme. À un ou deux échanges, un bout d'arc
//    isolé derrière le titre ne se lit pas comme une figure en train de naître, il se lit comme
//    une rayure sur l'écran. Le cercle entier est reconnaissable dès le premier instant ; c'est
//    sa TEXTURE qui raconte ce qu'on sait, pas sa longueur.
// ════════════════════════════════════════════════════════════════════════════════════════════

/** Les rayons des anneaux, du plus intérieur au plus extérieur. */
const RAYONS = [300, 352, 406, 462, 522, 588];

export function FormeQuiSePrecise({ etapes }: { etapes: number }) {
  return (
    <svg
      className="diag-forme"
      viewBox="0 0 1200 1200"
      aria-hidden="true"
      focusable="false"
    >
      {RAYONS.map((rayon, index) => {
        // Chaque anneau apparaît à son tour, du plus petit au plus grand : la figure S'OUVRE
        // autour du dirigeant à mesure qu'il en dit plus.
        //
        // ⚠️ Les anneaux non atteints sont ÉTEINTS, pas « à peine visibles ». Essayé à 0,05 : les
        // grands arcs traversaient le titre et se lisaient comme des rayures sur l'écran, pas
        // comme une intention. Un trait presque invisible n'est pas discret, il est sale.
        const atteint = index <= etapes;
        const circonference = 2 * Math.PI * rayon;

        // Le contour se resserre : semé de points au début, continu quand l'anneau est atteint
        // depuis plusieurs échanges. Le motif fait tout le tour — c'est un cercle, jamais un bout.
        const anciennete = Math.max(0, etapes - index);
        const part = Math.min(1, 0.1 + anciennete * 0.3);
        const pas = circonference / 48;
        const plein = pas * part;

        return (
          <circle
            key={rayon}
            cx="600"
            cy="600"
            r={rayon}
            fill="none"
            stroke="currentColor"
            strokeWidth={index === 0 ? 1.4 : 1}
            strokeLinecap="round"
            strokeDasharray={`${plein.toFixed(2)} ${(pas - plein).toFixed(2)}`}
            // Un décalage par anneau : sans lui, tous les points s'aligneraient sur les mêmes
            // rayons et la figure se lirait comme une cible, pas comme quelque chose qui se
            // compose.
            strokeDashoffset={(pas * index * 0.37).toFixed(2)}
            style={{
              opacity: atteint ? 0.3 - index * 0.035 : 0,
              transform: `rotate(${index * 24}deg)`,
              transformOrigin: "600px 600px",
            }}
          />
        );
      })}
    </svg>
  );
}
