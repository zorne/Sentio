# ADR-0024 — Tout ce qui peut être vérifié automatiquement l'est

**Date :** 2026-07-30
**Statut :** acceptée

## Contexte

Trois décisions récentes reposaient, pour tenir, sur la vigilance d'une personne seule :

- [`0021`](0021-execution-serveur-en-ue.md), règle 2 — « aucune logique métier dans les fonctions » —
  dont le compromis 4 disait explicitement qu'elle « doit être défendue à chaque revue » ;
- [`0022`](0022-interface-sveltekit.md), compromis 4 — « une règle métier écrite par erreur dans un
  composant ne sera pas détectée par un test […] la parade est la revue » ;
- [`0023`](0023-code-partage-vers-les-fonctions.md), compromis 1 — une recopie à ne pas oublier avant
  de déployer.

Le fondateur a tranché : **une règle défendue par la mémoire est une règle déjà perdue**. Sur un
projet mené seul pendant des mois, la revue est la même personne que l'auteur, un soir de fatigue.

## Décision

**Ce qui est vérifiable par une machine est vérifié par une machine, et la vérification tourne sans
qu'on y pense.** Cinq principes, dans cet ordre, complètent les six priorités de
[`0019`](0019-priorites-ingenierie.md) :

1. **sécurité avant fonctionnalités** ;
2. **confidentialité avant simplicité** ;
3. **architecture avant vitesse** ;
4. **automatisation avant vérification manuelle** ;
5. **tests avant fusion**.

**Toute décision future qui remettrait en cause l'un de ces principes se soumet au fondateur avant
d'être implémentée.** Pas après, pas dans un compte-rendu : avant.

### Ce que ça donne, concrètement

Une seule commande définit « vérifié », et elle vit dans `package.json` — pas dans le fichier
d'intégration continue. Deux définitions finiraient par diverger, et c'est toujours celle de
l'intégration continue qu'on découvrirait trop tard.

```bash
pnpm run verify
```

| Ce qui est vérifié | Par quoi | Où ça tourne |
|---|---|---|
| Style et erreurs statiques | `eslint` | `verify`, CI, avant-envoi |
| **Frontières d'architecture** | [`scripts/verifier-frontieres.mjs`](../../scripts/verifier-frontieres.mjs) | idem |
| Types de tout le dépôt | `tsc`, `svelte-check` | idem |
| Règles du domaine | Vitest | idem |
| **Lexique des textes visibles** | [`apps/web/src/lib/labels.test.ts`](../../apps/web/src/lib/labels.test.ts) | idem |
| Construction de la vitrine | `vite build` | idem |
| Fonctions : recopie, lint, types, tests | `pnpm run functions:verify`, **sous Deno** | idem |
| Invariants du schéma | `supabase/tests/run.sh` | CI (exige une base) |

Quatre frontières sont désormais tenues par un contrôle, plus par une relecture : **une fonction
n'importe que le domaine et la configuration** ; **l'interface ne touche jamais une donnée** (aucun
client de base, un seul endroit où `fetch` est permis, aucun code du domaine embarqué dans le
navigateur) ; **aucun texte visible hors du fichier de libellés** ; **`packages/domain` ne fait
aucune entrée/sortie** — ni horloge, ni hasard, ni réseau.

Deux automatismes ferment les portes qui restaient ouvertes :

- **crochet d'avant-envoi** ([`.githooks/pre-push`](../../.githooks/pre-push)), installé par
  `pnpm install` : rien ne part vers le dépôt distant sans `pnpm run verify` ;
- **`pnpm run functions:deploy`** : le déploiement *contient* la vérification. Il n'existe plus de
  chemin sanctionné qui déploie une recopie périmée.

### Ce qui ne peut pas être automatisé, et reste donc écrit

Le corollaire de la règle : ce qui échappe à la machine doit être **nommé**, pas espéré. Ces gestes
sont des actions de console, hors de portée du code — ils vivent dans
[`../20-plan-action.md`](../20-plan-action.md) et dans les mémoires du projet : immatriculation,
preuve datée de l'opt-out d'entraînement, comptes fournisseurs séparés du personnel, domaine
d'expédition en région UE, en-têtes de sécurité de l'hébergeur.

## Pourquoi

Parce que le coût d'un contrôle automatique se paie une fois, et celui d'une règle orale à chaque
modification. Parce qu'un contrôle dit **où** et **quoi corriger**, là où une revue dit « attention à
l'architecture ». Et parce que ces contrôles sont la seule mémoire du projet qui ne fatigue pas.

## Compromis assumé

**1. Des faux positifs, et une charge d'entretien.** Le contrôle des textes en dur repère « deux mots
ou plus dans le balisage » : un jour, il signalera quelque chose de légitime. La règle est alors
d'ajuster le contrôle en le documentant, **jamais** de l'ignorer au cas par cas — une exception
silencieuse vaut suppression.

**2. Ces contrôles ne prouvent pas l'absence de faute.** Ils tiennent les cas mécaniquement
décidables. Une règle métier écrite en toutes lettres dans un composant, en anglais et sans texte
visible, passerait. Ils réduisent la surface de l'erreur humaine, ils ne l'annulent pas — et croire
le contraire serait plus dangereux que la règle orale qu'ils remplacent.

**3. Le crochet d'avant-envoi est contournable** (`git push --no-verify`) et allonge chaque envoi de
quelques secondes. Assumé : il se contourne **visiblement**, ce qui est exactement la différence
entre un oubli et une décision.

**4. Deno devient une dépendance de développement obligatoire.** `pnpm run verify` échoue sans lui.
C'est le prix de vérifier les fonctions dans leur runtime de production plutôt que dans un autre.

## Quand revisiter

- **Quand un contrôle devient bruyant** : l'ajuster tout de suite, avant que quelqu'un prenne
  l'habitude de le contourner.
- **Quand une vérification manuelle réapparaît** dans une consigne ou une revue : c'est le signal
  qu'il manque un contrôle, pas de la rigueur.
- **Le jour de la migration** vers un hébergeur Node : `functions:verify` et le garde des frontières
  changent de cible, la règle ne change pas.
