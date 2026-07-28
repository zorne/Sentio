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
| `packages/core` | Runtime d'employé, Model Gateway, Policy Engine, Mémoire, Registre de capacités | `domain` |
| `packages/capabilities` | Adaptateurs concrets d'une capacité (prospection, envoi d'email, CRM…) | `domain` |
| `packages/db` | Schéma, migrations, repositories, politiques d'isolation | `domain` |
| `packages/config` | Formules, quotas, seuils, drapeaux de fonctionnalité, lexique | rien |
| `apps/web` | Interface : vitrine publique + espace privé | tous |
| `apps/worker` | Exécution en arrière-plan (en V1 : points d'entrée déclenchés par un battement) | `core`, `db` |

**Frontières strictes, à faire respecter :**
- L'interface n'appelle **jamais** un fournisseur de modèle ni une capacité directement.
  Elle passe par le noyau.
- `domain` ne connaît ni base ni réseau. C'est ce qui rend les règles métier testables sans
  infrastructure — et déplaçables plus tard.
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
- **Hébergement de l'interface** : non tranché (D12). À choisir en gardant l'application
  **indépendante de l'hébergeur** — aucune interface propriétaire, car une migration est probable
  dès le premier client payant (voir [`11-exploitation.md`](11-exploitation.md)).
- **Inférence** : fournisseur européen en tier gratuit
  → [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md),
  [`adr/0009`](adr/0009-fournisseur-inference-ue.md).

---

## Nommage

Code, tables et modules en **anglais**. Tout texte visible par un client en **français**, et
conforme au [`17-lexique.md`](17-lexique.md). Ne jamais mélanger les deux : une table
s'appelle `employee`, l'interface dit « employé ».
