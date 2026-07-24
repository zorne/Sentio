# Employés IA — Plateforme

Monorepo de la plateforme d'employés numériques. Les décisions structurantes sont dans [docs/DECISIONS.md](docs/DECISIONS.md) — on ne les contourne pas sans nouvelle entrée.

## Structure

```
apps/
  landing/        # Landing publique (HTML existant, à intégrer)
  web/            # App client (dashboard, gestion des agents)
packages/
  core/           # LE NOYAU — ne connaît aucun métier (principe n°2)
    gateway/      # Model Gateway : BYOK par tenant, règle no-train (ADR-004/005/006)
    tools/        # Contrat d'outil : read/write/irreversible → autonomie
    execution/    # Journal append-only : audit, temps réel, facturation
    runtime/      # (Phase 1) la boucle d'agent
    context/      # (Phase 1) assemblage du contexte
    memory/       # (Phase 4) mémoire long terme
    policy/       # (Phase 2) guardrails + curseur d'autonomie
  db/             # Migrations SQL (Supabase/Postgres, RLS multi-tenant)
  shared/         # Types partagés back/front
services/
  api/            # API HTTP (crée les Tasks, rend la main)
  worker/         # Workers asynchrones (exécutent les runs)
docs/             # DECISIONS.md (ADR) + docs d'architecture
```

## Contraintes non négociables

- **€0 de dépense plateforme**, y compris avec des clients → BYOK : chaque tenant fournit sa clé IA (ADR-005).
- **Aucune donnée réelle vers un provider qui entraîne** → refusé par code dans le gateway (ADR-004/006).
- **Le noyau ne connaît aucun métier** → un nouvel agent = de la config, jamais du code noyau.
- **Tout est tracé** → aucune action d'agent sans événement dans `execution_event`.

## Démarrage (dev)

1. `pnpm install`
2. `pnpm typecheck`
3. Base : créer un projet Supabase (free tier) et appliquer `packages/db/migrations/0001_phase0_foundations.sql`.

## Phases

- **Phase 0 (ici)** : fondations — multi-tenant, journal, gateway BYOK, contrat d'outil. ✅
- **Phase 1** : la boucle d'agent + 2-3 outils réels → un Sales Agent qui exécute une tâche de bout en bout.
- **Phase 2** : guardrails, HITL, temps réel, dashboard de preuve.
- **Phase 3+** : bibliothèque d'agents (config), mémoire, apprentissage, orchestration.
