# ADR-0030 — Une seule base, et c'est celle du cœur

**Statut :** acceptée · **Date :** 2026-08-27 · **Décidée par :** le fondateur

---

## Le contexte

Sentio a deux projets Supabase, hérités de ses deux générations
([`docs/27`](../27-convergence.md) §1.1) :

| | Projet | État |
|---|---|---|
| **cœur** | `ritwmikarekkisxaiokf` | vide, région `eu-north-1`, **déjà relié à la CLI du poste** |
| **vitrine** | `rybeumdjclajiypglmuj` | l'ancienne génération, **en pause depuis le 2026-08-06**, et c'est à elle que le site est branché |

La question était ouverte depuis le 2026-08-06 et bloquait tout le reste : l'espace client lit des
tables que seul le schéma du cœur possède, alors que l'application n'a qu'une seule connexion,
pointée vers la vitrine. C'est le constat **B3** de [`docs/32`](../32-audit-avant-mise-en-vente.md),
et il empêchait toute mise en ligne.

## Ce que disait l'analyse d'origine, et pourquoi elle ne tient plus

[`docs/27`](../27-convergence.md) §4.3 penchait pour l'inverse de cette décision : appliquer le
schéma du cœur **sur le projet de la vitrine**. L'argument était sérieux, et unique :

> les `auth.users` ne sont pas transposables entre deux projets Supabase. Garder le projet de la
> vitrine échange un problème d'authentification insoluble contre un simple renommage de projet.

**Cet argument ne vaut que s'il y a des comptes à préserver.** Deux constats, indépendants l'un de
l'autre, disent qu'il n'y en a pas :

1. le 2026-08-06, le contenu de la base vitrine a été examiné : **aucun client réel, aucune donnée
   de production**, uniquement le locataire de démonstration et des essais ;
2. **le même jour, la base a été mise en pause.** Une base en pause ne sert aucune requête : elle
   n'a donc rien pu recevoir depuis. Ce qui était vrai le 6 août l'est encore, sans avoir besoin
   d'aller le revérifier.

Le fondateur a confirmé le 2026-08-27 qu'aucune personne réelle n'avait créé de compte avant cette
date. Le seul argument en faveur de la vitrine tombe.

## La décision

**Le projet `ritwmikarekkisxaiokf` devient la base unique de Sentio.** Le schéma de
`supabase/migrations` s'y applique, et c'est vers lui que l'application pointe.

Trois raisons, dans cet ordre :

1. **Il est vide.** Rien à nettoyer plus tard, aucune table de l'ancienne génération à cohabiter
   avec pendant des mois, aucune décision reportée. La vitrine aurait imposé de trancher un jour
   le sort de ses treize tables héritées, et ce jour ne serait jamais venu.
2. **Il est déjà relié au poste** (`supabase/.temp/project-ref`). Un `supabase db push` y va
   naturellement : on supprime la classe d'erreur la plus grave possible ici, celle où l'on pousse
   un schéma sur le mauvais projet.
3. **Sa région est celle que la politique de confidentialité déclare** (`eu-north-1`, Stockholm).
   Une déclaration de localisation est opposable ; la faire coïncider par construction vaut mieux
   que la vérifier de mémoire.

## Le compromis assumé

**Les pages de l'ancienne génération cesseront de fonctionner.** `/dashboard`, `/agent`,
`/tasks/[id]`, `/decisions` et `/onboarding` interrogent `agent_instance`, `agent_memory`,
`standing_approval` et les autres tables de la vitrine, qui n'existeront jamais dans le cœur.

Ce que ça coûte réellement : **rien de vivant.** Ces pages sont déjà mortes, puisque la base
qu'elles interrogent est en pause depuis trois semaines. La décision ne casse rien ; elle rend
visible une chose déjà cassée.

Ce qu'elle impose en revanche : **ces pages doivent être retirées ou masquées avant la mise en
ligne.** Une page qui échoue est pire qu'une page absente sur un site où l'on vend. C'est la
première conséquence à traiter, et elle est nommée ici pour ne pas être découverte en production.

**Les comptes de démonstration sont perdus**, et c'est sans importance : le nouveau parcours crée
les comptes lui-même ([`docs/33`](../33-le-parcours-gratuit.md)), et il n'y avait rien d'autre.

## Ce que ça débloque

- l'espace client peut enfin lire les tables qu'il interroge ;
- le parcours gratuit (`pnpm run inviter`) a une base où écrire ;
- `pnpm run supabase:inventaire -- --cible=…` a une cible qui a du sens ;
- les neuf gestes de [`docs/34`](../34-tout-ce-qui-doit-etre-sur-supabase.md) §5 peuvent commencer.

## Ce que ça ne règle pas

Le webhook de paiement n'existe toujours pas, `/espace` n'est atteignable depuis aucun lien du
site public, et la grille tarifaire publiée ne correspond pas à celle de la base. Les trois
restent listés dans [`docs/32`](../32-audit-avant-mise-en-vente.md).
