# ADR-0025 — Un seul Sentio : cerveau unique, offre unique, métiers ouverts

**Date :** 2026-08-06
**Statut :** accepté
**Prolonge :** [`0019`](0019-priorites-ingenierie.md), [`0024`](0024-verification-automatique.md)
**Plan d'exécution :** [`docs/27-convergence.md`](../27-convergence.md)

## Contexte

Deux générations du même produit coexistaient : le cœur (`supabase/migrations`,
`packages/domain`, `packages/core`) et une seconde implémentation dans `apps/vitrine` +
`packages/vitrine-core`, sur un projet Supabase distinct et un schéma parallèle. L'audit de
convergence a montré que ce n'étaient pas deux services, mais **la même chose modélisée deux
fois** — jusqu'à deux assembleurs de contexte, deux grilles tarifaires et deux modèles de
mémoire.

Trois décisions produit bloquaient la convergence. Elles sont tranchées ici.

## Décision 1 — Pas de BYOK. La plateforme porte les fournisseurs et leurs coûts.

Sentio ne demande **jamais** à une entreprise de fournir sa propre clé d'API.

**Pourquoi.** Le principe produit est que la complexité technologique est cachée au client. Un
client paie Sentio pour un employé numérique qui produit un résultat — pas pour ouvrir un compte
chez un fournisseur de modèles, gérer une clé, surveiller un quota et arbitrer un dépassement.
Demander une clé, c'est déplacer sur le client exactement le travail qu'on prétend lui enlever,
et c'est vendre un accès technique au lieu d'un résultat.

**Ce que ça retient :** le modèle du cœur — `provider_credential` **global**, avec sa contrainte
`provider_no_train_needs_proof` : un fournisseur reste **non conforme** tant que son opt-out
n'est pas prouvé, vérifié et daté. Le Model Gateway saute un fournisseur non conforme pour une
donnée réelle ; il ne le tente pas.

**Ce que ça abandonne :** `tenant_ai_credential` (clé chiffrée par entreprise, ADR-005 de la
vitrine) et le raisonnement « €0 pour la plateforme » qui l'accompagnait. Le coût d'inférence
devient un coût de la plateforme, à couvrir par le prix — pas à externaliser chez le client.
C'est une charge assumée, et elle doit être visible dans les marges, pas cachée dans une clé
que quelqu'un d'autre paie.

## Décision 2 — Une seule définition de l'offre, celle du cœur.

Il n'existe qu'un catalogue : `plan` en base, trois niveaux — **Start**, **Growth**, **Scale**.

**Pourquoi.** La grille de la vitrine (`standard` / `professionnel` / `entreprise`, en dur dans
`lib/plans.ts`) et celle du cœur (`plan` + `plan_quota`, en données) étaient deux vérités
concurrentes sur la même question. Deux catalogues, c'est un jour où le prix affiché n'est pas
le prix facturé.

**Ce que ça implique :** les prix et les quotas s'ajustent **en base**, jamais par déploiement —
c'est ce que la migration `…31_seed_plans` garantit déjà. La landing et `/plans` lisent le
catalogue, elles ne le déclarent pas.

**Le positionnement que le prix doit refléter :** Sentio vend **un résultat et une expérience**,
pas un accès technique à des modèles. Une grille construite sur des volumes de jetons ou des
appels d'API contredirait la décision 1 le jour où elle serait publiée.

## Décision 3 — Les métiers restent ouverts. Aucune verticale artificielle.

La landing annonçait cinq métiers, dont quatre sans aucun moteur (`agent-roles.ts`,
`live: false`). **On ne construit pas quatre backends pour rendre une page cohérente.**

**Ce qui est retenu :** une promesse unique — *« Un employé adapté à votre entreprise »* — avec
quelques **exemples** rendant le concept concret (commercial, support, administratif,
marketing). Des exemples, présentés comme tels : pas quatre verticales officiellement
supportées.

**Pourquoi ce n'est pas un repli.** Sentio est généraliste sur les métiers et spécialisé dans la
personnalisation à chaque entreprise. Figer quatre verticales, ce serait remplacer cette
spécialisation par un catalogue — et fermer d'avance la porte que le diagnostic doit garder
ouverte.

**Conséquence de conception, non négociable :** le diagnostic doit rester capable de
**découvrir un besoin qui n'est pas dans la liste** — et de le dire honnêtement quand il sort du
périmètre, plutôt que de le forcer dans un métier existant. Le domaine sait déjà le faire
(`OUT_OF_SCOPE_NEEDS`, `HANDLED_FRICTIONS`) ; aucune évolution de la landing ne doit contourner
ce chemin.

## Décision 4 — Un seul cerveau

Reprise comme invariant 9 dans [`AGENTS.md`](../../AGENTS.md) :

> Il n'existe qu'un seul Sentio. `packages/domain` + `packages/core` contiennent la logique
> métier. Le schéma cœur est la source de vérité. `apps/vitrine` est une interface et une
> expérience utilisateur. Aucun deuxième modèle métier ne doit être recréé dans la vitrine.

## Conséquences

- `packages/vitrine-core` est destiné à disparaître ; sa suppression est le critère 2 du point
  de bascule (`docs/27-convergence.md` §9).
- `tenant_ai_credential` et `lib/plans.ts` n'ont pas d'avenir dans la cible.
- Les décisions ADR-005 (BYOK) et la grille tarifaire de `docs/vitrine/DECISIONS.md` sont
  **remplacées** par celle-ci pour tout ce qui concerne la cible.
- Aucune de ces décisions n'est appliquée par ce document : elles cadrent les phases 1 à 5 du
  plan de convergence, qui n'ont pas commencé.
