# État du backlog — **fichier généré**

> ⚠️ **Ne pas modifier à la main.** Produit par `pnpm run backlog:etat` à partir du dépôt ;
> `pnpm run backlog:verifier` échoue s'il n'est plus à jour, et l'intégration continue le lance.
>
> **Une tâche est « faite » quand un fichier du dépôt le déclare** — une ligne `Réalise : ID`
> dans son en-tête. Le marqueur et la preuve sont donc le même geste : supprimer le fichier
> retire la tâche de l'état, et une mention en prose ne compte pas — l'en-tête de la fonction de
> diagnostic cite `ACQUIS-17` précisément pour dire qu'elle manque.
>
> **« Faite » veut dire implémentée et tracée, pas vérifiée** — c'est `pnpm run verify` qui répond
> de la qualité ([`adr/0024`](adr/0024-verification-automatique.md)). La liste des tâches, elle,
> vit dans [`backlog-v1.csv`](backlog-v1.csv) ; l'ordre des lots dans
> [`12-roadmap.md`](12-roadmap.md) et [`20-plan-action.md`](20-plan-action.md).

---

## Avancement

**136 tâches sur 185** portent une preuve dans le dépôt.

| Lot | Fait | Total | |
|---|---|---|---|
| Fondations (Lot 0) | 38 | 38 | `████████████████████` |
| Noyau (Lot 1) | 22 | 22 | `████████████████████` |
| Métier Commercial (Lot 2) | 23 | 24 | `███████████████████·` |
| Acquisition (Lot 4) | 16 | 24 | `█████████████·······` |
| Recrutement & Paiement (Lot 5) | 6 | 10 | `████████████········` |
| Dashboard (Lot 6) | 8 | 21 | `████████············` |
| Exécution autonome (Lot 3) | 13 | 19 | `██████████████······` |
| Évolution (Lot 7) | 0 | 8 | `····················` |
| Conformité & Lancement (Lot 8) | 3 | 10 | `██████··············` |
| Vérification (transverse) | 7 | 9 | `████████████████····` |
---

## Fondations (Lot 0)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ✅ | **FOND-01** Initialiser le monorepo (pnpm workspaces, tsconfig de base, structure des packages) | P0 | [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) |
| ✅ | **FOND-02** Configurer l'intégration continue (lint, typecheck, tests) | P0 | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| ✅ | **FOND-03** Créer le projet Supabase et connecter les variables d'environnement | P0 | [`supabase/config.toml`](../supabase/config.toml) |
| ✅ | **FOND-04** Migration : table tenant | P0 | [`supabase/migrations/20260729120001_tenant.sql`](../supabase/migrations/20260729120001_tenant.sql) |
| ✅ | **FOND-05** Migration : table tenant_member + politique d'isolation | P0 | [`supabase/migrations/20260729120002_tenant_member.sql`](../supabase/migrations/20260729120002_tenant_member.sql) |
| ✅ | **FOND-06** Migration : table plan (Start/Growth/Scale + quotas en données, drapeau commercialisable) | P0 | [`supabase/migrations/20260729120003_plan.sql`](../supabase/migrations/20260729120003_plan.sql) |
| ✅ | **FOND-07** Migration : table subscription | P0 | [`supabase/migrations/20260729120004_subscription.sql`](../supabase/migrations/20260729120004_subscription.sql) |
| ✅ | **FOND-08** Migration : table usage_counter | P0 | [`supabase/migrations/20260729120005_usage_counter.sql`](../supabase/migrations/20260729120005_usage_counter.sql) |
| ✅ | **FOND-09** Migration : table employee_definition (versionnée) | P0 | [`supabase/migrations/20260729120006_employee_definition.sql`](../supabase/migrations/20260729120006_employee_definition.sql) |
| ✅ | **FOND-10** Migration : table identity (réservoir) | P0 | [`supabase/migrations/20260729120008_identity.sql`](../supabase/migrations/20260729120008_identity.sql) |
| ✅ | **FOND-38** Migration : table sector_profile (versionnée, globale, rédigée par Sentio) | P0 | [`supabase/migrations/20260729120007_sector_profile.sql`](../supabase/migrations/20260729120007_sector_profile.sql) |
| ✅ | **FOND-11** Migration : table employee | P0 | [`supabase/migrations/20260729120011_employee.sql`](../supabase/migrations/20260729120011_employee.sql) |
| ✅ | **FOND-12** Migration : table employee_capability | P0 | [`supabase/migrations/20260729120012_employee_capability.sql`](../supabase/migrations/20260729120012_employee_capability.sql) |
| ✅ | **FOND-13** Migration : table company_profile + traçabilité (auteur/date/tâche source/statut) | P0 | [`supabase/migrations/20260729120022_company_profile.sql`](../supabase/migrations/20260729120022_company_profile.sql) |
| ✅ | **FOND-14** Migration : table learned_fact + traçabilité | P0 | [`supabase/migrations/20260729120023_learned_fact.sql`](../supabase/migrations/20260729120023_learned_fact.sql) |
| ✅ | **FOND-15** Migration : table objective | P0 | [`supabase/migrations/20260729120013_objective.sql`](../supabase/migrations/20260729120013_objective.sql) |
| ✅ | **FOND-16** Migration : table task | P0 | [`supabase/migrations/20260729120014_task.sql`](../supabase/migrations/20260729120014_task.sql) |
| ✅ | **FOND-17** Migration : table job (file d'exécution, priorité, tentatives, verrou) | P0 | [`supabase/migrations/20260729120015_job.sql`](../supabase/migrations/20260729120015_job.sql) |
| ✅ | **FOND-18** Migration : table execution_event (journal append-only) | P0 | [`supabase/migrations/20260729120016_execution_event.sql`](../supabase/migrations/20260729120016_execution_event.sql) |
| ✅ | **FOND-19** Migration : table approval | P0 | [`supabase/migrations/20260729120017_approval.sql`](../supabase/migrations/20260729120017_approval.sql) |
| ✅ | **FOND-20** Migration : table outcome | P0 | [`supabase/migrations/20260729120019_outcome.sql`](../supabase/migrations/20260729120019_outcome.sql) |
| ✅ | **FOND-21** Migration : table notification | P0 | [`supabase/migrations/20260729120021_notification.sql`](../supabase/migrations/20260729120021_notification.sql) |
| ✅ | **FOND-22** Migration : table strategy_change | P0 | [`supabase/migrations/20260729120020_strategy_change.sql`](../supabase/migrations/20260729120020_strategy_change.sql) |
| ✅ | **FOND-23** Migration : table capability | P0 | [`supabase/migrations/20260729120009_capability.sql`](../supabase/migrations/20260729120009_capability.sql) |
| ✅ | **FOND-24** Migration : table capability_binding | P0 | [`supabase/migrations/20260729120010_capability_binding.sql`](../supabase/migrations/20260729120010_capability_binding.sql) |
| ✅ | **FOND-25** Migration : table provider_credential | P0 | [`supabase/migrations/20260729120024_provider_credential.sql`](../supabase/migrations/20260729120024_provider_credential.sql) |
| ✅ | **FOND-26** Migration : table provider_quota | P0 | [`supabase/migrations/20260729120025_provider_quota.sql`](../supabase/migrations/20260729120025_provider_quota.sql) |
| ✅ | **FOND-27** Migration : table diagnostic_session | P0 | [`supabase/migrations/20260729120026_diagnostic_session.sql`](../supabase/migrations/20260729120026_diagnostic_session.sql) |
| ✅ | **FOND-28** Migration : table recommendation | P0 | [`supabase/migrations/20260729120027_recommendation.sql`](../supabase/migrations/20260729120027_recommendation.sql) |
| ✅ | **FOND-29** Migration : table standing_approval (confirmer une fois, révocable) | P0 | [`supabase/migrations/20260729120018_standing_approval.sql`](../supabase/migrations/20260729120018_standing_approval.sql) |
| ✅ | **FOND-30** Activer et vérifier les politiques d'isolation par entreprise sur toutes les tables | P0 | [`supabase/migrations/20260729120029_verify_tenant_isolation.sql`](../supabase/migrations/20260729120029_verify_tenant_isolation.sql) |
| ✅ | **FOND-31** Écrire le repository générique dans packages/db | P0 | [`packages/db/src/repository.ts`](../packages/db/src/repository.ts) |
| ✅ | **FOND-32** Écrire les repositories spécifiques par table dans packages/db | P0 | [`packages/db/src/repositories.ts`](../packages/db/src/repositories.ts) |
| ✅ | **FOND-33** Seed initial : les trois formules (Start/Growth/Scale) en données | P0 | [`supabase/migrations/20260729120031_seed_plans.sql`](../supabase/migrations/20260729120031_seed_plans.sql) |
| ✅ | **FOND-34** Seed initial : réservoir d'identités du métier Commercial (300+ entrées) | P1 | [`supabase/migrations/20260729120032_seed_identities.sql`](../supabase/migrations/20260729120032_seed_identities.sql) |
| ✅ | **FOND-35** Écrire packages/config (quotas, seuils, drapeaux de fonctionnalité, lexique) | P0 | [`packages/config/src/index.ts`](../packages/config/src/index.ts) |
| ✅ | **FOND-36** Écrire les types partagés dans packages/domain (aucune entrée/sortie) | P0 | [`packages/domain/src/index.ts`](../packages/domain/src/index.ts) |
| ✅ | **FOND-37** Champ et politique de rétention du journal (12 mois puis anonymisation) | P1 | [`supabase/migrations/20260729120016_execution_event.sql`](../supabase/migrations/20260729120016_execution_event.sql) |

---

## Noyau (Lot 1)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ✅ | **NOYAU-01** Model Gateway : interface ModelProvider générique | P0 | [`packages/core/src/model/provider.ts`](../packages/core/src/model/provider.ts) |
| ✅ | **NOYAU-02** Model Gateway : implémentation du fournisseur principal (payant, sans entraînement) | P0 | [`packages/core/src/model/http/openai-compatible.ts`](../packages/core/src/model/http/openai-compatible.ts) |
| ✅ | **NOYAU-03** Model Gateway : implémentation du fournisseur de secours/démo (tier gratuit) | P1 | [`packages/core/src/model/http/openai-compatible.ts`](../packages/core/src/model/http/openai-compatible.ts) |
| ✅ | **NOYAU-04** Model Gateway : routage par classe de données (saut du fournisseur non conforme) | P0 | [`packages/core/src/model/gateway.ts`](../packages/core/src/model/gateway.ts) |
| ✅ | **NOYAU-05** Model Gateway : chaîne de repli sur quota/panne passagère uniquement | P0 | [`packages/core/src/model/gateway.ts`](../packages/core/src/model/gateway.ts) |
| ✅ | **NOYAU-06** Model Gateway : comptage par entreprise et par fournisseur | P0 | [`packages/core/src/model/gateway.ts`](../packages/core/src/model/gateway.ts) |
| ✅ | **NOYAU-07** Model Gateway : plafonds durs par entreprise et par jour, report de tâche au dépassement | P0 | [`packages/core/src/model/gateway.ts`](../packages/core/src/model/gateway.ts) · [`supabase/migrations/20260729120037_quota_inference_journalier.sql`](../supabase/migrations/20260729120037_quota_inference_journalier.sql) |
| ✅ | **NOYAU-08** Model Gateway : trois enveloppes séparées (clients/vitrine/interne) | P0 | [`packages/core/src/model/gateway.ts`](../packages/core/src/model/gateway.ts) |
| ✅ | **NOYAU-09** Policy Engine : classification des actions par classe d'effet | P0 | [`packages/core/src/policy/engine.ts`](../packages/core/src/policy/engine.ts) |
| ✅ | **NOYAU-10** Policy Engine : les quatre niveaux d'autonomie (auto/notifier/confirmer/confirmer une fois) | P0 | [`packages/core/src/policy/engine.ts`](../packages/core/src/policy/engine.ts) |
| ✅ | **NOYAU-11** Policy Engine : règle "irréversible jamais auto par défaut" | P0 | [`packages/core/src/policy/engine.ts`](../packages/core/src/policy/engine.ts) |
| ✅ | **NOYAU-12** Policy Engine : gestion de standing_approval (confirmer une fois, révocation) | P0 | [`packages/core/src/policy/engine.ts`](../packages/core/src/policy/engine.ts) |
| ✅ | **NOYAU-13** Assemblage de contexte : injection de la couche 1 ADN (position non négociable) | P0 | [`packages/core/src/context/assemble.ts`](../packages/core/src/context/assemble.ts) |
| ✅ | **NOYAU-14** Assemblage de contexte : injection de la couche 2 profil entreprise + faits appris triés/bornés | P0 | [`packages/core/src/context/assemble.ts`](../packages/core/src/context/assemble.ts) |
| ✅ | **NOYAU-15** Assemblage de contexte : injection de la couche 3 contexte de tâche éphémère | P0 | [`packages/core/src/context/assemble.ts`](../packages/core/src/context/assemble.ts) |
| ✅ | **NOYAU-16** Assemblage de contexte : filtre anti-contradiction (fait appris vs limite ADN) | P0 | [`packages/core/src/context/assemble.ts`](../packages/core/src/context/assemble.ts) |
| ✅ | **NOYAU-17** Registre de capacités : contrat Capability (interface stable) | P0 | [`packages/core/src/capability/registry.ts`](../packages/core/src/capability/registry.ts) |
| ✅ | **NOYAU-18** Registre de capacités : résolution capability_binding → moteur, par formule | P0 | [`packages/core/src/capability/registry.ts`](../packages/core/src/capability/registry.ts) |
| ✅ | **NOYAU-19** Journal d'exécution : fonction d'écriture append-only | P0 | [`packages/db/src/journal.ts`](../packages/db/src/journal.ts) |
| ✅ | **NOYAU-20** Journal d'exécution : reconstruction de trace depuis execution_event | P0 | [`packages/core/src/journal/trace.ts`](../packages/core/src/journal/trace.ts) |
| ✅ | **NOYAU-21** Clé d'idempotence : génération et vérification sur toute action à effet extérieur | P0 | [`packages/core/src/idempotency.ts`](../packages/core/src/idempotency.ts) |
| ✅ | **NOYAU-22** Format ConversationTurn structuré (text/tool_call/tool_result) pour les échanges multi-tours | P0 | [`packages/core/src/conversation/turn.ts`](../packages/core/src/conversation/turn.ts) |

---

## Métier Commercial (Lot 2)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ✅ | **METIER-01** Rédiger l'ADN v1 du métier Commercial, commun à tous les secteurs (rôle, limites, règles, comportement, sécurité) | P0 | [`supabase/migrations/20260729120039_adn_commercial_v1.sql`](../supabase/migrations/20260729120039_adn_commercial_v1.sql) |
| ✅ | **METIER-02** Écrire employee_definition v1 Commercial en base | P0 | [`supabase/migrations/20260729120039_adn_commercial_v1.sql`](../supabase/migrations/20260729120039_adn_commercial_v1.sql) |
| ☐ | **METIER-23** Rédiger le premier profil sectoriel (vocabulaire, interlocuteurs, cycle, objections, angles) | P0 | — |
| ✅ | **METIER-24** Écrire les profils sectoriels en base et prévoir leur versionnage | P0 | [`supabase/migrations/20260812120001_profils_sectoriels.sql`](../supabase/migrations/20260812120001_profils_sectoriels.sql) |
| ✅ | **METIER-03** Migration : table lead (CRM interne minimal, isolé par entreprise) | P0 | [`supabase/migrations/20260729120038_prospection.sql`](../supabase/migrations/20260729120038_prospection.sql) |
| ✅ | **METIER-04** Capacité "trouver des prospects" : contrat | P0 | [`supabase/migrations/20260729120039_adn_commercial_v1.sql`](../supabase/migrations/20260729120039_adn_commercial_v1.sql) |
| ✅ | **METIER-05** Capacité "trouver des prospects" : moteur v1 (donnée fournie par le client) | P0 | [`packages/capabilities/src/prospects/import.ts`](../packages/capabilities/src/prospects/import.ts) |
| ✅ | **METIER-06** Capacité "qualifier un prospect" : contrat | P0 | [`supabase/migrations/20260729120039_adn_commercial_v1.sql`](../supabase/migrations/20260729120039_adn_commercial_v1.sql) |
| ✅ | **METIER-07** Capacité "qualifier un prospect" : moteur | P0 | [`packages/capabilities/src/prospects/qualify.ts`](../packages/capabilities/src/prospects/qualify.ts) |
| ✅ | **METIER-08** Capacité "envoyer un message de prospection" : contrat | P0 | [`supabase/migrations/20260729120039_adn_commercial_v1.sql`](../supabase/migrations/20260729120039_adn_commercial_v1.sql) |
| ✅ | **METIER-09** Capacité "envoyer un message de prospection" : moteur (service d'envoi) | P0 | [`scripts/etat-du-backlog.mjs`](../scripts/etat-du-backlog.mjs) · [`packages/capabilities/src/email/send-message.ts`](../packages/capabilities/src/email/send-message.ts) |
| ✅ | **METIER-10** Garde-fou : mention d'opposition obligatoire dans chaque message envoyé | P0 | [`scripts/etat-du-backlog.mjs`](../scripts/etat-du-backlog.mjs) · [`packages/capabilities/src/email/send-message.ts`](../packages/capabilities/src/email/send-message.ts) |
| ✅ | **METIER-11** Garde-fou : respect immédiat des désinscriptions | P0 | [`packages/domain/src/optout.ts`](../packages/domain/src/optout.ts) |
| ✅ | **METIER-12** Capacité "relancer un prospect" : contrat + moteur | P1 | [`packages/capabilities/src/email/follow-up.ts`](../packages/capabilities/src/email/follow-up.ts) · [`supabase/migrations/20260812120002_relance.sql`](../supabase/migrations/20260812120002_relance.sql) |
| ✅ | **METIER-13** Capacité "mettre à jour une fiche CRM" : contrat + moteur | P0 | [`packages/capabilities/src/prospects/update-fiche.ts`](../packages/capabilities/src/prospects/update-fiche.ts) |
| ✅ | **METIER-14** Réflexion post-run spécifique au Commercial (0 à 3 faits par run) | P1 | [`packages/core/src/runtime/reflexion.ts`](../packages/core/src/runtime/reflexion.ts) |
| ✅ | **METIER-15** Variantes de stratégie du Commercial (angles d'accroche, moments de relance) | P1 | [`packages/core/src/runtime/variantes.ts`](../packages/core/src/runtime/variantes.ts) · [`supabase/migrations/20260812120003_variantes_de_strategie.sql`](../supabase/migrations/20260812120003_variantes_de_strategie.sql) |
| ✅ | **METIER-16** Migration : table suppression_entry (exclusions par entreprise - clients, concurrents, comptes sensibles) | P0 | [`supabase/migrations/20260729120038_prospection.sql`](../supabase/migrations/20260729120038_prospection.sql) |
| ✅ | **METIER-17** Garde-fou : vérification des exclusions avant tout envoi (bloquant, pas consultatif) | P0 | [`supabase/migrations/20260729120038_prospection.sql`](../supabase/migrations/20260729120038_prospection.sql) |
| ✅ | **METIER-18** Vérification de l'authentification du domaine d'envoi (SPF, DKIM, DMARC) à l'onboarding | P0 | [`packages/capabilities/src/email/domain-auth.ts`](../packages/capabilities/src/email/domain-auth.ts) |
| ✅ | **METIER-19** Montée en charge progressive du volume d'envoi sur un domaine neuf | P0 | [`supabase/migrations/20260729120038_prospection.sql`](../supabase/migrations/20260729120038_prospection.sql) |
| ✅ | **METIER-20** Plafond dur de volume d'envoi par employé et par jour | P0 | [`supabase/migrations/20260729120038_prospection.sql`](../supabase/migrations/20260729120038_prospection.sql) |
| ✅ | **METIER-21** Surveillance des taux de rebond et de plainte, avec suspension automatique au seuil | P0 | [`packages/capabilities/src/email/reputation.ts`](../packages/capabilities/src/email/reputation.ts) |
| ✅ | **METIER-22** Journalisation du motif de sélection d'un prospect (raisonnement métier, pas mécanique) | P0 | [`packages/capabilities/src/prospects/qualify.ts`](../packages/capabilities/src/prospects/qualify.ts) |

---

## Acquisition (Lot 4)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ☐ | **ACQUIS-01** Layout de la vitrine + navigation | P0 | — |
| ☐ | **ACQUIS-02** Section Hero de la vitrine | P1 | — |
| ☐ | **ACQUIS-03** Section Mission de la vitrine | P1 | — |
| ☐ | **ACQUIS-04** Section démonstration scriptée (données fixes, présentée comme démonstration) | P0 | — |
| ☐ | **ACQUIS-05** Section "comment ça marche" | P2 | — |
| ☐ | **ACQUIS-06** Section tarifs (Start affichée comme achetable, Growth/Scale visibles non actives) | P0 | — |
| ✅ | **ACQUIS-07** Page légale : mentions légales (contenu provisoire signalé) | P0 | [`apps/vitrine/src/app/legal/mentions/page.tsx`](../apps/vitrine/src/app/legal/mentions/page.tsx) |
| ✅ | **ACQUIS-08** Page légale : conditions générales d'utilisation/vente | P0 | [`apps/vitrine/src/app/legal/cgu/page.tsx`](../apps/vitrine/src/app/legal/cgu/page.tsx) |
| ✅ | **ACQUIS-09** Page légale : politique de confidentialité | P0 | [`apps/vitrine/src/app/legal/confidentialite/page.tsx`](../apps/vitrine/src/app/legal/confidentialite/page.tsx) |
| ✅ | **ACQUIS-10** Page légale : politique de cookies | P1 | [`apps/vitrine/src/app/legal/cookies/page.tsx`](../apps/vitrine/src/app/legal/cookies/page.tsx) |
| ✅ | **ACQUIS-11** Page légale : formulaire de demande RGPD (accès/effacement/contestation) | P0 | [`apps/vitrine/src/components/legal/RgpdRequestForm.tsx`](../apps/vitrine/src/components/legal/RgpdRequestForm.tsx) |
| ✅ | **ACQUIS-12** Composant de conversation de diagnostic (aller-retour direct au Model Gateway) | P0 | [`apps/vitrine/src/components/diagnostic/DiagnosticExperience.tsx`](../apps/vitrine/src/components/diagnostic/DiagnosticExperience.tsx) |
| ✅ | **ACQUIS-13** Extraction de profil structuré depuis la conversation de diagnostic | P0 | [`scripts/etat-du-backlog.mjs`](../scripts/etat-du-backlog.mjs) · [`packages/domain/src/diagnostic-request.ts`](../packages/domain/src/diagnostic-request.ts) |
| ✅ | **ACQUIS-14** Moteur de règles déterministe (frein + situation → calibrage de l'employé) | P0 | [`scripts/etat-du-backlog.mjs`](../scripts/etat-du-backlog.mjs) · [`packages/domain/src/recommendation.ts`](../packages/domain/src/recommendation.ts) |
| ✅ | **ACQUIS-15** Génération de la justification de recommandation par le modèle | P0 | [`packages/vitrine-core/src/diagnostic/presentation.ts`](../packages/vitrine-core/src/diagnostic/presentation.ts) |
| ☐ | **ACQUIS-21** Questions de calibrage du diagnostic, bornées à ce que les capacités savent faire | P0 | — |
| ☐ | **ACQUIS-22** Écriture du calibrage dans le profil entreprise et les capacités actives (jamais l'ADN) | P0 | — |
| ✅ | **ACQUIS-23** Identification du secteur du client pendant le diagnostic | P0 | [`packages/domain/src/secteur.ts`](../packages/domain/src/secteur.ts) |
| ✅ | **ACQUIS-24** Sélection du profil sectoriel par le moteur déterministe, message honnête si aucun ne correspond | P0 | [`packages/domain/src/secteur.ts`](../packages/domain/src/secteur.ts) |
| ✅ | **ACQUIS-16** Cas "besoin hors périmètre détecté" : message honnête + liste d'attente | P0 | [`packages/domain/src/liste-attente.ts`](../packages/domain/src/liste-attente.ts) · [`supabase/migrations/20260812120004_liste_attente.sql`](../supabase/migrations/20260812120004_liste_attente.sql) |
| ✅ | **ACQUIS-17** Limitation par visiteur et par adresse sur le diagnostic public | P0 | [`apps/vitrine/src/lib/diagnostic-rate-limit.ts`](../apps/vitrine/src/lib/diagnostic-rate-limit.ts) |
| ✅ | **ACQUIS-18** Enveloppe d'inférence dédiée au diagnostic public (plafond appliqué) | P0 | [`packages/vitrine-core/src/gateway/envelope.ts`](../packages/vitrine-core/src/gateway/envelope.ts) · [`apps/vitrine/migrations/0013_provider_quota.sql`](../apps/vitrine/migrations/0013_provider_quota.sql) |
| ✅ | **ACQUIS-19** Jeu de conversations de référence pour le diagnostic | P1 | [`packages/domain/src/recommendation.test.ts`](../packages/domain/src/recommendation.test.ts) |
| ✅ | **ACQUIS-20** Test de non-régression rejouant le jeu de référence à chaque modification de prompt | P1 | [`packages/domain/src/recommendation.test.ts`](../packages/domain/src/recommendation.test.ts) |

---

## Recrutement & Paiement (Lot 5)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ☐ | **RECRUT-01** Intégration du prestataire de paiement (paiement hébergé) | P0 | — |
| ✅ | **RECRUT-02** Point d'entrée de confirmation serveur du paiement (jamais la redirection navigateur) | P0 | [`supabase/functions/recrutement/index.ts`](../supabase/functions/recrutement/index.ts) · [`packages/domain/src/charge-signee.test.ts`](../packages/domain/src/charge-signee.test.ts) |
| ✅ | **RECRUT-03** Réservation atomique d'une identité dans le réservoir | P0 | [`supabase/migrations/20260815120009_recrutement.sql`](../supabase/migrations/20260815120009_recrutement.sql) |
| ✅ | **RECRUT-04** Création de l'employé sur une version figée d'ADN | P0 | [`supabase/migrations/20260815120009_recrutement.sql`](../supabase/migrations/20260815120009_recrutement.sql) |
| ✅ | **RECRUT-05** Initialisation du Contexte Entreprise depuis le profil du diagnostic et le profil sectoriel | P0 | [`supabase/migrations/20260815120009_recrutement.sql`](../supabase/migrations/20260815120009_recrutement.sql) |
| ✅ | **RECRUT-06** Notification de recrutement ("Bienvenue, X rejoint votre entreprise") | P0 | [`supabase/migrations/20260815120009_recrutement.sql`](../supabase/migrations/20260815120009_recrutement.sql) |
| ☐ | **RECRUT-07** Page de succès de paiement + ouverture de l'accès à l'espace privé | P0 | — |
| ☐ | **RECRUT-08** Authentification par lien magique (connexion) | P0 | — |
| ☐ | **RECRUT-09** Protection anti-scanner du lien de connexion (callback) | P1 | — |
| ✅ | **RECRUT-10** Rattachement automatique de l'utilisateur au tenant créé pendant le diagnostic | P0 | [`supabase/migrations/20260815120009_recrutement.sql`](../supabase/migrations/20260815120009_recrutement.sql) · [`supabase/migrations/20260815120010_un_visiteur_devient_client.sql`](../supabase/migrations/20260815120010_un_visiteur_devient_client.sql) |

---

## Dashboard (Lot 6)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ✅ | **DASH-01** Layout de l'espace privé (dashboard) | P0 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) |
| ✅ | **DASH-02** Fiche employé : mission, objectif, périmètre | P0 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) · [`supabase/migrations/20260815120012_le_client_voit_son_employe.sql`](../supabase/migrations/20260815120012_le_client_voit_son_employe.sql) |
| ✅ | **DASH-03** Fiche employé : performances et progression | P0 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) |
| ✅ | **DASH-04** Fiche employé : compétences / capacités actives | P1 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) |
| ✅ | **DASH-05** Vue "progression vers l'objectif" (CA attribué / objectif déclaré) | P0 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) |
| ☐ | **DASH-06** Déclaration de vente par le client (confirmation d'attribution) | P0 | — |
| ☐ | **DASH-07** Calcul du CA généré (fenêtre d'attribution annoncée) | P0 | — |
| ☐ | **DASH-08** Calcul du temps économisé (estimation documentée et affichée comme telle) | P1 | — |
| ☐ | **DASH-09** Calcul du ROI dérivé (CA attribué − prix / prix) | P1 | — |
| ✅ | **DASH-10** État vide soigné du dashboard (montée en puissance lisible) | P0 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) |
| ✅ | **DASH-11** Liste des notifications (Recrutement/Travail/Évolution) | P0 | [`apps/vitrine/src/app/espace/page.tsx`](../apps/vitrine/src/app/espace/page.tsx) |
| ☐ | **DASH-12** Guide de première connexion (bulles, affiché une seule fois) | P1 | — |
| ☐ | **DASH-13** Gestion de l'abonnement (visualisation, statut) | P1 | — |
| ☐ | **DASH-14** Section CRM minimal côté client ("vos prospects") | P1 | — |
| ☐ | **DASH-15** Contrôles de validation humaine (approuver/refuser une action suspendue) | P0 | — |
| ✅ | **DASH-16** Réglage du niveau d'autonomie par le client | P1 | [`supabase/migrations/20260815120011_regler_l_autonomie.sql`](../supabase/migrations/20260815120011_regler_l_autonomie.sql) |
| ☐ | **DASH-17** Vue temps réel d'exécution d'une tâche (abonnement live) | P2 | — |
| ☐ | **DASH-18** Affichage des repères de performance réalistes à côté des résultats mesurés | P0 | — |
| ☐ | **DASH-19** Affichage du motif de sélection d'un prospect ("pourquoi cette entreprise") | P1 | — |
| ☐ | **DASH-20** Gestion des exclusions par le client (ajouter, retirer un compte exclu) | P1 | — |
| ☐ | **DASH-21** Correction du calibrage par le client (cible, ton, objectif) depuis le profil entreprise | P1 | — |

---

## Exécution autonome (Lot 3)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ✅ | **EXEC-01** Point d'entrée signé déclenché par un battement planifié | P0 | [`packages/runtime/src/heartbeat/index.ts`](../packages/runtime/src/heartbeat/index.ts) · [`packages/domain/src/heartbeat-signature.ts`](../packages/domain/src/heartbeat-signature.ts) |
| ✅ | **EXEC-02** Runtime : charger l'état persisté d'un run | P0 | [`packages/core/src/journal/run-state.ts`](../packages/core/src/journal/run-state.ts) · [`packages/core/src/journal/vocabulaire.ts`](../packages/core/src/journal/vocabulaire.ts) |
| ✅ | **EXEC-03** Runtime : appeler l'assemblage de contexte pour le pas courant | P0 | [`packages/runtime/src/step-context.ts`](../packages/runtime/src/step-context.ts) |
| ✅ | **EXEC-04** Runtime : demander la prochaine action au Model Gateway | P0 | [`packages/core/src/runtime/next-action.ts`](../packages/core/src/runtime/next-action.ts) |
| ✅ | **EXEC-05** Runtime : soumettre l'action au Policy Engine | P0 | [`packages/runtime/src/next-step.ts`](../packages/runtime/src/next-step.ts) · [`supabase/migrations/20260806120002_autonomie_et_accords.sql`](../supabase/migrations/20260806120002_autonomie_et_accords.sql) |
| ✅ | **EXEC-06** Runtime : exécuter l'action ou suspendre selon la décision de politique | P0 | [`packages/core/src/runtime/execute-action.ts`](../packages/core/src/runtime/execute-action.ts) |
| ✅ | **EXEC-07** Runtime : écrire l'événement d'exécution au journal | P0 | [`packages/core/src/journal/trace-du-pas.ts`](../packages/core/src/journal/trace-du-pas.ts) · [`supabase/migrations/20260806120003_pas_de_run.sql`](../supabase/migrations/20260806120003_pas_de_run.sql) |
| ✅ | **EXEC-08** Runtime : replanifier le pas suivant ou terminer le run | P0 | [`packages/core/src/ports.ts`](../packages/core/src/ports.ts) · [`packages/runtime/src/suite-du-run.ts`](../packages/runtime/src/suite-du-run.ts) |
| ☐ | **EXEC-09** Reprise après interruption (reconstruction d'état depuis le journal) | P0 | — |
| ☐ | **EXEC-10** Suspension d'un run en attente d'accord humain | P0 | — |
| ✅ | **EXEC-11** Reprise après validation humaine (approve/reject/trustFuture) | P0 | [`supabase/migrations/20260815120016_reprendre_apres_accord.sql`](../supabase/migrations/20260815120016_reprendre_apres_accord.sql) |
| ✅ | **EXEC-12** Verrouillage par ligne de la file job + saut des lignes verrouillées | P0 | [`packages/runtime/src/boucle.ts`](../packages/runtime/src/boucle.ts) · [`packages/runtime/src/adapters/moteurs.ts`](../packages/runtime/src/adapters/moteurs.ts) |
| ☐ | **EXEC-13** Priorité d'exécution pilotée par la formule du client | P1 | — |
| ☐ | **EXEC-14** Notifications de travail émises depuis les outcomes journalisés | P0 | — |
| ☐ | **EXEC-15** Réflexion après run, tolérante aux erreurs (jamais bloquante) | P1 | — |
| ☐ | **EXEC-16** Ordre total sur objective : le dernier objectif ne se déduit pas de created_at (identique dans une même transaction) | P1 | — |
| ✅ | **EXEC-17** Approvisionnement : ouvrir les nouvelles missions du jour, de façon déterministe et bornée | P0 | [`packages/core/src/ports.ts`](../packages/core/src/ports.ts) · [`packages/runtime/src/battement.ts`](../packages/runtime/src/battement.ts) |
| ✅ | **EXEC-18** Racine de composition du worker : environnement validé, adaptateurs assemblés, battement signé servi | P0 | [`apps/worker/src/main.ts`](../apps/worker/src/main.ts) · [`apps/worker/src/serveur.ts`](../apps/worker/src/serveur.ts) |
| ✅ | **EXEC-19** Exécutant en fonction serveur (Deno) : runtime partagé, pilote, boucle complète et parité avec Node | P0 | [`packages/runtime/src/attelage.ts`](../packages/runtime/src/attelage.ts) · [`packages/runtime/src/attelage.test.ts`](../packages/runtime/src/attelage.test.ts) |

---

## Évolution (Lot 7)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ☐ | **EVOL-01** Écriture des faits appris (learned_fact) depuis la réflexion post-run | P0 | — |
| ☐ | **EVOL-02** Application des modifications proposées au profil entreprise par l'apprentissage | P2 | — |
| ☐ | **EVOL-03** Notification client sur modification du profil entreprise par l'apprentissage | P2 | — |
| ☐ | **EVOL-04** Sélection de la variante gagnante à partir des outcomes mesurés | P2 | — |
| ☐ | **EVOL-05** Écriture de strategy_change à chaque évolution réelle | P0 | — |
| ☐ | **EVOL-06** Notification d'évolution adossée strictement à strategy_change | P0 | — |
| ☐ | **EVOL-07** Interface client : consulter les faits appris | P1 | — |
| ☐ | **EVOL-08** Interface client : corriger ou retirer un fait appris | P1 | — |

---

## Conformité & Lancement (Lot 8)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ☐ | **CONF-01** Rédaction des mentions légales définitives (post-immatriculation) | P0 | — |
| ☐ | **CONF-02** Rédaction des CGU/CGV définitives | P0 | — |
| ☐ | **CONF-03** Rédaction du registre des traitements RGPD | P0 | — |
| ☐ | **CONF-04** Rédaction de l'analyse d'impact (AIPD, décision automatisée) | P0 | — |
| ✅ | **CONF-05** Implémentation de la procédure d'effacement (anonymisation du journal) | P0 | [`supabase/migrations/20260729120036_effacement.sql`](../supabase/migrations/20260729120036_effacement.sql) |
| ✅ | **CONF-06** Script de sauvegarde exportée hors plateforme | P0 | [`scripts/sauvegarder.mjs`](../scripts/sauvegarder.mjs) |
| ✅ | **CONF-07** Surveillance minimale : alerte email sur quota/échecs/taille base/tâches bloquées | P0 | [`scripts/surveiller.mjs`](../scripts/surveiller.mjs) · [`supabase/migrations/20260815120014_etat_de_sante.sql`](../supabase/migrations/20260815120014_etat_de_sante.sql) |
| ☐ | **CONF-08** Contrôle automatique du lexique interdit en intégration continue | P1 | — |
| ☐ | **CONF-09** Checklist de vérification des conditions d'usage commercial des offres gratuites (préparation, décision humaine finale) | P0 | — |
| ☐ | **CONF-10** Modèle de contrat de sous-traitance par prestataire (préparation, signature humaine) | P0 | — |

---

## Vérification (transverse)

| | Tâche | Priorité | Preuve dans le dépôt |
|---|---|---|---|
| ✅ | **TEST-01** Test automatisé : isolation entre entreprises (accès croisé refusé) | P0 | [`supabase/tests/invariants.sql`](../supabase/tests/invariants.sql) · [`supabase/migrations/20260729120029_verify_tenant_isolation.sql`](../supabase/migrations/20260729120029_verify_tenant_isolation.sql) |
| ✅ | **TEST-02** Test automatisé : verrou de métier (refus + trace au journal) | P0 | [`packages/core/src/policy/engine.test.ts`](../packages/core/src/policy/engine.test.ts) |
| ☐ | **TEST-03** Test automatisé : verrou d'apprentissage (ADN inchangé bit à bit après N runs) | P0 | — |
| ✅ | **TEST-04** Test automatisé : classe de données (aucune donnée réelle vers fournisseur non conforme) | P0 | [`packages/core/src/model/gateway.test.ts`](../packages/core/src/model/gateway.test.ts) |
| ✅ | **TEST-05** Test automatisé : idempotence (rejeu ne duplique pas l'effet) | P0 | [`supabase/tests/invariants.sql`](../supabase/tests/invariants.sql) |
| ☐ | **TEST-06** Test automatisé : reprise après interruption | P0 | — |
| ✅ | **TEST-07** Test automatisé : quotas (report propre, pas de dégradation silencieuse, pas d'impact cross-tenant) | P0 | [`packages/core/src/model/gateway.test.ts`](../packages/core/src/model/gateway.test.ts) |
| ✅ | **TEST-08** Test automatisé : honnêteté des chiffres (aucun chiffre sans ligne en base) | P1 | [`supabase/tests/invariants.sql`](../supabase/tests/invariants.sql) |
| ✅ | **TEST-09** Test automatisé : ouverture de formule par simple modification de donnée | P1 | [`supabase/tests/invariants.sql`](../supabase/tests/invariants.sql) |
