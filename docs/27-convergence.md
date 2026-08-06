# Convergence — faire du cœur la source de vérité unique

> **Statut : audit et plan. Aucune migration n'a été exécutée, aucune table n'a été touchée.**
> Décision du 2026-08-06 : arrêter de développer une seconde génération du produit en parallèle.
> La convergence devient une priorité d'architecture avant d'aller beaucoup plus loin dans
> `apps/vitrine`.

Ce document répond à une question précise : **comment faire de `supabase/migrations` +
`packages/domain` + `packages/core` la source de vérité unique de Sentio**, sans casser ce qui
fonctionne aujourd'hui et sans étape irréversible.

---

## 0. Ce que la convergence doit préserver — la vision, avant la technique

Sentio est **généraliste sur les métiers, extrêmement personnalisé sur chaque entreprise**. Ce
n'est pas une formule marketing : c'est une contrainte d'architecture, et c'est elle qui décide
de la cible.

Elle se traduit par trois couches, déjà modélisées dans le cœur et **absentes de la vitrine** :

| Couche | Portée | Table | Qui l'écrit |
|---|---|---|---|
| **ADN du métier** | commun à tous les clients d'un métier, immuable | `employee_definition.dna` | Sentio, par publication de version |
| **Profil sectoriel** | commun à un secteur | `sector_profile.content` | Sentio, jamais dérivé d'un client |
| **Contexte entreprise** | propre à UNE entreprise | `company_profile`, `learned_fact` | le client, et l'apprentissage |

C'est exactement le mouvement que le produit promet : partir du **diagnostic** d'une entreprise,
puis construire progressivement son employé à partir de ses objectifs, son activité, ses
contraintes, son ton, ses preuves, ses objections. Le cœur sait déjà le faire —
[`assembleContext`](../packages/core/src/context/assemble.ts) empile les trois couches dans un
ordre non négociable, borne la mémoire injectée, et écarte tout fait appris qui contredit les
limites de l'ADN.

**La vitrine ne sait pas le faire.** Son assembleur
([`packages/vitrine-core/src/context/index.ts`](../packages/vitrine-core/src/context/index.ts))
concatène un `systemPrompt` libre et une liste de faits, sans ADN, sans limites, sans filtre,
sans statut actif/retiré. C'est la différence entre un employé encadré et une chaîne de
caractères.

**Conséquence directe sur la cible :** il ne doit exister qu'**un seul moteur métier**. Toute
règle de comportement d'employé vit dans `packages/domain` et `packages/core`. `apps/vitrine`
n'en héberge aucune — elle affiche et elle déclenche.

---

## 1. État actuel

### 1.1 Deux générations, pas deux services

| | Cœur (`supabase/`, `packages/`) | Vitrine (`apps/vitrine`, `packages/vitrine-core`) |
|---|---|---|
| Projet Supabase | `ritwmikarekkisxaiokf` | `rybeumdjclajiypglmuj` |
| Migrations | 40 | 11 |
| Tables | 33 | 13 |
| Fonctions SQL | 9 | 0 |
| Avancement backlog | 94 / 181 tâches tracées | hors backlog |
| Tourne en production | non (lot 3 « Exécution autonome » : 0/15) | oui |

Les deux ne sont pas des services qui doivent se parler : ils **modélisent la même chose deux
fois**. La vitrine est l'héritière du prototype `apps/web` (ADR-017/018/019) ; le cœur est la
version aboutie du même produit.

### 1.2 Ce qui n'existe QUE dans `apps/vitrine`

Ce sont des fonctionnalités réelles, qui tournent, et dont le cœur n'a que des cases à cocher.

| Fonctionnalité | Où | Équivalent cœur |
|---|---|---|
| Interface complète (19 routes) | `src/app/**` | ☐ DASH-01..21 |
| Paiement Stripe + page de succès | `lib/stripe.ts`, `/checkout` | ☐ RECRUT-01, 02, 07 |
| **Boucle d'exécution qui tourne** | `vitrine-core/runtime`, `execution` | ☐ EXEC-01..15 |
| Reprise après validation humaine | `vitrine-core/approve-real.ts` | ☐ EXEC-11 |
| Cron de prospection | `api/cron/prospect` | ☐ EXEC-01 |
| Chat d'accueil (crée le tenant) | `OnboardingChat`, `platform-create-tenant.ts` | ☐ RECRUT-10 |
| Chat de briefing d'après-achat | `company-briefing/**` | ☐ DASH-21, RECRUT-05 |
| Diagnostic conversationnel **complet** | `diagnostic-actions.ts`, `vitrine-core/diagnostic` | partiel — voir 1.4 |
| Plafond par visiteur et par adresse | `diagnostic-rate-limit.ts`, table `diagnostic_rate_limit` | ☐ ACQUIS-17 |
| Registre RGPD + formulaire | `rgpd-actions.ts`, table `rgpd_request` | aucun |
| Notifications par email | `notify.ts` | partiel (table seule) |
| Temps réel d'un run | `TaskLive.tsx` + Realtime | ☐ DASH-17 |
| Grille tarifaire commerciale | `lib/plans.ts` | divergente — voir 3.3 |
| Registre des 5 métiers | `lib/agent-roles.ts` | `employee_definition` (1 métier) |
| Clés IA par entreprise (BYOK) | table `tenant_ai_credential` | divergent — voir 3.3 |

### 1.3 Ce qui existe DÉJÀ dans le cœur, et manque à la vitrine

| Capacité | Où | Ce que la vitrine n'a pas |
|---|---|---|
| ADN métier immuable | `employee_definition` + trigger `reject_dna_mutation` | `agent_definition.system_prompt` est du texte libre, modifiable |
| ADN commercial v1 publié | migration `…39_adn_commercial_v1` | — |
| Contexte à 3 couches + filtre anti-contradiction | `core/context/assemble.ts` | assembleur plat, sans limites |
| Mémoire avec provenance et statut | `company_profile`, `learned_fact` (`author`, `status`, `usage_count`, `source_task_id`) + trigger `protect_memory_provenance` | `agent_memory` : un texte, sans auteur ni statut |
| Réservoir d'identités, unicité **globale** | `identity` + `reserve_identity()` atomique | `agent_instance.name` en texte libre |
| Quotas en données | `plan`, `plan_quota`, `usage_counter` | grille en dur dans le code |
| Capacité = contrat, moteur remplaçable | `capability`, `capability_binding` | outils codés en dur |
| File de travail avec verrouillage et priorité | `job` | aucune file |
| Objectifs, résultats, ROI | `objective`, `outcome`, `strategy_change` | aucun |
| Délivrabilité et opt-out | `sending_domain`, `outbound_message`, `suppression`, `peut_envoyer()` | envoi direct, sans garde |
| Diagnostic tracé | `diagnostic_session`, `recommendation` | rien n'est conservé |
| Effacement et rétention | `erase_tenant()`, `purge_execution_events()` | suppression manuelle |
| **Isolation vérifiée en base** | `verify_tenant_isolation`, `cle_etrangere_par_entreprise`, `ligne_ne_change_pas_entreprise` | RLS présente mais **contournée** — voir §8 |
| Preuve de non-entraînement | contrainte `provider_no_train_needs_proof` | `data_policy` déclaratif |

### 1.4 Ce qui est dupliqué

**Tables** (vitrine → cœur) : `tenant`, `tenant_member`, `task`, `execution_event`, `lead`,
`standing_approval`, `notification`, `agent_memory`→`learned_fact`,
`agent_instance`→`employee`, `agent_definition`→`employee_definition`,
`tenant_ai_credential`→`provider_credential`.

**Code** (`packages/vitrine-core` → cœur) :

| Vitrine | Cœur | Nature de la duplication |
|---|---|---|
| `gateway/` + `providers/gemini`, `groq` | `core/model/gateway.ts`, `model/http/` | même rôle, deux implémentations |
| `context/index.ts` | `core/context/assemble.ts` | **pas équivalent** : la vitrine est nettement plus faible |
| `policy/index.ts` | `core/policy/engine.ts` | même rôle |
| `runtime/`, `execution/` | à écrire (lot 3) | la vitrine a l'implémentation, le cœur a la spécification |
| `memory/` | `learned_fact` + repositories | modèle plus pauvre côté vitrine |
| `tools/impl/*` | `packages/capabilities/*` | `crm-read-leads`↔`prospects/import`, `mail-send`↔`email/send-message`, etc. |
| `diagnostic/` | `supabase/functions/diagnostic` + `domain` | **le seul cas où la vitrine est en avance** |

**Le diagnostic mérite une note** : la fonction edge du cœur est explicitement inachevée — son
en-tête déclare qu'elle ne trace rien (`ACQUIS-22`), ne limite rien (`ACQUIS-17`), ne rédige
aucune justification (`ACQUIS-15`), et son drapeau `publicDiagnosticEnabled` la rend inerte. La
vitrine, elle, a les trois. Ce ne sont pas des lignes à jeter : ce sont trois tâches du backlog
déjà résolues, à porter.

### 1.5 Le pont qui existe déjà, et qui marche

`@sentio/domain` est **déjà partagé** : `packages/vitrine-core/src/diagnostic/` importe
`recommend()`, `parseDiagnosticProfile()`, `HANDLED_FRICTIONS` — les mêmes fonctions que la
fonction edge du cœur. Le calibrage du diagnostic est donc **déjà convergé au niveau des
règles** ; seuls la persistance et le fournisseur de modèle divergent.

C'est la preuve que la cible est atteignable, et le modèle à généraliser : la vitrine consomme
le domaine, elle ne le réimplémente pas.

### 1.6 Dépendances actuelles

```
apps/worker      → @sentio/core, @sentio/db, @sentio/domain, @sentio/config, @sentio/capabilities
apps/vitrine     → @sentio/vitrine-core (17 imports), @sentio/domain (1)
vitrine-core     → @sentio/domain (9) — et rien d'autre du cœur
supabase/functions → @sentio/domain, @sentio/config (frontière tenue par verifier-frontieres.mjs)
```

Aucun cycle. `packages/vitrine-core` ne dépend de rien du cœur sauf le domaine — donc **le
retirer ne casse rien du cœur**. Tout le travail de convergence est du côté d'`apps/vitrine`.

---

## 2. Architecture cible

```
supabase/migrations     ← LE schéma. Unique.
packages/domain         ← les règles pures (aucune E/S)
packages/core           ← le moteur : gateway, policy, contexte 3 couches, journal, capacités
packages/db             ← l'accès, portée entreprise OBLIGATOIRE (forTenant)
packages/capabilities   ← les moteurs d'action (email, prospects), remplaçables
packages/config         ← drapeaux, seuils, lexique
apps/worker             ← l'exécution autonome (la boucle)
apps/vitrine            ← UNE INTERFACE. Rien d'autre.
supabase/functions      ← adaptateurs d'entrée (valident, appellent, répondent)
packages/vitrine-core   ← SUPPRIMÉ
```

**Ce que devient `apps/vitrine`** :

- ses Server Components lisent par `@sentio/db` avec une portée entreprise, jamais par un pool
  qui contourne RLS ;
- ses Server Actions valident l'entrée puis appellent `@sentio/core` ou déposent un `job` ;
- elle n'appelle jamais un fournisseur de modèle directement ;
- elle ne contient aucune règle décidant du comportement d'un employé.

**Ce qui rend la vision tenable** : parce qu'il n'y a qu'un moteur, personnaliser une entreprise
ne peut se faire que d'une seule façon — écrire dans `company_profile`. Le chat de briefing, la
correction du calibrage depuis le dashboard (DASH-21) et l'initialisation depuis le diagnostic
(RECRUT-05) deviennent **trois entrées de la même table**, relues par le même assembleur. C'est
précisément ce qu'un second moteur dans la vitrine rendrait impossible à garantir.

---

## 3. Mapping des tables

### 3.1 Correspondances directes

| Vitrine | Cœur | Écart |
|---|---|---|
| `tenant` | `tenant` | identique — `id` conservable |
| `tenant_member` | `tenant_member` | vitrine : clé composite ; cœur : `id` + `role` contraint |
| `lead` | `lead` | renommages + **champs obligatoires absents** : `source`, `qualification`, `status` |
| `standing_approval` | `standing_approval` | `agent_instance_id`→`employee_id` ; `granted_by`, `first_task_id` sans équivalent |
| `agent_memory` | `learned_fact` | à enrichir : `author`, `status`, `usage_count` |
| `agent_definition` | `employee_definition` | **non mécanique** — voir 3.2 |
| `agent_instance` | `employee` + `company_profile` + `employee_capability` | **éclatement** — voir 3.2 |
| `tenant_ai_credential` | `provider_credential` | **divergence de conception** — voir 3.3 |

### 3.2 Correspondances qui ne sont pas des renommages

**`agent_definition.system_prompt` → `employee_definition.dna`.** Le cœur n'accepte pas un texte
libre : `parseDna()` exige `profession`, `mission`, `perimetre[]`, `limites[]`, et **refuse** un
ADN sans limites. Il n'existe aucune transformation automatique d'un prompt en ADN structuré.
L'ADN commercial v1 est déjà publié dans le cœur ; la bonne opération n'est pas de convertir
celui de la vitrine, c'est de **rattacher les employés existants à l'ADN du cœur**.

**`agent_instance` → trois tables.** Sa colonne `config` est un sac fourre-tout :

| `config.*` | Destination | Note |
|---|---|---|
| `companyProfile.{activite,cible,offre,preuves,objections,exclusions,ton,interdits}` | `company_profile` — une ligne par clé, `author='client'` | **conçu pour ça** (ADR-020 vitrine) |
| `prospectingCriteria`, `prospectingOffer` | idem, clés `cible` et `offre` | doublons historiques, à ne pas migrer deux fois |
| `systemPrompt` (posé par le chat d'accueil) | **sans destination** | voir §6, risque R2 |
| `autonomy` | `standing_approval` par `effect_class` | modèle différent : le cœur décide par classe d'effet |
| `is_active` | `subscription.status` | l'activité découle de l'abonnement, pas d'un booléen |
| `name` | `identity` via `reserve_identity()` | **unicité globale** imposée par le cœur |

**`task`.** Le cœur n'a **ni `title` ni `input`** : `task(id, tenant_id, employee_id, state, …)`.
Ce n'est pas un oubli, c'est le modèle — une tâche y est un état piloté par un `objective` et
l'ADN, pas un sac de paramètres. Les `title`/`input` de la vitrine devront être portés en
`execution_event` (payload d'ouverture) ou traduits en `objective`. Les états diffèrent aussi :
`running`/`waiting_human` → `in_progress`/`waiting_approval`.

**`notification`.** Le cœur n'a pas de `task_id` (il porte `employee_id` et un `message` soumis
au lexique). Le lien vers la tâche devra passer par `execution_event` ou par une colonne à
ajouter — décision à prendre, pas à improviser pendant la migration.

**`execution_event`.** Vitrine : `id bigint`, `seq`, `usage`. Cœur : `id uuid`,
`idempotency_key`, et surtout un **trigger `reject_journal_mutation`** qui interdit toute
modification. Le journal est append-only par construction : la migration devra insérer, jamais
corriger.

### 3.3 Divergences de conception — **tranchées le 2026-08-06**

Décidées dans [`adr/0025`](adr/0025-un-seul-sentio.md). Elles ne sont plus ouvertes.

1. **BYOK : non.** Sentio ne demande jamais sa clé d'API à une entreprise — la complexité
   technologique est cachée au client, et la plateforme porte les fournisseurs et leurs coûts.
   Le modèle du cœur est retenu : `provider_credential` global, avec sa contrainte de preuve
   d'opt-out. `tenant_ai_credential` n'a pas d'avenir dans la cible et **ne sera pas migrée**.
2. **Une seule grille : celle du cœur.** `plan` en base fait foi — Start, Growth, Scale. Les
   prix s'ajustent en base, jamais par déploiement. `lib/plans.ts` disparaît. Le prix doit
   refléter un résultat et une expérience, jamais un accès technique à des modèles.
3. **Métiers ouverts, aucune verticale artificielle.** Une promesse unique — « Un employé adapté
   à votre entreprise » — illustrée par des **exemples** (commercial, support, administratif,
   marketing), présentés comme tels. On ne publie pas quatre ADN pour rendre une page cohérente.
   **Contrainte qui en découle :** le diagnostic doit rester capable de découvrir un besoin hors
   liste et de le dire honnêtement (`OUT_OF_SCOPE_NEEDS`), plutôt que de le forcer dans un métier
   existant.

---

## 4. Mapping des données

### 4.1 Ce que je n'ai pas pu établir

**Aucun inventaire réel n'a été fait** : cet environnement ne contient pas les identifiants des
deux projets Supabase (`.env` racine n'a que `MAGIC_API_KEY` et `API_KEY_21ST`). Les volumes,
le nombre de tenants réels et l'état de l'application des migrations sur les deux projets
distants restent à mesurer. Requêtes à passer sur la base vitrine, avant toute décision :

```sql
select 'tenant' as t, count(*) from tenant
union all select 'tenant réels', count(*) from tenant where id <> '00000000-0000-0000-0000-000000000001'
union all select 'tenant_member', count(*) from tenant_member
union all select 'agent_instance', count(*) from agent_instance
union all select 'task', count(*) from task
union all select 'execution_event', count(*) from execution_event
union all select 'lead', count(*) from lead
union all select 'agent_memory', count(*) from agent_memory
union all select 'notification', count(*) from notification
union all select 'rgpd_request', count(*) from rgpd_request;
```

### 4.2 Classement des données

| Classe | Contenu | Décision |
|---|---|---|
| **Référence** | `agent_definition`, grille tarifaire | **ne pas migrer** — le cœur a ses propres seeds, faisant autorité |
| **Démo** | tenant `000…001` et tout ce qui en dépend | **ne pas migrer** — données de test (ADR-003) |
| **Réel** | tenants issus du chat d'accueil, leur `config`, leurs `lead`, `task`, `agent_memory`, `notification`, `standing_approval` | **à migrer**, entreprise par entreprise |
| **Journal** | `execution_event` des tenants réels | à migrer **en dernier**, par insertion seule |
| **Légal** | `rgpd_request` | **à conserver** — traçabilité obligatoire ; aucune table cible aujourd'hui |
| **Technique** | `diagnostic_rate_limit` | jetable (fenêtres glissantes) |

### 4.3 Le point dur : `auth.users`

Les deux projets Supabase ont des **utilisateurs distincts**. `tenant_member.user_id` référence
`auth.users` du projet vitrine ; ces identifiants n'existent pas dans le projet cœur. Aucune
copie de table ne résout ça.

Trois options, à trancher avant la phase 5 :

- **(a) Ré-invitation** — chaque client reçoit un lien magique sur le nouveau projet, et le
  rattachement se fait par adresse email. Propre, mais demande une action au client.
- **(b) Import des utilisateurs** via l'API d'administration Supabase, en conservant les
  identifiants. Transparent, mais manipule des comptes — à faire par toi, pas par un agent.
- **(c) Migration inverse** : appliquer le schéma du cœur sur le projet Supabase *de la vitrine*,
  qui garde ses `auth.users`. Supprime le problème entièrement.

**L'option (c) mérite un examen sérieux** : elle échange un problème d'authentification
insoluble contre un renommage de projet. Le « projet du cœur » n'est pas sacré — c'est le
*schéma* qui l'est.

---

## 5. Ordre exact des phases — **validé le 2026-08-06**

Chaque phase est réversible tant que la suivante n'a pas commencé. **Aucune suppression
irréversible avant d'avoir les tests ET un chemin de retour arrière.**

### Phase 0 — Sécuriser ✅ FAITE

- **0.1** `demo_anon_read` supprimée — migration
  [`0012`](../apps/vitrine/migrations/0012_fermeture_demo_anon_read.sql). Remplacée par
  `demo_journal_authentifie`, même portée (journal du seul tenant démo) réservée aux sessions
  authentifiées. `tenant_read_journal` refermée au même titre : plus aucune policy
  d'`execution_event` ne s'adresse à un rôle non authentifié.
- **0.2** Test qui échoue si la policy revient, ou si une autre rouvre le journal sans session —
  [`journal-rls.integration.test.ts`](../apps/vitrine/src/lib/journal-rls.integration.test.ts),
  exécuté par la CI (job `schema`).
- **Réversible** : la migration `0012` s'annule par un `drop policy` + recréation de l'ancienne.
- **Reste ouvert** : le tenant démo ne doit porter que des données de test, et cette garantie
  tient encore à une ligne de code, pas à une contrainte de base (§8.1).

### Phase 1 — Rendre le cœur réellement exécutable

C'est le préalable absolu : **le cœur ne tourne pas encore** (lot 3 : 0/15). Basculer quoi que
ce soit avant cette phase remplacerait un produit qui fonctionne par un produit qui ne
fonctionne pas.

- **1.1 Worker et exécution autonome** — EXEC-01..08 (boucle sur les ports existants), puis
  EXEC-09..11 (reprise après interruption, suspension, validation humaine), puis EXEC-12..15
  (verrouillage de la file, priorité par formule, notifications, réflexion post-run).
- **1.2 Capacités** — porter ce que la vitrine a déjà résolu : outils de prospection vers
  `@sentio/capabilities/prospects` ; envoi d'email **passé par `peut_envoyer()`**, garde que la
  vitrine n'a pas ; plafond du diagnostic (ACQUIS-17), trace en `diagnostic_session`
  (ACQUIS-22), justification rédigée (ACQUIS-15).
- **1.3 Recrutement** — RECRUT-03/04 (`reserve_identity()` puis `employee` sur un ADN figé),
  RECRUT-06, et surtout **RECRUT-05 : initialisation du `company_profile` depuis le profil du
  diagnostic et le `sector_profile`**. *C'est le cœur de la vision — ce que l'entreprise a dit
  avant l'achat devient la mémoire de son employé après.*
- **1.4 Paiement** — RECRUT-01/02/07 : paiement hébergé, confirmation **serveur** (jamais la
  redirection navigateur), ouverture de l'accès à l'espace privé. Sur la grille unique du cœur
  (ADR-0025, décision 2).
- **Réversible** : ajout pur. La vitrine continue de tourner à l'identique pendant toute la
  phase.
- **Preuve de fin de phase** : un run réel de bout en bout sur base locale, sans `apps/vitrine`.

### Phase 2 — Préparer la migration

Aucune donnée déplacée. On lève les inconnues pendant que les deux systèmes tournent.

- **2.1 Auth** — trancher §4.3 (`auth.users` non transposable). L'option (c) — appliquer le
  schéma du cœur sur le projet Supabase *de la vitrine* — supprime le problème et mérite d'être
  évaluée en premier.
- **2.2 Schéma** — résoudre les correspondances non mécaniques de §3.2 : destination de
  `config.systemPrompt`, `task` sans `title`/`input`, `notification` sans `task_id`, collisions
  d'identités. Chaque décision écrite avant d'être codée.
- **2.3 Données** — inventaire réel (§4.1), classement, détection des collisions.
- **2.4 Compatibilité** — script de migration idempotent, **rejoué sur une copie**, jamais sur
  la source. Tests de parité vitrine ↔ cœur (§7).
- **Réversible** : rien n'a bougé.

### Phase 3 — Faire converger l'application

- **3.1** `apps/vitrine` lit le cœur via `@sentio/db`, **pour les nouveaux tenants seulement**
  (drapeau par entreprise).
- **3.2** Ses Server Actions appellent `@sentio/core` ou déposent un `job`.
- **3.3** Retrait progressif des imports `@sentio/vitrine-core`, un module à la fois.
- **Réversible** : le drapeau se rebascule par entreprise, sans déploiement.
- **Fin de phase** : `apps/vitrine` est l'interface, `packages/domain`+`core` le cerveau, le
  schéma cœur la source de vérité.

### Phase 4 — Migrer, puis retirer progressivement

- **4.1** Copie **entreprise par entreprise**, idempotente. Journal en dernier, par insertion
  seule (trigger append-only).
- **4.2** Vérification : comptes ligne à ligne, puis **un run réel par entreprise migrée**.
- **4.3** Retrait, seulement après validation : `packages/vitrine-core` supprimé,
  `apps/vitrine/migrations` **archivé et non supprimé** (historique des données migrées).
- **4.4** Projet Supabase vitrine en lecture seule, puis supprimé après une rétention décidée à
  ce moment-là.
- **Chemin de retour** : la base vitrine reste intacte et lisible tant que 4.4 n'a pas eu lieu.
  4.3 et 4.4 sont les **premières étapes irréversibles du plan** — elles ne se font pas sans les
  tests de 4.2 au vert.

### Phase 5 — Vérification mécanique du point de bascule

Les sept critères du §9, tous automatisés. Tant qu'un seul est rouge, la convergence n'est pas
finie — quelle que soit l'impression que donne le produit.

---

## 6. Risques

| # | Risque | Gravité | Parade |
|---|---|---|---|
| **R1** | `auth.users` non transposable entre projets | **haute** | trancher §4.3 avant la phase 5 ; l'option (c) le supprime |
| **R2** | `config.systemPrompt` (chat d'accueil) n'a aucune destination dans le cœur | haute | le décomposer en lignes `company_profile` **par un humain**, entreprise par entreprise. Jamais automatiquement : c'est du texte libre écrit par un modèle |
| **R3** | Unicité **globale** des identités : deux `agent_instance.name` identiques bloquent la migration | moyenne | détecter les collisions à la phase 5.1, réattribuer via `reserve_identity()` |
| **R4** | `task` du cœur n'a ni `title` ni `input` | moyenne | décider en phase 1 : `objective` ou payload d'ouverture. Ne pas ajouter de colonne par réflexe |
| **R5** | `notification` du cœur n'a pas de `task_id` | faible | décision explicite en phase 1 |
| **R6** | Journal append-only (trigger) : une migration naïve échoue | faible | insertion seule, jamais de correction ; le trigger est une protection, pas un obstacle |
| **R7** | Deux grilles tarifaires, deux catalogues de métiers | moyenne | trancher §3.3 avant la phase 3 (le paiement en dépend) |
| **R8** | BYOK par entreprise ≠ `provider_credential` global | moyenne | trancher §3.3 ; impacte la conformité no-train, donc le principe 2 |
| **R9** | **Basculer avant la phase 1** remplace un produit qui marche par un qui ne marche pas | **critique** | l'ordre des phases n'est pas indicatif |
| **R10** | Gel trop long : plus aucune livraison client pendant des mois | **haute** | phase 0 gèle l'**ajout de schéma**, pas les correctifs ni l'interface. À surveiller à chaque phase |
| **R11** | `demo_anon_read` ouverte pendant toute la transition | haute | §8 |
| **R12** | 4 métiers annoncés sans backend | moyenne | décision produit, indépendante de la convergence, mais rendue visible par elle |

---

## 7. Tests nécessaires

Rien de ce plan ne doit reposer sur une relecture (ADR-0024).

**Schéma**
- `supabase/tests/run.sh` étendu à chaque table portée depuis la vitrine.
- Test d'isolation par entreprise sur **chaque** nouvelle table — le cœur a déjà
  `verify_tenant_isolation` comme modèle.
- Test que `apps/vitrine/migrations` ne grossit plus (phase 0).

**Moteur**
- Tests d'intégration du runtime du cœur sur un vrai Postgres, sur le modèle de
  `packages/db/src/repository.integration.test.ts` (garde `SENTIO_REQUIRE_DB_TESTS`).
- Test que l'ADN reste non contournable : un fait appris qui heurte une limite n'est jamais
  injecté (le filtre existe, il doit être testé sur les données migrées).

**Parité, pendant la coexistence**
- Même entrée → même décision, vitrine vs cœur, sur le calibrage du diagnostic et la
  qualification d'un prospect. Un écart doit faire échouer la CI, pas alimenter une discussion.

**Migration de données**
- Rejouée sur une **copie**, jamais sur la source.
- **Idempotence** : deux exécutions consécutives donnent exactement le même état.
- Comptes ligne à ligne avant/après, par entreprise.

**Frontières (mécaniques, dans `verifier-frontieres.mjs`)**
- `apps/vitrine` n'importe plus `@sentio/vitrine-core`.
- `apps/vitrine` n'instancie ni `Pool` ni `Client` hors d'un adaptateur à portée entreprise.
- `apps/vitrine` n'appelle aucun fournisseur de modèle.
- Aucune policy nommée `demo_anon_read` ne subsiste (requête sur `pg_policies`).

**Bout en bout**
- Diagnostic → achat → briefing → premier run, sur le cœur seul.

---

## 8. ADR-018 (authentification différée) et `demo_anon_read`

### 8.1 Ce que l'auth différée a réellement laissé

ADR-018 est une décision assumée, mais son coût est plus large que ce que l'ADR annonce.

1. **RLS contournée en production.** `apps/vitrine/src/lib/db.ts` ouvre un pool Postgres « de
   confiance » qui ignore RLS. L'isolation entre entreprises ne tient donc **que par le code
   applicatif** (`isAuthorizedForTenant`). Une requête qui oublie le `where tenant_id` traverse
   tout. Le cœur rend cet oubli impossible : il n'existe aucun accès aux tables client sans
   `forTenant(scope)`.
2. **Cinq chemins d'écriture sans vérification d'appartenance** : `onboarding-actions.ts`,
   `rgpd-actions.ts`, `notify.ts`, `diagnostic-rate-limit.ts`, `api/cron/prospect` (protégé par
   `CRON_SECRET` seulement). Certains sont légitimement publics (RGPD, diagnostic) ; le fait que
   rien ne les distingue mécaniquement des autres, non.
3. **Le tenant démo est ouvert à toute session.** `isAuthorizedForTenant` retourne `true` sans
   appartenance. Acceptable tant que la démo ne contient que des données de test — ce que
   garantit aujourd'hui `dataClass = tenantId === DEMO_TENANT_ID ? "test" : "real"`. Cette
   garantie tient à une seule ligne.

### 8.2 `demo_anon_read`

```sql
create policy demo_anon_read on execution_event
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001');
```

Elle autorise **n'importe qui, sans session**, à lire le journal d'exécution du tenant démo.
Or `execution_event.payload` contient les entrées et sorties d'outils : contenus de prospects,
messages rédigés, résultats d'appels. Tant que la démo reste du jeu d'essai, la fuite est nulle.
Le jour où quelqu'un lance un run réel sur ce tenant — un test rapide, une démonstration à un
prospect — elle devient publique, en silence, sans erreur.

Sa propre migration dit « à supprimer avant d'onboarder un vrai second client ». Ce moment est
passé : le chat d'accueil crée de vrais tenants depuis ADR-019.

### 8.3 Ce qui a été fait, et ce qui reste

**Fait (phase 0, migration [`0012`](../apps/vitrine/migrations/0012_fermeture_demo_anon_read.sql)) :**

1. ✅ `demo_anon_read` supprimée.
2. ✅ Remplacée par `demo_journal_authentifie` — même portée, réservée aux sessions
   authentifiées. La vue temps réel de la démo continue de fonctionner pour un visiteur
   connecté, ce que `requireTenantAccess` exigeait déjà.
3. ✅ `tenant_read_journal` refermée au même titre. Elle n'était pas une fuite — `is_member()`
   compare à `auth.uid()`, nul sans session — mais une règle qui tient par son prédicat est une
   règle qu'il faut relire pour se rassurer. L'invariant est maintenant simple : **aucune policy
   d'`execution_event` ne s'adresse à un rôle non authentifié.**
4. ✅ Contrôle mécanique : `journal-rls.integration.test.ts` échoue si la policy revient, sous
   son nom ou sous un autre.

**Reste ouvert :**

- Le pool « de confiance » contourne toujours RLS (§8.1, point 1). Il disparaît en phase 3,
  quand `apps/vitrine` lira par `@sentio/db` à portée entreprise.
- Les cinq chemins d'écriture sans vérification d'appartenance (§8.1, point 2) — certains
  légitimement publics, aucun distingué mécaniquement des autres.
- Le tenant démo ne porte que des données de test **par convention de code**, pas par contrainte
  de base. Une garde en base serait la vraie réponse.

---

## 9. Le point de bascule : quand `apps/vitrine` est « une simple interface »

Sept critères, tous **mécaniquement vérifiables** — pas une appréciation.

| # | Critère | Comment on le prouve |
|---|---|---|
| 1 | Zéro import `@sentio/vitrine-core` dans `apps/vitrine` | `verifier-frontieres.mjs` |
| 2 | `packages/vitrine-core` n'existe plus | absence du dossier |
| 3 | Aucune table de `apps/vitrine/migrations` n'est lue en production | drapeaux à zéro + inventaire |
| 4 | Aucun `Pool`/`Client` dans `apps/vitrine` hors adaptateur à portée entreprise | `verifier-frontieres.mjs` |
| 5 | Aucun appel direct à un fournisseur de modèle depuis `apps/vitrine` | `verifier-frontieres.mjs` |
| 6 | `demo_anon_read` absente, RLS active sur tous les chemins | requête `pg_policies` en test |
| 7 | Un run réel passe par `apps/worker`, pas par une Server Action | test bout en bout |

**Quand ces sept points sont verts, `apps/vitrine` est une interface** : on peut la réécrire,
la remplacer, en ajouter une seconde (mobile, API publique) sans toucher au produit. C'est la
définition opérationnelle de la convergence — et le moment où la vision « généraliste sur les
métiers, personnalisé par entreprise » cesse de dépendre de la discipline pour dépendre de
l'architecture.

---

## 10. Où en est le plan

| Phase | État |
|---|---|
| 0 — Sécuriser | ✅ faite (migration `0012` + test dans la CI) |
| 1 — Rendre le cœur exécutable | non commencée — **le vrai chantier**, 15 tâches du lot 3 |
| 2 — Préparer la migration | non commencée |
| 3 — Faire converger l'application | non commencée |
| 4 — Migrer et retirer | non commencée |
| 5 — Vérification du point de bascule | non commencée |

Les décisions produit de §3.3 sont tranchées ([`adr/0025`](adr/0025-un-seul-sentio.md)).
Restent ouvertes, à trancher en phase 2 : `auth.users` (§4.3) et les correspondances non
mécaniques (§3.2).
