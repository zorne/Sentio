# 02 — Architecture d'ensemble

> À lire si tu travailles sur : la structure du projet, un nouveau module, une dépendance.

---

## Principe directeur

**Monolithe modulaire, hexagonal, piloté par les données.**

Un seul déploiement, mais des frontières de modules assez nettes pour qu'un module devienne
un service séparé plus tard **sans réécriture** — uniquement en le déplaçant.

Tout ce qui est susceptible de changer (formules, quotas, métiers, capacités, fournisseurs de
modèle, outils) vit **en base ou en configuration**, jamais dans une condition en dur.

**Pourquoi pas des services séparés dès le départ :** plusieurs services = plusieurs
hébergements = du coût et de l'exploitation, incompatibles avec le €0 et avec un fondateur
seul. Des frontières propres donnent le découpage futur sans en payer le prix aujourd'hui.

---

## Découpage du monorepo

| Module | Rôle | Peut dépendre de |
|---|---|---|
| `packages/domain` | Types, contrats, règles métier pures (recrutement, quotas, attribution). **Aucune entrée/sortie.** | rien |
| `packages/core` | Runtime d'employé, Model Gateway, Policy Engine, Mémoire, Registre de capacités | `domain`, `config` |
| `packages/capabilities` | Adaptateurs concrets d'une capacité (prospection, envoi d'email, CRM…) | `domain` |

> `capabilities` **n'importe pas** `core`, alors qu'il en implémente les contrats : TypeScript
> vérifie la forme, pas la provenance. Un moteur satisfait `CapabilityEngine` sans le connaître —
> ce qui garde la dépendance orientée dans un seul sens, et permettra d'extraire une capacité en
> service séparé sans emporter le noyau avec elle.
| `packages/db` | Repositories, accès typé à la base | `domain` |
| `packages/config` | Formules, quotas, seuils, drapeaux de fonctionnalité, lexique | rien |
| `apps/web` | Interface : vitrine publique + espace privé (**SvelteKit**, sortie statique) | tous |
| `supabase/functions` | Adaptateurs d'entrée : tout ce qui touche une donnée personnelle, **en UE** | `domain`, `core`, `capabilities`, `db` |
| `apps/worker` | Exécution en arrière-plan (en V1 : points d'entrée déclenchés par un battement) | `core`, `db` |

Le **schéma** lui-même — migrations, politiques d'isolation, tests d'invariants — vit dans
[`supabase/`](../supabase/), à l'emplacement où le CLI qui les applique les lit. Le détail et la
raison de ce choix sont dans [`supabase/README.md`](../supabase/README.md).

**Frontières strictes, à faire respecter :**
- L'interface n'appelle **jamais** un fournisseur de modèle ni une capacité directement.
  Elle passe par le noyau.
- `domain` ne connaît ni base ni réseau. C'est ce qui rend les règles métier testables sans
  infrastructure — et déplaçables plus tard.
- `core` ne connaît ni base ni file : il **déclare des ports** (`packages/core/src/ports.ts`) que
  `apps/worker` branche sur Postgres (`apps/worker/src/adapters/`). Il dépend de `config` parce
  que les enveloppes, les seuils et les drapeaux sont de la configuration, pas des règles — et
  `config` ne dépend de rien, donc la frontière reste orientée. Les appels sortants vers un
  fournisseur de modèle sont, eux aussi, des adaptateurs isolés
  (`packages/core/src/model/http/`) : le Gateway ne les importe jamais, c'est le câblage qui
  choisit lesquels existent et dans quel ordre.
- `apps/worker` ne communique avec `apps/web` que **par la base et la file**. Jamais par un
  appel direct. Le jour où l'exécution devient le goulot d'étranglement, ce module devient un
  service autonome sans rien réécrire.

---

## Deux zones étanches dans une seule application

| | Vitrine publique | Espace privé |
|---|---|---|
| Contenu | présentation, démonstration, diagnostic, achat | employés, performances, abonnement, notifications |
| Accès aux données client | **aucun** | complet, isolé par entreprise |
| Budget d'inférence | enveloppe plafonnée | enveloppe prioritaire |
| Après connexion | le client n'y revient jamais | l'unique lieu de vie du client |

Cette séparation est technique, pas seulement visuelle : groupes de routes distincts,
politiques d'accès distinctes, **budgets d'inférence distincts**. Un pic de visiteurs sur la
vitrine ne doit jamais empêcher les employés déjà vendus de travailler.

Les deux zones ne portent que deux des **trois** enveloppes d'inférence ; la troisième, interne
et résiduelle, sert les tests. Les trois sont décrites dans
[`11-exploitation.md`](11-exploitation.md).

---

## Les grands blocs du noyau

```
        ┌──────────────────────────────────────────────┐
        │                  RUNTIME                     │
        │  un run = machine à états persistée          │
        │  charge l'état → assemble le contexte →      │
        │  demande l'action → soumet à la politique →  │
        │  exécute → journalise → replanifie           │
        └───┬───────────┬───────────┬──────────────┬───┘
            │           │           │              │
    ┌───────▼──┐  ┌─────▼─────┐ ┌───▼────────┐ ┌───▼──────┐
    │ CONTEXTE │  │  MODEL    │ │  POLICY    │ │ CAPACITÉS│
    │ 3 couches│  │  GATEWAY  │ │  ENGINE    │ │ registre │
    └──────────┘  └───────────┘ └────────────┘ └──────────┘
         │              │              │             │
    ADN + mémoire   fournisseurs   autorise /    moteurs
    + tâche         (routage par   suspend /     remplaçables
                    classe de      refuse
                    données)
                              │
                        ┌─────▼──────┐
                        │  JOURNAL   │  source de vérité
                        └────────────┘
```

Détail de chaque bloc : [`05-runtime-employe.md`](05-runtime-employe.md).

---

## Choix de plateforme

- **TypeScript partout** : un seul langage, un seul outillage, des types partagés entre
  l'interface et le noyau. On orchestre des modèles, on ne fait pas d'apprentissage
  automatique — l'écosystème Python n'est pas nécessaire.
- **Supabase (Postgres, région Union européenne)** : base, authentification, isolation par
  ligne, et planification interne. Une seule dépendance pour quatre besoins. Le **mécanisme du
  battement** n'est pas tranché pour autant : planificateur interne à la base ou déclencheur
  externe signé, les deux restent ouverts (D4, [`11-exploitation.md`](11-exploitation.md)).
- **Hébergement de l'interface** : tranché ([`adr/0021`](adr/0021-execution-serveur-en-ue.md)).
  Le code serveur qui touche une donnée personnelle s'exécute dans les **fonctions Supabase, en
  région UE** ; la vitrine est **prérendue** et ne porte aucune donnée. Le critère dominant n'était
  pas l'offre gratuite mais **où le code s'exécute** : le diagnostic manipule du réel dès la
  première question. Une fonction est un **adaptateur d'entrée** — elle valide, appelle le domaine,
  répond ; elle ne contient aucune règle. C'est ce qui garde la migration bornée à deux endroits.
- **Inférence** : fournisseur européen en tier gratuit
  → [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md),
  [`adr/0009`](adr/0009-fournisseur-inference-ue.md).

---

## Nommage

Code, tables et modules en **anglais**. Tout texte visible par un client en **français**, et
conforme au [`17-lexique.md`](17-lexique.md). Ne jamais mélanger les deux : une table
s'appelle `employee`, l'interface dit « employé ».
