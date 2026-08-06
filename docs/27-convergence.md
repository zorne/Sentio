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

### 3.3 Divergences de conception à trancher AVANT de migrer

Ce sont des décisions produit, pas des détails d'implémentation. Aucune ne doit être prise dans
le feu d'une migration.

1. **BYOK.** La vitrine a `tenant_ai_credential` (clé chiffrée **par entreprise**, ADR-005). Le
   cœur a `provider_credential` **global**, sans `tenant_id`, avec une contrainte exigeant une
   preuve d'opt-out. Les deux modèles sont défendables ; ils ne sont pas compatibles.
2. **Grille tarifaire.** Vitrine : `standard` / `professionnel` / `entreprise`, 499 €. Cœur :
   `start` / `growth` / `scale`, un seul commercialisable. Deux catalogues, deux vérités.
3. **Métiers annoncés.** La landing annonce 5 métiers, 4 sans aucun backend
   (`agent-roles.ts`, `live: false`). Le cœur n'a qu'un ADN publié. La convergence rend l'écart
   visible : soit on publie 4 ADN, soit on retire l'annonce.

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

## 5. Ordre exact des migrations

Chaque phase est réversible tant que la suivante n'a pas commencé. **Rien n'est supprimé avant
la phase 6.**

### Phase 0 — Geler la divergence (aucun schéma touché)

- **0.1** Règle : plus aucune table nouvelle dans `apps/vitrine/migrations`. Contrôle mécanique
  dans `scripts/verifier-frontieres.mjs` — le nombre de fichiers y est figé, un ajout fait
  échouer `pnpm verify`.
- **0.2** Règle : aucun nouveau module dans `packages/vitrine-core`. Même contrôle, liste
  d'exports gelée.
- **Réversible** : retirer les deux règles.
- **Preuve** : `pnpm verify` échoue si on ajoute une migration vitrine.

### Phase 1 — Rendre le cœur exécutable (EXEC-01 à 15)

C'est le préalable absolu : **le cœur ne tourne pas encore**. Basculer quoi que ce soit avant
cette phase remplacerait un produit qui fonctionne par un produit qui ne fonctionne pas.

- **1.1** EXEC-01..08 — boucle complète dans `apps/worker` sur les ports existants.
- **1.2** EXEC-09..11 — reprise après interruption, suspension, validation humaine.
- **1.3** EXEC-12..15 — verrouillage de la file, priorité par formule, notifications, réflexion.
- **Réversible** : ajout pur, la vitrine continue de tourner à l'identique.
- **Preuve** : un run réel de bout en bout sur base locale, sans `apps/vitrine`.

### Phase 2 — Porter les capacités déjà résolues par la vitrine

- **2.1** Outils de prospection → `@sentio/capabilities/prospects` (socle déjà présent).
- **2.2** Envoi d'email → `capabilities/email/send-message`, **passé par `peut_envoyer()`** —
  garde que la vitrine n'a pas.
- **2.3** Diagnostic : plafond par visiteur/adresse (ACQUIS-17), trace en
  `diagnostic_session` (ACQUIS-22), justification rédigée (ACQUIS-15).
- **Réversible** : ajout pur.

### Phase 3 — Le recrutement dans le cœur (RECRUT-01 à 10)

- **3.1** Paiement + confirmation **serveur** (jamais la redirection navigateur).
- **3.2** `reserve_identity()` + création de l'`employee` sur une version d'ADN figée.
- **3.3** **RECRUT-05** — initialisation du `company_profile` depuis le profil du diagnostic et
  le `sector_profile`. *C'est le cœur de la vision : ce que l'entreprise a dit avant l'achat
  devient la mémoire de son employé après.*
- **3.4** Lien magique + rattachement automatique au tenant créé pendant le diagnostic.
- **Réversible** : les deux parcours d'achat coexistent derrière un drapeau.

### Phase 4 — Bascule de l'interface, en lecture d'abord

- **4.1** `apps/vitrine` lit le cœur via `@sentio/db`, **pour les nouveaux tenants seulement**
  (drapeau par entreprise).
- **4.2** Les Server Actions appellent `@sentio/core` ou déposent un `job`.
- **4.3** Retrait progressif des imports `@sentio/vitrine-core`, un module à la fois.
- **Réversible** : le drapeau se rebascule par entreprise, sans déploiement.

### Phase 5 — Migration des données

- **5.1** Inventaire (§4.1) et décision sur `auth.users` (§4.3).
- **5.2** Copie **entreprise par entreprise**, idempotente (rejouable sans doublon).
- **5.3** Journal en dernier, par insertion seule.
- **5.4** Vérification : comptes ligne à ligne, puis **un run réel par entreprise migrée**.
- **Réversible** : la base vitrine reste intacte, en lecture seule, jusqu'à validation.

### Phase 6 — Retrait (première étape irréversible)

- **6.1** `drop policy demo_anon_read on execution_event`.
- **6.2** Suppression de `packages/vitrine-core`.
- **6.3** `apps/vitrine/migrations` archivé, **pas supprimé** (historique des données migrées).
- **6.4** Projet Supabase vitrine passé en lecture seule, puis supprimé après une période de
  rétention décidée à ce moment-là.

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

### 8.3 À faire avant toute ouverture publique

Dans cet ordre, indépendamment de la convergence :

1. `drop policy demo_anon_read on execution_event`.
2. Remplacer l'abonnement temps réel anonyme par une session — anonyme signée, ou réelle.
3. **Contrôle mécanique** que la policy n'est jamais réintroduite (test sur `pg_policies`).
4. Restreindre le pool « de confiance » à une portée entreprise, ou le supprimer.

Les points 1 à 3 ne dépendent d'aucune phase du plan et peuvent être faits tout de suite.

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

## 10. Ce que je recommande de faire en premier

Trois choses, dans cet ordre, avant toute migration :

1. **§8.3, points 1 à 3** — `demo_anon_read` ne dépend d'aucune phase et fuit déjà.
2. **Phase 0** — geler la divergence coûte une règle dans un script existant.
3. **Trancher §4.3 (option c ?) et §3.3** — trois décisions produit qui changent la forme de
   tout le reste, et qu'il ne faut pas prendre pendant une migration.

La phase 1 (rendre le cœur exécutable) est le vrai chantier. Elle représente les 15 tâches du
lot 3, et rien ne peut basculer avant elle.
