/**
 * `CONF-08`, appliqué à l'interface — **le contrôle automatique de lexique**.
 *
 * `docs/17-lexique.md` dit que les mots interdits doivent être rejetés par l'intégration continue,
 * pas par la vigilance : « sous pression, *l'IA a analysé votre demande* finit toujours par
 * apparaître dans un message d'erreur écrit à la va-vite ». Ce test est ce rejet.
 *
 * Il connaît les **deux zones exemptées**, et pas une de plus : les pages légales, et l'information
 * de transparence du diagnostic (`LIBELLES_EXEMPTES`). Un contrôle qui ferait échouer la
 * construction sur une mention légale obligatoire finirait par être désactivé — et c'est tout le
 * contrôle qu'on perdrait.
 *
 * Réalise : CONF-08
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { findForbiddenTerms, parseForbiddenTerms, LEXIQUE_DOC_PATH } from "@sentio/config";
import { describe, expect, it } from "vitest";

import { LIBELLES, LIBELLES_EXEMPTES } from "./labels.js";

const RACINE_DEPOT = resolve(import.meta.dirname, "..", "..", "..", "..");

/** La liste fait foi dans le document, jamais ici : trois copies divergentes valent zéro règle. */
const TERMES_INTERDITS = parseForbiddenTerms(
  readFileSync(join(RACINE_DEPOT, LEXIQUE_DOC_PATH), "utf8"),
);

/** Tous les textes d'un objet de libellés, aplatis avec leur chemin — pour nommer le fautif. */
function textes(valeur: unknown, chemin = ""): { readonly chemin: string; readonly texte: string }[] {
  if (typeof valeur === "string") return [{ chemin, texte: valeur }];
  if (typeof valeur !== "object" || valeur === null) return [];
  return Object.entries(valeur).flatMap(([cle, sousValeur]) =>
    textes(sousValeur, chemin === "" ? cle : `${chemin}.${cle}`),
  );
}

function fichiersSvelte(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiersSvelte(chemin);
    return chemin.endsWith(".svelte") ? [chemin] : [];
  });
}

describe("lexique — ce qu'un visiteur ne doit jamais lire", () => {
  it("extrait la liste depuis le document, et elle n'est pas vide", () => {
    expect(TERMES_INTERDITS.length).toBeGreaterThan(5);
    expect(TERMES_INTERDITS).toContain("bot");
  });

  it("n'emploie aucun mot interdit dans les libellés soumis au lexique", () => {
    const fautes = textes(LIBELLES)
      .flatMap(({ chemin, texte }) =>
        findForbiddenTerms(texte, TERMES_INTERDITS).map(({ term }) => `${chemin} : « ${term} »`),
      )
      .sort();

    expect(fautes).toEqual([]);
  });

  it("laisse la zone exemptée dire les choses en clair, comme la loi l'exige", () => {
    // Ce n'est pas une tolérance : l'article 50 impose une information *claire*, et une formule qui
    // laisse le visiteur dans le doute n'informe pas (docs/adr/0015).
    const transparence = LIBELLES_EXEMPTES.transparenceDiagnostic;
    expect(findForbiddenTerms(transparence, TERMES_INTERDITS).length).toBeGreaterThan(0);
    expect(transparence.toLowerCase()).toContain("intelligence artificielle");
  });

  it("n'emploie aucun mot interdit dans les composants", () => {
    // Les composants ne devraient contenir aucun texte visible (le garde des frontières le vérifie).
    // Ce contrôle-ci couvre le reste : un attribut, un commentaire recopié, un libellé oublié.
    // Tout `src`, pas seulement les pages : une section oubliée dans `lib/sections` serait
    // exactement l'angle mort que ce contrôle existe pour couvrir.
    const fautes = fichiersSvelte(join(import.meta.dirname, ".."))
      .flatMap((fichier) => {
        const contenu = readFileSync(fichier, "utf8");
        return findForbiddenTerms(contenu, TERMES_INTERDITS).map(
          ({ term }) => `${fichier} : « ${term} »`,
        );
      })
      .sort();

    expect(fautes).toEqual([]);
  });
});
