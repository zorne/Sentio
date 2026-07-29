# ADR-0023 — Le code partagé atteint les fonctions Deno par une recopie générée

**Date :** 2026-07-30
**Statut :** acceptée

## Contexte

[`0021`](0021-execution-serveur-en-ue.md) place tout code serveur touchant une donnée personnelle
dans les fonctions Supabase, en UE, et pose la règle qui en est la condition : **une fonction
valide, appelle le domaine, répond**. Encore faut-il qu'elle *puisse* appeler le domaine.

Or les fonctions s'exécutent sous **Deno**, et `packages/` est un espace de travail **pnpm**. Deux
obstacles, ni l'un ni l'autre négociable :

1. Deno ne connaît pas les liens `workspace:*` de pnpm ni le champ `main` de nos `package.json`
   internes ;
2. nos sources écrivent leurs imports avec l'extension `.js` — `export * from "./ids.js"` — parce
   que c'est ce qu'exige le TypeScript compilé côté Node. Ce fichier **n'existe pas** sur le
   disque : seul `ids.ts` existe. Deno résout les chemins tels qu'ils sont écrits, et échoue.

Quatre issues examinées :

- **importer les sources telles quelles** — échoue sur le point 2 ;
- **activer les *sloppy imports* de Deno**, qui font tolérer `.js` pour `.ts` : c'est un drapeau
  instable, invisible à la lecture du code, et exactement le genre de contournement discret que le
  projet refuse ([`0021`](0021-execution-serveur-en-ue.md), « quand revisiter ») ;
- **publier `@sentio/domain` sur un registre** et l'importer par `npm:` : un artefact de plus à
  versionner et publier à chaque modification du domaine, pour un développeur seul ;
- **compiler le domaine en JavaScript et importer le résultat** : marche, mais Deno perd les types
  du domaine — la fonction serait vérifiée contre un `any`, ce qui retire au contrôle de types
  l'essentiel de son intérêt à la frontière la plus sensible du produit.

## Décision

**Les paquets partagés sont recopiés dans `supabase/functions/_generated/` par un script, qui
réécrit les extensions d'import `.js` en `.ts` — et rien d'autre.**

- Script : [`scripts/sync-shared-to-functions.mjs`](../../scripts/sync-shared-to-functions.mjs),
  lancé par `pnpm run functions:sync`.
- Paquets partagés : **`domain` et `config` uniquement**. Ce sont les deux qui ne dépendent de
  rien et ne font aucune entrée/sortie. Le jour où une fonction aura besoin de la base, ce sera par
  un adaptateur Deno de `SqlClient`, pas par une recopie de `packages/db`.
- Le dossier produit **n'est pas versionné**, et porte son propre `.gitignore` : personne ne doit y
  corriger un bogue, la source vit dans `packages/`.
- L'adresse des paquets est déclarée une seule fois, dans
  [`supabase/functions/deno.json`](../../supabase/functions/deno.json) : les fonctions écrivent
  `@sentio/domain`, comme partout ailleurs dans le dépôt.

Le script **s'arrête** dans trois cas, plutôt que de produire quelque chose qui échouera plus tard :
un paquet partagé qui importerait une dépendance externe (Deno ne la résoudrait pas), un import
réécrit qui ne désigne aucun fichier, un paquet introuvable. La destination est effacée avant chaque
exécution : elle ne contient jamais de reste.

## Pourquoi

Parce que c'est la seule des quatre issues qui garde **les trois propriétés qui comptent** :
`packages/` reste la source unique, le domaine reste **typé** vu depuis la fonction, et rien
d'implicite ne s'installe — le mécanisme est un fichier de 140 lignes qu'on lit en une minute, pas
un drapeau de runtime.

Et parce qu'elle est **temporaire par construction**. Le jour de la migration vers un hébergeur
Node européen, les fonctions redeviennent des routes serveur du cadre applicatif : elles importent
les paquets par l'espace de travail, et ce mécanisme disparaît — script, dossier généré et carte
d'imports compris. Un mécanisme qui sait comment il mourra vaut mieux qu'un mécanisme qu'on
n'osera plus toucher.

## Compromis assumé

**1. Une étape à ne pas oublier.** Modifier `packages/domain` sans relancer `functions:sync` déploie
une fonction contre une copie périmée. La parade : la commande est dans l'intégration continue
(le contrôle de types des fonctions la lance d'abord), et le dossier généré est effacé à chaque
exécution — il n'existe donc jamais d'état à moitié à jour. Ce n'est pas une garantie absolue : un
déploiement fait à la main depuis un poste dont le dossier généré est vieux resterait possible.

**2. Une réécriture de code par un script, aussi étroite soit-elle.** Elle ne touche qu'une
extension dans un spécificateur d'import, et échoue si le fichier visé n'existe pas — mais c'est
une génération, avec ce que ça implique : ce qui est exécuté en production n'est pas exactement
l'octet qu'on a écrit. Assumé parce que la transformation est vérifiable en une lecture.

**3. Le contrôle de types des fonctions n'est pas celui du reste du dépôt.** Il tourne sous
`deno check`, avec les mêmes options de rigueur recopiées dans `deno.json`. Deux endroits déclarent
donc la même exigence de rigueur, et peuvent diverger par oubli.

## Quand revisiter

- **Le jour de la migration** vers un hébergeur Node européen : cette entrée et son mécanisme
  disparaissent ensemble.
- **Si une fonction a besoin d'un paquet qui fait des entrées/sorties** (`db`, `core`,
  `capabilities`) : ce n'est plus une recopie qu'il faut, c'est un adaptateur Deno — et c'est une
  décision à écrire, pas à improviser.
- **Si le script devait grossir** — deuxième transformation, cas particulier, exception : ce serait
  le signe que l'issue choisie ne tient plus, et qu'il faut reprendre les quatre.
