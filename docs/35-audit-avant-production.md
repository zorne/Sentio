# 35 — Audit avant production

> ✅ **Mis à jour le 2026-08-28, après corrections.** Les trois constats P0 sont traités. Ce qui
> suit décrit l'état **au moment de l'audit** ; la section R, à la fin, dit ce qui a changé depuis
> et ce qui reste.

> **Date** : 2026-08-28 · **Périmètre** : dépôt entier, base en ligne (lecture seule), vitrine
> publique, espace client, runtime, worker, migrations, git, sécurité.
>
> **Commande de vérification** : `pnpm run verify` — **vert, code 0** au moment de l'audit.
>
> ⚠️ **Cet audit n'a modifié aucun code.** C'est la Phase 1 demandée. Les corrections attendent un
> arbitrage, parce que les trois constats critiques sont des **décisions produit**, pas des bogues.

---

## A. Résumé pour décideur

Sentio est **bien construit et mal branché**.

L'ingénierie est d'un niveau nettement supérieur à la moyenne : 44 tables toutes sous RLS, 47 blocs
d'invariants SQL, 69 fichiers de test dont 19 d'intégration, des garanties posées en base plutôt que
dans le code applicatif, un contrôle de frontières automatisé, aucun secret dans le dépôt, aucune
fausse réussite (`catch { return success }`) dans le code de production. Sur les axes **sécurité,
isolation entre clients, intégrité du schéma et honnêteté du code**, l'audit ne trouve rien de
critique.

Mais la chaîne qui va de l'objectif du dirigeant à une action réelle **est coupée en trois
endroits**, et aucun de ces trois endroits n'est un défaut de code : ce sont trois choses qui
n'ont jamais été construites, et que rien dans l'interface ne signale.

> **Conclusion nette : aujourd'hui, un client qui paierait n'obtiendrait rien.** Pas une erreur,
> pas un message d'échec — un espace client parfaitement fonctionnel où il ne se passe
> définitivement rien.

Cela ne se voit pas, parce que chacune des trois coupures est individuellement invisible : le
dirigeant voit une employée configurée, des capacités listées, un tableau de bord cohérent. Tout
est vrai. Simplement, aucune mission ne peut jamais s'ouvrir.

---

## B. Méthodologie

Sources consultées pour cadrer l'audit, plutôt que de me fier à mon seul jugement :

- **Supabase — Row Level Security** et la fiche de dépannage *« Do I need to expose security
  definer functions in RLS policies? »* : placement des fonctions `security definer`, exposition
  par l'API de données, `search_path`.
- **Makerkit, *Supabase RLS Best Practices for Multi-Tenant Apps*** et **Jawad Hassan, *Multi-Tenant
  SaaS with Supabase RLS*** : politiques par entreprise, et surtout l'insistance sur les **tests de
  cas négatifs**.
- **Pentestly, *Supabase Security: Lessons from Real Pentests*** : ce que trouvent réellement les
  audits d'intrusion sur cette pile.

Méthode appliquée, pour chaque fonctionnalité : **documentation → architecture → code → base →
API → runtime → tests → comportement réel**. Une étape fictive suffit à déclarer la fonctionnalité
non fonctionnelle, quelle que soit la qualité du reste.

⚠️ **Ce que cet audit a refusé de faire** : conclure depuis la lecture du code. Chaque constat
ci-dessous est adossé à une recherche exhaustive de références, à une interrogation de la base, ou
à un essai à l'écran.

---

## C. Architecture réelle constatée

```text
Dirigeant
   ↓
/diagnostic (vitrine)  ──→ Groq ──→ profil recommandé          RÉEL, essayé à l'écran
   ↓
/formules → recrutement ──→ employee + lady_configuration      RÉEL
   ↓
/espace (espace client) ──→ lectures RLS + fonctions definer   RÉEL
   ↓
battement (fonction Supabase) ─────────────────────────────────╳ RIEN NE L'APPELLE
   ↓
approvisionnement ──→ cherche des sujets dans « lead » ────────╳ « lead » N'EST JAMAIS REMPLIE
   ↓
runtime → capacité → moteur ───────────────────────────────────╳ 2 MOTEURS SUR 5 SEULEMENT
   ↓
action réelle
```

Les trois `╳` sont les trois constats P0.

L'architecture **cible** décrite dans ta demande (Lady Core → Lady Instance → Runtime → Results →
Evolution) **existe déjà** et est correctement séparée. Je ne recommande pas de la changer. Voir
section L.

---

## D. Constats critiques (P0)

### P0-1 — Rien ne remplit jamais la table des prospects

**Problème.** Les missions s'ouvrent exclusivement à partir de la table `lead`
(`GisementDeProspects.sujetsEligibles`, `packages/runtime/src/adapters/approvisionnement.ts:40`).
Aucun code de production n'écrit dans `lead`.

**Preuve.** Recherche exhaustive de `into lead` / `into public.lead` sur `packages/*/src`,
`apps/*/src`, `supabase/migrations`, `supabase/functions`, hors tests et fixtures : **zéro
résultat**. La capacité `rechercher.prospect`, qui devrait les produire, n'apparaît que dans trois
fichiers, et **aucun n'est une implémentation** :

| Fichier | Ce qu'on y trouve |
|---|---|
| `packages/domain/src/composition.ts:50` | Elle est composable dans une configuration |
| `packages/domain/src/capability.ts:28` | Sa clé existe |
| `packages/vitrine-core/src/diagnostic/presentation.ts:51` | **Elle est présentée au client** : « repérer les entreprises à approcher » |

Elle n'a **ni attelage** (`packages/runtime/src/attelage.ts` en couvre 4 sur 5) **ni moteur**.

Il existe bien un lecteur de fichier CSV — `packages/capabilities/src/prospects/import.ts` — mais
il est exporté et **appelé par personne** : aucune route, aucun écran, aucun worker.

**Impact.** Le runtime tourne à vide, définitivement. Aucune mission ne peut s'ouvrir, donc rien
de ce qui suit ne s'exécute jamais.

**Risque.** Maximal. C'est la fonctionnalité même du produit.

**Compatibilité.** Aucune : il n'y a rien à casser, rien ne fonctionne.

### P0-2 — Rien ne déclenche le battement

**Problème.** La fonction `battement` existe, est testée (4 tests Deno) et signée
(`SENTIO_HEARTBEAT_SECRET`). **Aucun planificateur ne l'appelle.**

**Preuve.** Pas de `pg_cron` ni de `pg_net` dans les 90 migrations ; extensions installées :
`plpgsql` seule. Le seul workflow GitHub (`.github/workflows/ci.yml`) n'a pas de `schedule`.
Aucun `fly.toml`, `Dockerfile`, ni service d'hébergement pour `apps/worker` — dont le `package.json`
ne déclare que `typecheck` et `test`, **pas de `start`**.

**Impact.** Même avec des prospects, l'employée ne se réveillerait jamais.

**Risque.** Maximal, et **silencieux** : rien ne signale l'absence de battement.

### P0-3 — Le client se voit attribuer des capacités que le runtime refuse

**Problème.** Une configuration issue du diagnostic peut activer `envoyer.prospect` et
`relancer.prospect` (`packages/domain/src/composition.ts:53`). L'espace client les affiche
(`apps/vitrine/src/app/espace/page.tsx:181`, via `lady_configuration_capability`). Or leurs moteurs
ne sont **délibérément pas montés** (`packages/runtime/src/composition.ts:133`) :

> *« Pas montés, et ce n'est pas un oubli : `envoyer.prospect` et `relancer.prospect`. Leur moteur
> écrit à une vraie entreprise. »*

**La décision runtime est excellente. C'est l'interface qui ne la reflète pas.** Le dirigeant voit
« Écrire à un prospect » dans les capacités de son employée ; le runtime répondra
`CapabilityUnavailable`.

**Et la vitrine le promet aussi** : *« Aucun envoi sans vous — vous lisez avant que ça parte »*
décrit un flux d'envoi qui ne peut pas s'exécuter. La page est honnête sur les résultats (*« nous
n'avons pas encore de client pour le prouver »*) et muette sur la capacité.

**Impact.** C'est exactement la « fausse fonctionnalité » que tu veux proscrire.

**Risque.** Élevé — commercial et juridique si un client paie sur cette base.

---

## E. Constats élevés (P1)

| # | Constat | Preuve | Risque |
|---|---|---|---|
| P1-1 | **Deux passerelles de modèle** au lieu d'une | `packages/core/src/model/gateway.ts` (worker) et `packages/vitrine-core/src/gateway/` (vitrine) | Une correction appliquée à une seule. **Déjà arrivé** : le correctif de troncature du 2026-08-28 n'a été posé que sur celle de la vitrine. |
| P1-2 | **Secrets des fonctions non posés** | `pnpm run deploiement:verifier` : 9 absents | `SENTIO_OPTOUT_SECRET` rend **tout lien de désinscription invalide** — obligation légale, bloquante au premier envoi réel |
| P1-3 | **Espace client jamais vu à l'écran** | Base en ligne : 0 entreprise, 0 employé | Aucun écran de l'espace n'a jamais affiché de données réelles, ni pour toi ni pour moi |
| P1-4 | **`enabled` de `provider_credential` n'est lu nulle part** | Recherche exhaustive : aucune lecture | Une colonne qui ressemble à un interrupteur et n'en est pas un trompera quelqu'un |

---

## F. Sécurité — résultat détaillé

**Aucun constat critique.** C'est le point fort du projet.

| Contrôle | Résultat |
|---|---|
| Tables sous RLS | **44 / 44** |
| Tables sans politique | 14 — et c'est **volontairement fermé** : RLS active sans politique refuse tout à `authenticated`, seul le rôle de service passe |
| Fonctions `security definer` appelables par un compte connecté | **5 sur 44**, dont 4 sont des aides de déclencheur et `is_tenant_member` |
| `reprendre_apres_accord` (la seule qui agit) | **Fonction de déclencheur** (`returns trigger`) : non appelable utilement en RPC |
| `search_path` des fonctions definer | `public, pg_temp` au lieu du `''` recommandé — **non exploitable ici** : `authenticated` n'a pas le droit `CREATE` sur `public` (vérifié), et tous les noms sont qualifiés. Durcissement P2, pas une faille. |
| Secrets dans le dépôt | **Aucun**. `.gitignore` couvre `.env` et `.env.*`, avec exception pour `.env.example` |
| Secrets dans l'historique | Recherche sur les 40 derniers arbres : aucun |
| Fuite entre entreprises | Couverte par TEST-01, `audit-fuites.sql`, la règle 7 des frontières, et depuis hier la règle 8 + LADY-AI (entre deux employées d'une même entreprise) |

⚠️ **Un secret hors dépôt à faire tourner** : le mot de passe de la base et la clé Groq ont été
collés en clair dans une conversation. Ils ne sont pas dans le dépôt, mais ils sont dans une
transcription. Rotation recommandée.

---

## G. Base de données — résultat détaillé

L'inventaire compare la base en ligne à la référence locale sur onze catégories :

```text
✓ 44 tables · 3 vues · 334 colonnes · 56 fonctions · 44 déclencheurs
✓ 44 tables RLS · 44 politiques · 46 droits · 129 index · 229 contraintes
✓ données de référence : 3 formules, 18 quotas, 5 capacités, 15 rattachements,
  1 noyau, 10 variantes, 350 identités
→ « à l'identique »
```

Les 90 migrations sont appliquées en ligne, `20260815120041` comprise. Les 4 extensions « en trop »
sont celles que Supabase installe lui-même.

**Rien à supprimer.** Aucune table orpheline, aucun doublon, aucune migration contradictoire. Les
tables vides le sont parce que le produit n'a pas encore de client — jamais parce qu'elles seraient
obsolètes. Conformément à ta règle, **je n'ai rien supprimé et je ne le recommande pas**.

**Un seul déchet identifié** : le fichier `teste` à la racine, 1 octet, suivi par git, sans aucune
référence. Suppression sans risque (P3).

---

## H. Agents — capacités réelles contre capacités affichées

| Capacité | Attelage | Moteur monté | Exécutée pour de vrai | État |
|---|---|---|---|---|
| `qualifier.prospect` | ✅ | ✅ interne | oui, effet en base | **RÉEL** |
| `mettre_a_jour.prospect` | ✅ | ✅ interne | oui, effet en base | **RÉEL** |
| `envoyer.prospect` | ✅ | ❌ non monté, exprès | non | **NON DISPONIBLE — mais présentée au client** |
| `relancer.prospect` | ✅ | ❌ non monté, exprès | non | **NON DISPONIBLE — mais présentée au client** |
| `rechercher.prospect` | ❌ | ❌ | non | **NON IMPLÉMENTÉE — et présentée au client** |

⚠️ **Aucune des cinq n'est jamais exécutée aujourd'hui**, y compris les deux réelles : sans
prospect (P0-1) et sans battement (P0-2), aucune mission ne s'ouvre.

**Ce qui est solide et mérite d'être dit** : quand une capacité est refusée, elle l'est
franchement (`CapabilityUnavailable`), et l'attelage impose une règle de sécurité rare et juste —
*le modèle choisit le geste, jamais la cible*. Un identifiant proposé par le modèle est **refusé**,
pas silencieusement corrigé. C'est la bonne façon de traiter l'injection de consignes.

---

## I. Runtime

**Ce qui est réellement bon**, vérifié dans le code :

- Ouverture des missions **transactionnelle**, avec la clé `(tenant_id, employee_id, jour)` comme
  arbitre de course entre deux battements simultanés.
- `on conflict do nothing` sur chaque mission : un sujet déjà pris n'est pas rouvert, et le compte
  rendu porte le nombre **réellement** ouvert, jamais le nombre demandé.
- L'objectif servi est écrit **avec** la mission, dans la même transaction.
- La priorité vient de la formule **en données**, jamais d'une condition sur son nom.
- Le déclencheur de reprise après accord garde contre la double mise en file, et écrit l'événement
  de journal — un manquement trouvé par une répétition générale, et corrigé.

**Ce qui n'a jamais tourné** : tout cela, en conditions réelles. Ces garanties sont prouvées par
les tests, pas par l'usage.

---

## J. Vitrine et espace client

- Aucun bouton mort trouvé. Aucun `catch { return succès }`. Aucun `TODO`/`FIXME`/`mock` dans un
  chemin de production.
- `/diagnostic` : **essayé de bout en bout** sur base locale, trois tours. Fonctionne.
- ⚠️ Deux défauts **trouvés et corrigés pendant l'audit**, tous deux invisibles aux tests :
  `finish_reason` n'était jamais lu (Lady posait des questions coupées en plein milieu), et le
  fil de conversation débordait par-dessus le logo.
- `/espace` : jamais affiché avec des données réelles (P1-3).

---

## K. Git

Propre. Arbre de travail sans modification, aucun secret suivi, `.gitignore` correct, 221 commits,
messages substantiels. Branches : `main`, `noyau-lady` (courante), `consolidation-monorepo`
(distante), et un arbre de travail temporaire `claude/elated-goldstine-a72186`.

**Aucune réécriture d'historique n'est nécessaire ni recommandée.**

---

## L. Évolutivité — la question que tu poses vraiment

> *« Puis-je changer de modèle, ajouter une capacité, modifier un abonnement, sans casser les
> clients existants ? »*

**Modèle IA — oui.** `ModelGateway` → `ModelProvider` → modèle. Rien dans le runtime ne connaît
Groq ni OpenAI. La chaîne de modèles est même configurable par variable d'environnement. ⚠️ Réserve
P1-1 : il y a **deux** passerelles, et c'est le seul vrai risque sur cet axe.

**Capacités — oui, structurellement.** Les contrats vivent en base et sont **relus à chaque
battement**, pas au redéploiement. `capability_binding` relie capacité → formule → moteur, en
données. Une capacité sans moteur est refusée franchement au lieu d'être simulée.

**Abonnements — oui.** Aucun `if plan === "pro"` dans le code : recherche exhaustive, zéro
résultat. Les droits sont des lignes (`plan_quota`, `capability_binding`, `job_priority`), et c'est
`peut_ouvrir_une_mission()` qui tranche, en base, seule.

**Configuration Lady — oui.** Versionnée (`lady_configuration.version`), immuable, avec déclencheur
et raison. Un employé figé sur une version continue de lire **cette** version.

> **Verdict : l'architecture cible que tu décris est déjà là.** Je ne recommande **aucun
> refactoring**. Le problème de Sentio n'est pas sa structure, c'est que trois branchements
> manquent au bout.

---

## M. Compatibilité avec les clients existants

**Il n'y a aucun client existant** : 0 entreprise et 0 employé en base. Le scénario « ancienne Lady
+ nouvelle version » n'est donc pas testable aujourd'hui, et aucune des corrections proposées ne
peut casser qui que ce soit.

⚠️ **C'est une fenêtre, et elle se referme au premier client.** Tout ce qui est fait maintenant est
gratuit ; la même chose dans six mois exigera une stratégie de migration.

---

## N. Plan de correction proposé

Dans cet ordre, parce que chaque étape rend la suivante vérifiable :

| # | Action | Décision produit ? |
|---|---|---|
| 1 | **Dire la vérité sur les capacités** : ce qui n'a pas de moteur est marqué indisponible, dans l'espace et dans la présentation du diagnostic | Non — tu l'as déjà tranché |
| 2 | **Une source de prospects** (P0-1) | **OUI — à trancher** |
| 3 | **Un planificateur pour le battement** (P0-2) | **OUI — à trancher** |
| 4 | **Monter les moteurs d'envoi** (P0-3) | **OUI — à trancher**, et lié aux préalables Resend |
| 5 | Fusionner les deux passerelles de modèle (P1-1) | Non |
| 6 | Rendre `enabled` effectif ou le retirer (P1-4) | Non |
| 7 | Durcir `search_path` à `''` (P2) | Non |
| 8 | Supprimer le fichier `teste` (P3) | Non |

---

## O. Ce qui reste, et que je ne cache pas

- L'espace client n'a **jamais** été vu avec des données réelles.
- Aucun test ne couvre le scénario « deux entreprises, deux employées, un battement » en
  conditions réelles, faute de battement.
- La reprise après panne du worker est testée unitairement, **jamais observée**.
- Le webhook de paiement n'existe pas.
- La purge et la sauvegarde ne sont pas planifiées.

---

## P. Risques résiduels

1. **Le risque principal n'est pas technique.** Le produit est vendable dans son discours et
   inopérant dans les faits. Le premier client payant découvrirait cela en quelques jours.
2. Monter les moteurs d'envoi fait basculer Sentio dans le monde des effets irréversibles. Les
   garanties existent (liste d'exclusion, désinscription, plafonds) mais **aucune n'a jamais été
   éprouvée sur un envoi réel**.
3. `SENTIO_OPTOUT_SECRET` absent rend tout lien de désinscription invalide : c'est une obligation
   légale, et elle devient bloquante au premier email.

---

## R. Ce qui a été corrigé, et comment c'est prouvé

### P0-1 — Les prospects existent maintenant ✅

Source retenue : **l'annuaire des entreprises de l'État** (`recherche-entreprises.api.gouv.fr`,
base SIRENE). Publique, gratuite, sans clé — donc aucun secret de plus, aucune dépense, et une base
légale limpide pour de la prospection professionnelle.

⚠️ **Elle ne donne aucune adresse email**, vérifié sur l'API réelle. C'est structurel : l'État ne
publie pas les emails. Lady **repère et qualifie** ; elle ne contacte pas. Ça tombe juste, les
moteurs d'envoi ne sont pas montés non plus.

**Deux pièges trouvés en essayant l'API pour de vrai, qu'aucune lecture de documentation n'aurait
donnés :**

1. Le filtre géographique porte sur **n'importe quel établissement**, pas sur le siège. Une
   recherche sur Lille rend des sociétés dont le siège est à Sarcelles.
2. Et cet établissement lillois peut être **fermé** (`etat_administratif: "F"`). Constaté sur un
   cas réel. On exige donc l'activité aux deux niveaux, et c'est l'établissement apparié qui fait
   l'adresse.

**Trois règles d'écartement, qui sont du RGPD et non du confort** : entreprises non diffusibles
(opposition déjà exprimée), entrepreneurs individuels (leur raison sociale est le nom d'une
personne), dirigeants (jamais lus, aucune colonne où les mettre).

**Un défaut de conception que la correction a révélé** : l'éligibilité d'un prospect exigeait une
adresse email. Gardée telle quelle, elle rendait toute la recherche inutile **en silence**. La
règle juste n'est pas « a une adresse » mais « il reste quelque chose à faire ».

**Preuve, contre l'annuaire réel et la base locale :**

```text
RECHERCHE RÉELLE : {"status":"trouve","examinees":5,"ajoutees":5}
  · AGENCEM RENOVATION MENUISERIE BOIS   40249151800021  43.32A   LILLE
  · MENUISERIE TYTGAT                    41371555800016  16.29Z   LILLE
  · MORCOS MENUISERIE                    10188676000012  00.00Z   LILLE
  · SSP MENUISERIES                      98389738000017  43.32A   LILLE
  · THEO MENUISERIE                      94287252400015  43.32A   LILLE
SUJETS ÉLIGIBLES À UNE MISSION : 5
MÊME RECHERCHE RELANCÉE : {"status":"rien_de_nouveau","examinees":5}
```

### P0-2 — Le battement est déclenché ✅ (une action reste au fondateur)

Un workflow planifié (`.github/workflows/battement.yml`) appelle la fonction toutes les dix
minutes, signée. Le calcul de signature en shell a été **prouvé identique** à `signHeartbeat` du
dépôt avant livraison. Il sort sans erreur tant que les secrets GitHub sont absents : échouer
toutes les dix minutes pour une situation normale apprendrait à ignorer ses alertes.

⚠️ **Reste au fondateur** : `supabase/config.toml` porte `[functions.battement] enabled = false`,
et les secrets ne sont pas posés. Les deux touchent au déploiement.

### P0-3 — Plus aucune capacité fictive n'est présentée ✅

`capability.disponible` dit ce qui s'exécute vraiment. **Deux gardes interdisent la divergence** :
un test d'intégration compare la colonne aux moteurs montés (vu échouer en la faussant exprès), et
un test unitaire garde la liste recopiée côté vitrine.

⚠️ **Et le modèle n'a plus le droit de déclarer ce dont le produit est capable.** Il rédigeait
`whatTheyDo` en texte libre : rien ne l'empêchait de promettre l'envoi d'emails à un visiteur qui
n'a pas encore recruté. Il rédige, il ne déclare plus.

### État des capacités après correction

| Capacité | Moteur | État |
|---|---|---|
| `rechercher.prospect` | ✅ annuaire public | **RÉEL**, prouvé de bout en bout |
| `qualifier.prospect` | ✅ interne | **RÉEL** |
| `mettre_a_jour.prospect` | ✅ interne | **RÉEL** |
| `envoyer.prospect` | ❌ non monté | **NON DISPONIBLE**, et dit comme tel |
| `relancer.prospect` | ❌ non monté | **NON DISPONIBLE**, et dit comme tel |

### Ce qui reste ouvert

| # | Ce qui reste | Qui |
|---|---|---|
| 1 | Activer `[functions.battement]` et poser les 9 secrets | **Fondateur** (déploiement) |
| 2 | `SENTIO_OPTOUT_SECRET` — bloquant au premier email réel, obligation légale | **Fondateur** |
| 3 | Fusionner les deux passerelles de modèle (P1-1) | Moi |
| 4 | Rendre `enabled` de `provider_credential` effectif ou le retirer (P1-4) | Moi |
| 5 | L'espace client n'a toujours jamais été vu avec des données réelles | Les deux |
| 6 | Webhook de paiement, purge et sauvegarde planifiées | Plus tard |
