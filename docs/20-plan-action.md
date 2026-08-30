# 20 — Plan d'action : de zéro au premier client payant

> ⚠️ **Ce n'est plus le fil d'exécution depuis le 2026-08-15.** Le document qui dit quoi faire
> ensuite est [`29-plan-jusquau-premier-client.md`](29-plan-jusquau-premier-client.md), écrit après
> ADR-0029 et un état des lieux vérifié. Ce fichier-ci garde l'historique des lots déjà faits et le
> détail de chaque phase — il reste utile, il ne se suit plus.

> À lire si tu travailles sur : **n'importe quoi**. C'est le document qui dit quoi faire ensuite.
>
> [`12-roadmap.md`](12-roadmap.md) donne les lots, [`18-backlog.md`](18-backlog.md) les tâches.
> **Ce fichier donne l'ordre**, et ajoute tout ce que le backlog ne contient pas : les démarches
> administratives, les décisions à trancher, la mise en ligne et la vente.
>
> Établi le 2026-07-28. **Ordre révisé le 2026-07-29 : `0 → 1 → 2 → 4 → 5 → 6 → 3`, puis `7` et
> `8`** ([`adr/0020`](adr/0020-ordre-des-lots-produit-complet.md)) — un produit cohérent de bout en
> bout avant l'automatisation complète. Les phases ci-dessous gardent leur numérotation par lot ;
> seule leur **succession** change : après la phase 3 (lot 2) vient la phase 5 (lot 4), et la
> phase 4 (lot 3) passe après la phase 7.
>
> ⚠️ Toute décision d'architecture prise à partir d'ici obéit aux **six priorités** de
> [`adr/0019`](adr/0019-priorites-ingenierie.md), dans leur ordre.

---

## Format de chaque étape

Chaque étape porte : **ce qu'on fait**, **pourquoi maintenant**, **ce qu'il faut avoir avant**, et
surtout **« terminé quand »** — un critère vérifiable, jamais une impression d'avancement.

Règle d'or : une étape dont le critère de sortie ne passe pas n'est **pas** terminée. Un lot aval
construit sur un lot amont incomplet produit du travail à refaire ([`12-roadmap.md`](12-roadmap.md)).

---

## Tableau de bord — où j'en suis

| Phase | Objet | Charge | État |
|---|---|---|---|
| 0 | Lancer ce qui a un délai | ~4 h + délais | ☐ |
| 1 | Lot 0 — Fondations | ~15 h | ✅ *(sauf temps réel — voir phase 1)* |
| 2 | Lot 1 — Noyau | ~17 h | ✅ |
| 3 | ~~Lot 2 — Métier Commercial~~ → **Lots A–G : noyau Lady** ([`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md)) | à réestimer | ☐ |
| 4 | Lot 3 — Exécution autonome *(déplacé après la phase 7)* | ~11 h | ☐ |
| 5 | Lot 4 — Acquisition | ~19 h | ☐ |
| 6 | Lot 5 — Recrutement et paiement | ~9,5 h | ☐ |
| 7 | Lot 6 — Dashboard | ~16 h | ☐ |
| 8 | Lot 8 — Conformité et lancement | ~12 h | ☐ |
| 9 | Mise en ligne | ~3 h | ☐ |
| 10 | **Acquisition du premier client** | continu | ☐ |
| 11 | Au premier euro encaissé | ~2 h | ☐ |
| 12 | Lot 7 — Évolution (**3 tâches P0 avant la vente**, reste décalable) | ~6,5 h | ☐ |

**~125 h d'implémentation**, dont ~120 h avant le premier encaissement, le reste du lot 7 étant décalé.
Ce sont des estimations de temps d'implémentation assistée, pas des jours de calendrier : le délai
réel est commandé par l'immatriculation et par la vente, pas par le code.

---

# Phase 0 — Lancer maintenant ce qui a un délai

> Rien ici ne demande de savoir coder. Tout est bloquant plus tard. **À faire dès aujourd'hui**,
> pendant que le reste se construit.

### 0.1 — Immatriculer l'entreprise

**Pourquoi maintenant :** c'est le préalable absolu à tout encaissement
([`10-securite-rgpd.md`](10-securite-rgpd.md)) et le délai le plus long du projet. Aucune vente n'est
possible sans. Le délai administratif court pendant que tu développes — chaque jour d'attente ici est
un jour perdu à la fin, pas au début.
**Terminé quand :** tu as un numéro d'immatriculation et une adresse d'établissement utilisables dans
des mentions légales.

### 0.2 — Trancher les décisions qui bloquent le schéma

Ne pas les trancher, c'est se condamner à refaire des migrations. Écrire une entrée dans
[`adr/`](adr/) pour chacune, **avec le compromis assumé** — c'est la règle R22.

| Décision | Sujet | Recommandation déjà écrite | Bloque |
|---|---|---|---|
| ✅ **D9** | Rétention du journal | Tranchée : 30 jours ([`adr/0012`](adr/0012-retention-journal-30-jours.md)) | le schéma du lot 0 (`FOND-37`) |
| ✅ **D13** | Transparence AI Act | Tranchée : informer en clair, marquer les contenus ([`adr/0015`](adr/0015-transparence-ai-act.md)) | vitrine et ADN commercial |
| **D12** | Hébergeur de l'interface | critère dominant : l'offre gratuite doit autoriser l'usage commercial | la mise en ligne |
| **D11** | Marque unique | un seul nom | le nom de domaine |

**Terminé quand :** quatre entrées existent dans `adr/` (**deux le sont — D9 et D13**), et les
décisions sont retirées de [`15-decisions-ouvertes.md`](15-decisions-ouvertes.md).

### 0.3 — ✅ D13 tranchée : la transparence exigée par l'AI Act

> **Tranchée le 2026-07-29** — [`adr/0015`](adr/0015-transparence-ai-act.md). Le diagnostic
> informe en clair dès le premier écran, les contenus générés sont marqués de façon lisible par
> machine, le lexique reçoit une zone exemptée pour cette information.
> **L'article 50 s'applique le 2 août 2026** : le « digital omnibus » adopté en juin 2026 a
> repoussé le haut risque (annexe III au 2 décembre 2027, annexe I au 2 août 2028), **pas**
> l'article 50, ni l'article 4, ni les sanctions. Le sursis de marquage jusqu'au 2 décembre 2026
> ne couvre que les systèmes déjà commercialisés avant le 2 août 2026 : Sentio n'en bénéficie
> pas. Instruction complète : [`25-conformite-legale.md`](25-conformite-legale.md).

C'était le sujet le plus inconfortable de cette phase : l'article 50 impose d'informer la personne
qu'elle interagit avec un système d'IA, de marquer les contenus générés, de tracer les décisions
automatisées et de documenter le système — ce qui heurte de front la promesse fondatrice et le
lexique ([`17-lexique.md`](17-lexique.md)). Deux surfaces sont concernées : **le diagnostic de la
vitrine**, où un visiteur converse réellement avec un système d'IA, et **les messages** écrits par
les employés, envoyés à des tiers.

**Ce qui a été tranché, et pourquoi la lecture confortable a été écartée :** on espérait qu'une
mention sobre, sans le mot interdit, suffirait. Elle ne suffit pas — l'article exige une
information *claire*, et une formule qui laisse le visiteur dans le doute n'informe pas. Le
lexique reçoit donc une zone exemptée, comme les pages légales, et le mot y est **obligatoire**.
Le reste du produit garde le lexique intégralement.

**Terminé** — [`adr/0015`](adr/0015-transparence-ai-act.md) dit où, quand et avec quels mots.
Reste à écrire deux documents que personne ne code : la documentation du système et la note de
compétence en matière d'IA (art. 4), tous deux dus au lot 8.

### 0.4 — Créer les comptes fournisseurs, séparés du personnel

Comptes de production **distincts des comptes personnels**, chez chaque prestataire (R16). Aucune clé
ne doit transiter par un chat, un ticket ou une capture : une clé qui a transité est compromise.
**Terminé quand :** les comptes existent et les clés vivent uniquement en variables d'environnement.

### 0.5 — Activer et prouver l'opt-out d'entraînement

**Préalable de mise en service, pas une bonne pratique.** Tant que l'opt-out n'est pas activé et
prouvé, le fournisseur est **non conforme** et aucune donnée réelle ne doit y transiter
([`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md), [`adr/0009`](adr/0009-fournisseur-inference-ue.md)).
**Terminé quand :** une capture datée de l'opt-out est archivée avec le registre des traitements.

### 0.6 — Prouver que l'alerte du planificateur arrive vraiment

⛔ **Geste humain, et il ne se mécanise pas.** Le battement échoue bruyamment quand son verdict est
`anormal` ([`36-fermer-le-silence.md`](36-fermer-le-silence.md), étape 6), et le seul canal qui
atteigne une personne est l'email d'échec de GitHub Actions. **Un canal auquel personne n'est
abonné est un silence de plus** : tant que cet email n'a pas été vu arriver une fois, on ne
surveille rien, on l'espère.

La preuve se fait en trois gestes, et le deuxième est le seul qui compte :

1. sur GitHub, *Settings → Notifications → Actions* : les notifications d'échec sont actives et
   pointent une adresse **vérifiée** que le fondateur relève réellement ;
2. **provoquer un vrai échec** : lancer le battement à la main (*Actions → Battement → Run
   workflow*) avec un secret `SENTIO_BATTEMENT_URL` volontairement faux. Le workflow doit échouer,
   et l'email doit arriver. Rien d'autre ne prouve la chaîne — lire un réglage ne prouve qu'un
   réglage ;
3. rétablir le secret, et relancer une fois pour vérifier que le vert revient.

⚠️ À refaire le jour où l'adresse du fondateur change, où GitHub modifie ses réglages de
notification, ou où le dépôt change de propriétaire. Une preuve n'est valable que datée.

**Terminé quand :** une capture datée de l'email d'échec reçu est archivée, et le battement est
repassé au vert après rétablissement du secret.

### 0.7 — Créer le guetteur externe, et le voir s'alarmer

⛔ **Geste humain.** L'étape 0.6 couvre les pannes que le planificateur peut RAPPORTER. Celle-ci
couvre celle qu'il ne peut pas : un workflow qui ne s'exécute plus n'échoue pas. Le guetteur est
le seul témoin de sa propre absence.

1. créer un contrôle sur [healthchecks.io](https://healthchecks.io) — gratuit, open source, et
   rien qu'un jeton opaque n'en sort. Période **10 minutes**, tolérance **1 heure** : six
   battements manqués, le même seuil que le signal interne ;
2. poser son adresse de ping dans le secret GitHub `SENTIO_GUETTEUR_URL` ;
3. **le voir s'alarmer** : désactiver le workflow une heure et attendre l'alerte. Un guetteur
   qu'on n'a pas vu sonner est une hypothèse, pas une surveillance ;
4. réactiver, et vérifier que le contrôle repasse au vert.

⚠️ À faire **au moment d'armer le planificateur**, pas avant : tant que le cron est désarmé, le
guetteur s'alarmerait d'un silence qu'on a décidé, et on apprendrait à ignorer ses alertes.

**Terminé quand :** une capture datée de l'alerte reçue est archivée, et le contrôle est repassé
au vert.

---

# Phase 1 — Lot 0 : Fondations (~15 h, 38 tâches `FOND-01`→`FOND-38`)

> *Aucune fonctionnalité visible. C'est normal.* C'est ici que se jouent les erreurs qu'on ne rattrape
> jamais.

**Prérequis :** D9 tranchée ✅ (30 jours, [`adr/0012`](adr/0012-retention-journal-30-jours.md)).

**Ordre :**
1. `FOND-01` monorepo, `FOND-02` intégration continue, `FOND-03` projet de base de données.
2. Les **26 migrations**, dans l'ordre des dépendances de clés étrangères : `tenant` → `tenant_member`
   → `plan` → `subscription` → `usage_counter` → `employee_definition` → `identity` → `employee` →
   mémoire → travail → journal → capacités → fournisseurs → acquisition.
3. `FOND-30` — **activer et vérifier l'isolation par entreprise sur toutes les tables**.
4. `FOND-31/32` repositories, `FOND-33` seed des trois formules, `FOND-34` réservoir de 300+ identités,
   `FOND-35` configuration, `FOND-36` types du domaine, `FOND-37` rétention du journal.

> ⚠️ **Incohérence d'ordre repérée dans le backlog :** `FOND-12` crée `employee_capability` avant
> `FOND-23` qui crée `capability`. Si la première référence la seconde, déplacer `capability` et
> `capability_binding` avant. À vérifier au moment d'écrire les migrations.

**Terminé quand :** `TEST-01` passe (deux entreprises créées, tout accès croisé refusé : interface,
appel direct, identifiant deviné, abonnement temps réel) **et** `TEST-09` passe (activer Growth par
modification de données, sans déploiement ni redémarrage).

> **État au 2026-07-29 : fait, à une réserve près, énoncée plutôt que passée sous silence.**
>
> `TEST-01` et `TEST-09` passent, automatisés dans
> [`supabase/tests/invariants.sql`](../supabase/tests/invariants.sql), et joués **sous les deux
> formes d'entreprise** — un dirigeant seul, et un groupe de plusieurs membres dont un consultant
> présent chez deux clients ([`13-verification.md`](13-verification.md)). Ces parcours ont révélé
> trois failles qu'aucun test table par table ne pouvait voir : une clé étrangère pouvait relier
> deux entreprises, une ligne pouvait changer d'entreprise, et un client pouvait réécrire un fait
> appris par son employé en laissant la signature de l'employé. Fermées par les migrations `0033`,
> `0034` et `0035`, chacune vérifiée par la négative.
>
> **La réserve :** l'accès croisé *par abonnement temps réel* n'est pas vérifié. Aucune table
> n'est publiée en temps réel aujourd'hui, donc rien ne circule par ce canal — mais le jour où une
> table y sera ajoutée (lot 6, le dashboard), ce quatrième chemin devra être éprouvé **avant** la
> mise en ligne. Il n'est pas couvert par la suite locale : il ne se teste que sur la plateforme.

---

# Phase 2 — Lot 1 : Noyau (~17 h, 22 tâches `NOYAU-01`→`NOYAU-22`)

**Prérequis :** phase 1 terminée, opt-out prouvé (0.5).

Model Gateway (interface fournisseur, routage par classe de données, chaîne de repli, comptage,
plafonds durs, trois enveloppes), Policy Engine (classes d'effet, quatre niveaux d'autonomie,
`standing_approval`), assemblage de contexte à trois couches, registre de capacités, journal en ajout
seul, idempotence, format de tour de conversation.

**Terminé quand :** `TEST-04` passe — le fournisseur de secours n'apparaît sur **aucune** requête
marquée réelle, **et** quand le fournisseur conforme est indisponible le comportement observé est
**l'échec ou le report, jamais le repli** ; `TEST-07` passe — une entreprise au plafond voit ses tâches
reportées avec un message clair, sans dégradation silencieuse, sans effet sur les autres entreprises.

> **État au 2026-07-29 : fait.** `TEST-04` et `TEST-07` sont automatisés
> (`packages/core/src/model/gateway.test.ts`), et `TEST-07` est rejoué contre un **vrai** Postgres,
> plafonds lus dans `plan_quota` (`apps/worker/src/adapters/adapters.integration.test.ts`).
>
> **Sur le prérequis d'opt-out (0.5), non levé :** il ne bloquait pas l'écriture du noyau, il bloque
> l'envoi d'une donnée réelle — et c'est désormais le code qui le tient. Tant que
> `inferenceOptOutProven` est faux, le Gateway écarte le fournisseur **avant tout appel réseau** et
> journalise un `routage_refuse`. Le drapeau est le garde global ; la preuve par fournisseur, elle,
> vit en base (`provider_credential.opt_out_proven_at`, dont la contrainte interdit de se déclarer
> « sans entraînement » sans preuve datée).
>
> Un plafond manquait : `inference_tokens_per_day`, ajouté **en données** (migration `0037`). Le quota
> de période bornait le mois sans borner la journée — une entreprise pouvait consommer son mois en
> quelques heures et bloquer les autres, le quota du fournisseur étant unique et partagé.

---

# Phase 3 — Lot 2 : Métier Commercial (~11 h, 15 tâches `METIER-01`→`METIER-15`)

> ⛔ **Ce lot est réorienté depuis le 2026-08-15.** [`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md)
> remplace [`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md) : **le métier n'est plus une entrée
> du système**. Il n'y a plus de « lot Métier Commercial » à écrire — il y a un noyau généraliste,
> une bibliothèque d'actes, et une configuration produite par le diagnostic.
>
> Les tâches `METIER-*` restantes ne s'implémentent pas telles quelles. Elles sont remplacées par
> les lots **A → G** de [`28-bibliotheque-et-creation-de-lady.md`](28-bibliotheque-et-creation-de-lady.md),
> § 8. Ce qui est déjà écrit et vérifié (tables `lead`, `suppression`, `sending_domain`,
> `outbound_message`, garde `peut_envoyer()`) **se conserve intégralement** : ce sont des objets et
> des gardes d'envoi, pas un métier.
>
> *Texte d'origine conservé ci-dessous — il documente l'état atteint avant la bascule.*

> *C'est le lot qui prouve que le produit existe. Tout ce qui précède est de la plomberie.*

**Prérequis : ✅ tranchés le 2026-07-29.** **D5** — le client fournit sa liste en V1, Sentio en
trouvera en V2 ([`adr/0016`](adr/0016-source-des-prospects.md)). **D6** — envoi depuis le domaine
du client, sous la contrainte qui commande tout le lot : *ne jamais délivrer un message qui
pourrait brûler la réputation du client* ([`adr/0017`](adr/0017-domaine-du-client-et-reputation.md)).

> **Avancement au 2026-07-29 :** socle posé et vérifié — tables `lead`, `suppression`,
> `sending_domain`, `outbound_message` (migration `0038`), ADN v1 du Commercial et ses cinq
> capacités **en données** (`0039`), et la garde `peut_envoyer()` dont les sept conditions refusent
> chacune seule.
>
> Livré depuis : le **service d'expédition** ([`adr/0018`](adr/0018-service-expedition-resend.md),
> Resend derrière une interface `EmailProvider`), la **capacité d'envoi** qui demande, compose,
> réserve puis envoie — dans cet ordre —, l'**import** de la liste du client qui refuse ligne par
> ligne avec sa raison, la **qualification déterministe** (`METIER-06/07`, P0), et la
> **suspension automatique** sur rebonds et plaintes (`METIER-21`), qui rend enfin réelle la
> condition « aucune suspension en cours » de la garde.
>
> **Restent :** le lien d'opposition doit atterrir quelque part (dépend de l'interface, lot 4), la
> relance (`METIER-08`), et la mise en service du domaine d'envoi — trois gestes de console à
> faire au moment du premier envoi réel, rappelés dans l'ADR 0018.

> **Sentio reste généraliste** ([`adr/0011`](adr/0011-generaliste-profils-sectoriels.md)) : l'ADN est
> commun, et la spécialisation passe par les **profils sectoriels** (`METIER-23/24`), rédigés par
> Sentio et jamais dérivés des données d'un client. Choisir par quel secteur commencer — pas s'y
> restreindre — grille dans [`22-niche-et-verticalisation.md`](22-niche-et-verticalisation.md).

ADN v1 du Commercial rédigé puis mis en base, table `lead`, puis **cinq capacités, contrat avant
moteur à chaque fois** : trouver des prospects, qualifier, envoyer un message, relancer, mettre à jour
une fiche. Plus les deux garde-fous : mention d'opposition obligatoire dans chaque message
(`METIER-10`) et respect immédiat des désinscriptions (`METIER-11`).

**Prérequis ajouté depuis l'étude concurrentielle** ([`21-concurrence.md`](21-concurrence.md)) :
sept tâches de plus dans ce lot, toutes P0, et aucune n'est facultative.

- **Délivrabilité** — `METIER-18` authentification du domaine (SPF, DKIM, DMARC), `METIER-19` montée
  en charge progressive, `METIER-20` plafond de volume par employé et par jour, `METIER-21`
  surveillance des rebonds et des plaintes avec suspension automatique. **Aucune ligne de
  `METIER-09` ne doit être écrite avant ces quatre-là :** avec D6, un employé mal réglé brûle la
  réputation d'envoi *du client*.
- **Exclusions** — `METIER-16` table des exclusions, `METIER-17` vérification bloquante avant envoi.
  La désinscription est réactive, l'exclusion est préventive.
- **Traçabilité du ciblage** — `METIER-22` journalisation du motif de sélection d'un prospect.
  L'affichage relève de D14, la production du motif non.

> **La qualification passe de P1 à P0.** La première cause d'échec des produits concurrents est une
> donnée sale transformée en mauvais messages à grande échelle — exactement le risque de D5.
> `METIER-06/07` est reclassé dans le backlog.

**Terminé quand :** `TEST-02` passe — le client demande de la comptabilité à son commercial, l'employé
refuse dans le vocabulaire du métier **et** le refus est tracé au journal. Prendre au passage
l'empreinte de `employee_definition` pour `TEST-03`.

---

# Phase 4 — Lot 3 : Exécution autonome (~11 h, 15 tâches `EXEC-01`→`EXEC-15`)

**Prérequis :** trancher **D4** (périodicité — recommandation : quotidien) et **D7** (autonomie par
défaut — recommandation : `confirmer une fois` sur l'irréversible).

Battement planifié et point d'entrée signé, les sept pas du run, reprise après interruption depuis le
journal, suspension et reprise après accord humain, verrouillage de la file, priorité par formule,
notifications de travail émises depuis des résultats journalisés.

**Terminé quand :** `TEST-05` passe — rejouer deux fois le même pas n'envoie pas deux emails, ne crée
pas deux prospects, ne facture pas deux fois ; `TEST-06` passe — un run interrompu reprend au pas
suivant **après redémarrage complet**, et une tâche refusée se termine proprement.

---

# Phase 5 — Lot 4 : Acquisition (~19 h, 20 tâches `ACQUIS-01`→`ACQUIS-20`)

**Prérequis :** ✅ D13 tranchée — la mention de transparence se pose ici, avant la première
question du diagnostic ([`adr/0015`](adr/0015-transparence-ai-act.md)).

Vitrine et navigation, sections Hero et Mission, **démonstration scriptée présentée comme telle**,
section tarifs (Start achetable, Growth et Scale visibles mais non actives), **cinq pages légales en
version provisoire signalée**, diagnostic conversationnel, extraction de profil structuré,
**moteur de règles déterministe** frein → métier, justification rédigée par le modèle, cas hors
périmètre avec liste d'attente, limitation par visiteur et par adresse, enveloppe d'inférence dédiée,
jeu de conversations de référence et test de non-régression.

Deux règles à ne pas relâcher : **le modèle ne choisit jamais le métier** (il rédige la justification),
et la démonstration ne doit jamais passer pour une analyse en direct du visiteur.

**Terminé quand :** le jeu de conversations de référence est rejoué et, pour chaque conversation, le
frein détecté et le métier recommandé restent conformes à l'attendu.

---

# Phase 6 — Lot 5 : Recrutement et paiement (~9,5 h, 10 tâches `RECRUT-01`→`RECRUT-10`)

**Prérequis :** trancher **D2 (prix de Start)** et **D3** (achat immédiat ou essai). D2 bloque aussi le
calcul du retour sur investissement en phase 7. Repère de marché : 100 à 800 €/mois observés, et une
PME peut s'outiller sous 200 €/mois avec des briques existantes — **fixer le prix reste ton arbitrage**.

Paiement hébergé (aucune donnée bancaire ne touche Sentio), **ouverture d'accès par confirmation
serveur uniquement — jamais par la redirection du navigateur**, puis la transaction de recrutement en
quatre temps : réservation atomique d'identité → création de l'employé sur ADN figé → initialisation du
contexte entreprise depuis le diagnostic → notification de bienvenue. Enfin lien magique, protection
anti-scanner, rattachement au tenant créé pendant le diagnostic.

**Terminé quand :** un paiement de test ouvre l'accès **uniquement** via la confirmation serveur, et
l'employé créé porte une identité réservée, un ADN figé et un contexte entreprise initialisé.

---

# Phase 7 — Lot 6 : Dashboard (~16 h, 17 tâches `DASH-01`→`DASH-17`)

**Prérequis :** D2 tranchée (le retour sur investissement s'écrit *(CA attribué − prix) ÷ prix*).

Fiche employé, mesures réelles, progression vers l'objectif, **déclaration de vente par le client**,
calcul du chiffre d'affaires avec fenêtre d'attribution annoncée, temps économisé affiché comme
estimation avec sa base de calcul, **états vides soignés**, notifications, guide de première connexion,
gestion de l'abonnement, CRM minimal, contrôles de validation humaine.

> **C'est ici que se joue la rétention.** Le marché résilie ces outils à 50-70 % par an. Le modèle
> d'attribution — une vente déclarée par le client, rattachée à un prospect touché — est le meilleur
> atout de Sentio : c'est ce qui rend la valeur prouvable au lieu d'être affirmée.

**Terminé quand :** `TEST-08` passe — sur une entreprise vierge, le dashboard n'affiche **aucun** chiffre
non justifié par une ligne en base, et aucune notification « Évolution » n'existe sans `strategy_change`.

---

# Phase 8 — Lot 8 : Conformité et lancement (~12 h, 10 tâches `CONF-01`→`CONF-10`)

> **Ce lot bloque l'encaissement.** Rien ne peut être facturé avant.

**Prérequis :** immatriculation reçue (0.1).

Mentions légales **définitives** (post-immatriculation), CGU et CGV, registre des traitements, analyse
d'impact sur les décisions automatisées, procédure d'effacement par anonymisation du journal, script de
sauvegarde exportée hors plateforme, surveillance par alerte email, **contrôle automatique du lexique
en intégration continue**, vérification de l'usage commercial de chaque offre gratuite, contrats de
sous-traitance signés avec chaque prestataire.

**À ajouter au regard de l'AI Act** (absent du backlog, qui ne couvre que le RGPD) : la mention de
transparence décidée en D13, la documentation du système, la **compétence en matière d'IA** (art. 4,
un document daté suffit) et la traçabilité des décisions automatisées — cette dernière est déjà
satisfaite par le journal en ajout seul, il suffit de la documenter.

**Six tâches manquaient au backlog, révélées par l'instruction juridique du 2026-07-29**
([`25-conformite-legale.md`](25-conformite-legale.md)) — aucune n'est facultative :

| # | Tâche | Bloque |
|---|---|---|
| `CONF-11` | **Contrat de sous-traitance fourni aux clients** (art. 28), avec la liste des sous-traitants ultérieurs — Sentio est **sous-traitant** de ses clients, pas seulement responsable | le premier client sérieux |
| `CONF-12` | **Procédure de violation de données** écrite d'avance : qui alerte, qui notifie, sous 72 h, avec quelles coordonnées (art. 33-34) | la mise en ligne |
| `CONF-13` | **Registre des traitements** complété et daté ([`26-registre-traitements.md`](26-registre-traitements.md)) | rien techniquement, tout juridiquement |
| `CONF-14` | **AIPD de la prospection** — modèle fourni aux clients, qui en sont responsables | le premier envoi réel |
| `CONF-15` | **Durée de conservation des sauvegardes**, rendue cohérente avec l'effacement : une donnée effacée ne doit pas revenir par une restauration | la mise en ligne |
| `CONF-16` | **Export des données d'une entreprise** (droits d'accès et de portabilité, art. 15 et 20) | une demande d'un client |

Deux tâches basculent au **lot 2**, parce qu'elles s'écrivent dans la capacité d'envoi et nulle part
ailleurs : l'**information de l'article 14 dans le premier message** (identité du responsable,
finalité, origine de la donnée, droits) et le **marquage lisible par machine** des contenus générés.
La capacité d'envoi ne doit **pas pouvoir** émettre un message qui n'en porte pas.

**Terminé quand :** aucun texte visible ne contient un mot interdit hors des deux zones exemptées
(vérifié automatiquement), chaque offre gratuite utilisée autorise l'usage commercial par écrit,
tous les contrats de sous-traitance sont signés **dans les deux sens**, et la procédure de violation
de données est écrite avant d'en avoir besoin.

---

# Phase 9 — Mise en ligne (~3 h)

**Prérequis :** D11 (marque) et D12 (hébergeur) tranchées.

Nom de domaine, déploiement, secrets en variables d'environnement, sauvegarde exportée hors plateforme
dès maintenant, quatre alertes de surveillance actives : débit d'inférence en requêtes/minute
glissantes, runs en échec, taille de la base, tâches en attente d'accord humain depuis trop longtemps.

**Terminé quand :** un inconnu peut arriver sur le domaine, faire un diagnostic, recevoir une
recommandation et payer — et tu reçois une alerte email si quoi que ce soit dérape.

---

# Phase 10 — Acquisition du premier client

> **Cette phase n'existe dans aucune tâche du backlog.** Les 181 tâches sont techniques. Or
> [`adr/0001`](adr/0001-repartir-de-zero.md) le dit lui-même : *« le risque réel du projet n'est pas
> technique, il est commercial. »* Un produit fini sans personne à qui le vendre est l'échec le plus
> probable de ce projet.

**À commencer bien avant la phase 9** — idéalement dès la phase 5, quand la vitrine existe.

### 10.1 — Définir la cible précisément
Pas « les PME ». Un secteur, une taille, un rôle, un blocage identifiable. Le marché montre que les
déploiements échouent d'abord sur des cibles trop hétérogènes.

### 10.2 — Construire une liste de 50 entreprises correspondant à la cible
À la main. C'est aussi le meilleur test de la capacité « trouver des prospects » que tu viens de
construire.

### 10.3 — Écrire le message et le tester
Objet et expéditeur non trompeurs, moyen d'opposition dans chaque message — les mêmes règles que celles
imposées aux employés numériques s'appliquent à toi.

### 10.4 — Contacter, mesurer, ajuster
Objectif chiffré à te fixer d'avance : nombre de contacts, nombre de conversations, nombre de
diagnostics complétés. Un diagnostic complété est le vrai signal d'intérêt, pas une visite.

### 10.5 — Servir le premier client de très près
Le premier client ne doit pas découvrir Sentio seul. Un accompagnement manuel n'est pas un aveu de
faiblesse : c'est ce qui te dira ce que le produit doit devenir.

**Terminé quand :** un euro est encaissé, et le client a un employé numérique qui travaille.

---

# Phase 11 — Au premier euro encaissé

Le €0 n'est pas un état stable, c'est une phase. À cet instant précis, quatre choses changent : l'usage
commercial des offres gratuites devient un sujet juridique et non théorique, la perte de données devient
irréversible pour quelqu'un d'autre que toi, le quota partagé devient un risque de rupture de service, et
la disponibilité devient une promesse implicite.

**Ordre de dépense** ([`11-exploitation.md`](11-exploitation.md)) : clé d'inférence payante plafonnée
chez un fournisseur européen → offre payante de la base → hébergement commercial → domaine et envoi
d'emails. Seuils de rupture détaillés dans le même fichier.

**À faire le jour même :** vérifier que chaque offre gratuite autorise l'usage commercial, activer une
sauvegarde restaurable, exporter une sauvegarde hors plateforme.

---

# Phase 12 — Lot 7 : Évolution (~6,5 h, 8 tâches `EVOL-01`→`EVOL-08`)

**Le lot le plus décalable — mais plus entièrement.** Trois de ses tâches sont désormais P0 et
doivent être faites **avant la vente** : `EVOL-01` (faits appris), `EVOL-05` (journal des évolutions)
et `EVOL-06` (notification adossée à un changement enregistré). Elles portent deux des six promesses
de vente — l'amélioration automatique et la mémoire qui s'enrichit
([`23-proposition-de-valeur.md`](23-proposition-de-valeur.md)). Les cinq autres tâches restent
décalables après le premier client.
**Prérequis :** trancher **D8** (l'apprentissage modifiant le profil entreprise s'applique-t-il seul ?
recommandation : auto + notification).

**Terminé quand :** `TEST-03` passe — après plusieurs dizaines de runs, `employee_definition` est
identique bit pour bit ; seuls les faits appris, le profil et le journal ont changé.

---

# Les huit points qu'on ne rattrape jamais

À vérifier avant de déclarer un lot terminé. Chacun se paie par une réécriture s'il est différé.

| # | Point | Où |
|---|---|---|
| 1 | Isolation par entreprise dès la première migration | phase 1 |
| 2 | Clé d'idempotence sur toute action à effet extérieur | phases 2 et 4 |
| 3 | ADN versionné, chaque employé figé sur sa version | phases 1 et 3 |
| 4 | Les deux contextes de mémoire, avec l'auteur tracé par ligne | phase 1 |
| 5 | Capacité (contrat) ≠ moteur (remplaçable), dès le premier outil | phase 3 |
| 6 | Aucune condition en dur sur la formule — uniquement des lectures de quota | phase 1 |
| 7 | Journal en ajout seul comme source de vérité | phase 1 |
| 8 | Migrations en étendre → remplir → basculer → retirer | phase 1 |

---

# Les décisions à trancher, dans l'ordre où elles bloquent

| Phase | Décisions |
|---|---|
| 0 | ✅ D9 rétention · ✅ D13 transparence AI Act · **D12** hébergeur · **D11** marque |
| 3 | **D5** source des prospects · **D6** domaine d'envoi *(risque de réputation du client)* |
| 4 | **D4** périodicité · **D7** autonomie par défaut |
| 6 | **D2** prix de Start · **D3** achat immédiat ou essai |
| 7 | **D14** montrer le motif de sélection d'un prospect |
| 12 | **D8** apprentissage sur le profil entreprise |

D1 est tranchée (Commercial seul), D10 est tranchée par ce document (ordre canonique).
Chaque décision tranchée : une entrée dans [`adr/`](adr/), retirée de
[`15-decisions-ouvertes.md`](15-decisions-ouvertes.md), **avec son compromis assumé**.

---

# Ce que dit le marché

Vérifié le 2026-07-28. Ces chiffres bougent vite — les re-vérifier avant de fixer un prix.

**La demande existe, et elle croît.** 47 % des PME françaises ont lancé au moins un projet d'IA et 42 %
ont déployé en production ; 34 % des PME sont équipées, soit +18 points en deux ans. Gartner prévoit que
40 % des PME auront au moins un employé numérique déployé fin 2026, et 22 % des équipes commerciales ont
déjà remplacé une partie de leurs commerciaux humains. Le marché pèse une quinzaine de milliards de
dollars et croît d'environ 30 % par an. **La réponse à « est-ce que des PME achèteraient ça ? » est oui.**

**Mais trois signaux doivent changer la façon de construire.**

1. **La rétention est mauvaise : 50 à 70 % de résiliation annuelle**, environ le double du
   renouvellement d'un commercial humain. Vendre est une chose, garder en est une autre.
2. **Les déploiements échouent d'abord sur la qualité des données.** Sur 412 déploiements arrêtés, les
   causes dominantes sont une donnée client sale transformée en mauvais messages à grande échelle, des
   cibles trop hétérogènes, et une conversion rendez-vous → opportunité faible (~15 % contre ~25 % en
   humain) qui annule l'avantage de volume. **C'est exactement le risque de D5.**
3. **La pression tarifaire est brutale.** Le marché bascule du prix par siège au paiement au résultat ;
   un acteur majeur a divisé ses prix par deux en avril 2026. Fourchette observée : 100 à 800 €/mois,
   et une PME peut s'outiller sous 200 €/mois avec des briques existantes.

**Trois conséquences directes sur ce plan :**

- Remonter la **qualification des prospects** (`METIER-06/07`) de P1 à P0 en phase 3.
- Traiter le **modèle d'attribution du dashboard** comme l'arme de rétention principale, pas comme un
  affichage : c'est ce qui rend la valeur prouvable à l'échéance où les autres se font résilier.
- **Définir une cible étroite** en phase 10 plutôt qu'un marché large.

Ce que Sentio a que les autres n'ont pas : le client n'installe rien, ne choisit rien, ne configure
rien, et ne voit jamais la mécanique. Sur un marché où la première cause d'échec est la mise en œuvre,
c'est un angle défendable — à condition que la qualification tienne.
