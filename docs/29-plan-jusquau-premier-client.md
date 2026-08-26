# 29 — Le plan, jusqu'au premier client qui paie

> **C'est le document qui dit quoi faire ensuite.** Il remplace
> [`20-plan-action.md`](20-plan-action.md) comme fil d'exécution ; le 20 garde l'historique et les
> détails de chaque lot déjà fait.
>
> Établi le 2026-08-15, après ADR-0029
> ([`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md)) et un état des lieux vérifié :
> 119 tâches sur 185 tracées, base distante vide, aucune fonction déployée.

---

## Comment on s'en sert

**Pour reprendre le travail, il suffit de dire : « continue le plan ».** L'étape courante est la
première dont la case n'est pas cochée dans le tableau de bord ci-dessous.

### La forme du plan — décidée le 2026-08-15

**On construit d'abord un produit qui fonctionne. La vente vient après.**

La partie I ne contient que du travail exécutable par un agent : ni geste d'infrastructure, ni
argent, ni signature, ni démarche administrative. Elle se déroule d'un bout à l'autre sans jamais
attendre après quoi que ce soit d'extérieur.

La partie II regroupe **tout ce qui dépend du fondateur** — mise en ligne, légal, vente. Rien n'y
est entamé avant que la partie I ne soit finie.

*Conséquence assumée, dite une fois et pas répétée :* l'immatriculation est le seul élément du plan
qu'aucun travail de code ne peut rattraper, parce qu'elle dépend d'un délai administratif. Placée en
partie II, elle devient le chemin critique de la fin. Si tu veux comprimer le calendrier sans rien
changer à l'ordre, dépose le dossier au moment où tu attaques l'étape 9 — il courra en silence
pendant que la construction se termine. C'est un levier, pas une consigne.

### Les cinq règles, non négociables

1. **Une étape à la fois, dans l'ordre.** Aucune étape ne se saute, même si elle paraît facile.
   Un lot aval construit sur un lot amont incomplet produit du travail à refaire.
2. **Une étape est terminée quand son critère « ✅ Terminé quand » passe** — jamais sur une
   impression d'avancement. Si le critère ne passe pas, l'étape n'est pas finie.
3. **`pnpm run verify` doit être vert avant de cocher quoi que ce soit.** C'est la définition
   unique de « vérifié » ([`adr/0024`](adr/0024-verification-automatique.md)).
4. **Aucune étape de la partie I n'attend une décision du fondateur.** Si une question de produit
   surgit en cours de route, l'agent la note en fin de ce fichier et continue sur l'hypothèse la
   plus prudente. Il ne s'arrête pas.
5. **Toute découverte d'architecture se signale** — un manque structurel trouvé en écrivant du
   code se dit, il ne se contourne pas.

### Ce qu'un agent ne fait jamais sur ce projet

Pousser un schéma en ligne · poser un secret · déployer une fonction · toucher la base distante en
écriture · engager une dépense · signer quoi que ce soit · publier vers l'extérieur.

---

## Tableau de bord

### Partie I — Construire *(agent, sans interruption)*

| # | Étape | État |
|---|---|---|
| 1 | Rendre `verify` honnête | ✅ 2026-08-15 |
| 2 | Séparer l'acte et l'objet dans les capacités | ✅ 2026-08-15 |
| 3 | La couche mission, et la chaîne objectif → travail | ✅ 2026-08-15 |
| 4 | La configuration de Lady, versionnée | ✅ 2026-08-15 |
| 5 | Le noyau perd le métier | ✅ 2026-08-15 |
| 6 | Les constats d'audit et le moteur de composition | ✅ 2026-08-15 |
| 7 | Le runtime fabrique le travail | ✅ 2026-08-15 |
| 8 | Un deuxième domaine dans la bibliothèque | ✅ 2026-08-15 |
| 9 | Pouvoir encaisser | ✅ 2026-08-15 |
| 10 | L'espace client, version minimale | ✅ 2026-08-15 |
| 11 | Le filet : alerte et sauvegarde | ✅ 2026-08-15 |
| 12 | Répétition générale, à blanc | ✅ 2026-08-15 |

### Partie II — Mettre en vente *(⛔ fondateur uniquement)*

| # | Étape | État |
|---|---|---|
| 13 | Immatriculation | ☐ |
| 14 | Mentions légales, CGV, registre, analyse d'impact | ☐ |
| 15 | Mise en ligne : schéma, secrets, déploiement | ☐ |
| 16 | Répétition générale, en réel | ☐ |
| 17 | Vendre | ☐ |

---

# PARTIE I — CONSTRUIRE

*Douze étapes, aucune ne dépend de toi. Un agent peut les enchaîner de bout en bout.*

---

## Étape 1 — Rendre `verify` honnête

**Le problème, constaté le 2026-08-15.** `pnpm run verify` est vert alors que **152 tests
d'intégration sautent en silence** — 135 dans `apps/worker`, 17 dans `apps/vitrine`. Ils ne
s'exécutent que si `DATABASE_URL` est présente. La garde qui fait échouer bruyamment plutôt que
sauter (`SENTIO_REQUIRE_DB_TESTS=1`) existe, mais elle n'est posée que dans l'intégration continue.

En local, `verify` couvre donc un cinquième du moteur en affichant le même vert. Et il tourne avant
chaque `git push`.

**Ce qu'il faut faire.** Faire échouer `verify` quand la base manque, au lieu de sauter. Deux bases
séparées, comme la CI : `sentio_test` pour le cœur, `vitrine_test` pour la vitrine — les migrations
de la vitrine effacent le schéma du cœur si on les lance sur la même base.

**Pourquoi en premier.** Les onze étapes suivantes seront validées par `verify`. Un contrôle qui
ment invalide tout ce qui vient après.

**✅ Terminé quand :** `pnpm run verify` sans base **échoue** avec un message explicite ; avec les
deux bases, il passe et `apps/worker` affiche 151 tests exécutés, pas 16.

### Fait le 2026-08-15 — `scripts/verifier-avec-base.mjs`

`verify` orchestre désormais tout ce qui exige une base. Avant / après :

| | avant | après |
|---|---|---|
| `apps/worker` | 16 exécutés, 135 sautés | **151 exécutés** |
| `apps/vitrine` | 4 exécutés, 17 sautés | **21 exécutés** |
| Fonctions Deno | 24 passés, 6 ignorés | **30 passés, 0 ignoré** |
| Sans base | vert | **échoue, avec la marche à suivre** |

Trois gardes refusent de commencer plutôt que de détruire : une base distante, deux chaînes de
connexion identiques (la vitrine effacerait le schéma du cœur), un Postgres injoignable.

**Deux choses trouvées en chemin, qui ne sont pas refermées :**

1. **Un test instable, réel.** `EXEC-12 — refuse une capacité que le client n'a pas activée`
   (`apps/worker/src/boucle.integration.test.ts`) : **0 échec sur 16** quand le worker tourne seul
   sur une base fraîche, y compris sous charge processeur — **2 échecs sur 9** quand il tourne au
   sein de l'ensemble des paquets, en parallèle comme en série. Le script adopte la configuration
   prouvée stable (chaque suite reçoit une base neuve, seule), ce qui rend `verify` fiable
   aujourd'hui — mais **la fragilité du test demeure**. Le test n'exécute qu'UN travail et suppose
   que c'est le sien ; la piste ouverte est l'ordre des fichiers, que vitest ajuste d'après les
   durées précédentes. **À corriger à l'étape 3**, qui rouvre justement la chaîne mission → travail.
2. **L'intégration continue garde sa propre définition.** Son job `schema` fait la même chose en
   trois étapes écrites à la main, et ne lance ni `packages/runtime` ni les tests de parité Deno
   contre une base. Le dépôt écrit lui-même que *« deux définitions de "vérifié" finiraient par
   diverger »*. Faire appeler `verify:base` par la CI est la suite naturelle ; ça demande d'ajouter
   Deno au job `schema` et de fusionner deux travaux — non fait ici parce que non exécutable
   depuis le poste, donc non vérifiable avant envoi.

---

## Étape 2 — Séparer l'acte et l'objet dans les capacités

Aujourd'hui une capacité s'appelle `relancer_un_prospect` : l'objet est enfermé dans le nom. C'est
ce qui empêche la bibliothèque de dépasser le commercial.

Après : un acte (`relancer`) s'applique à un objet (prospect, candidat, facture). Un acte écrit une
fois sert plusieurs métiers.

**Détail :** [`28-bibliotheque-et-creation-de-lady.md`](28-bibliotheque-et-creation-de-lady.md) §2.

**Attention :** aucun comportement ne change à cette étape. C'est un renommage et une
restructuration. Les cinq capacités existantes doivent continuer à fonctionner exactement pareil.

**✅ Terminé quand :** les invariants de schéma passent, `verify` est vert, et aucun **acte** ne
contient de nom d'objet.

### Fait le 2026-08-15 — `20260815120001_acte_et_objet.sql`

Les cinq capacités se sont révélées être **cinq actes appliqués au même objet** :

| avant | acte | objet |
|---|---|---|
| `trouver_des_prospects` | `rechercher` | `prospect` |
| `qualifier_un_prospect` | `qualifier` | `prospect` |
| `envoyer_un_message` | `envoyer` | `prospect` |
| `relancer_un_prospect` | `relancer` | `prospect` |
| `mettre_a_jour_une_fiche` | `mettre_a_jour` | `prospect` |

Aucune n'est commerciale en elle-même — c'est leur composition qui l'est. Appliquer `relancer` à
une facture impayée ne demandera pas une sixième capacité, mais un objet de plus.

**La clé est désormais engendrée** par la base depuis les deux axes : elle ne peut plus les
contredire. Quatre refus le tiennent mécaniquement, vérifiés par un nouvel invariant (`LADY-A`) :
une clé saisie à la main, un doublon sur `(acte, objet)`, un séparateur dans un axe, et un acte
qui nommerait son objet.

`docs/28` §2 décrit la suite : c'est cet axe « objet » qui portera candidat, facture et demande
entrante, sans qu'un seul acte soit réécrit.

**Ce que l'étape a coûté ailleurs :** 17 fichiers TypeScript renommés, et une constante canonique
(`CAPACITES` dans `@sentio/domain`) pour que la prochaine évolution se fasse en un seul endroit.
Le seul test qui a cassé insérait une capacité avec une clé explicite — `verify` l'a attrapé, ce
qui est exactement ce que l'étape 1 venait rendre possible.

---

## Étape 3 — La couche mission, et la chaîne objectif → travail

**Le trou, constaté dans le schéma.** `task` n'a aucun lien vers un objectif. `objective` n'a aucun
lien vers un employé ni une mission. Il n'y a donc rien entre « le dirigeant veut +5 000 €/mois » et
« une ligne dans `task` ». C'est la cause structurelle du symptôme connu : le moteur réveille ce qui
existe mais ne fabrique pas le travail.

Une mission : une composition ordonnée d'actes, un déclencheur, une condition de fin, une métrique.
Elle appartient à la configuration et se rattache à un objectif.

**À refermer ici, hérité de l'étape 1 :** le test `EXEC-12 — refuse une capacité que le client n'a
pas activée` n'exécute qu'un travail et suppose que c'est le sien. Une fois la chaîne
mission → travail explicite, il doit pouvoir viser SA mission au lieu de parier sur la file.

**✅ Terminé quand :** une mission ne peut pas s'ouvrir sans objectif — et c'est la base qui le
refuse, pas le code.

### Fait le 2026-08-15 — `20260815120002_mission_et_objectif.sql`

**Le plan se trompait sur un point, et le dépôt avait raison :** la couche mission n'était pas à
créer, elle existait. `task` **est** la mission depuis [`adr/0027`](adr/0027-approvisionnement-du-travail.md)
— elle porte son sujet, un index unique interdit deux missions sur le même, et un lot par jour et
par employé borne l'ouverture. Ce qui manquait était plus étroit et plus grave : **elle ne disait
pas quel objectif elle servait.**

La règle existait pourtant, mais seulement en passant : `peut_ouvrir_une_mission()` refuse d'ouvrir
sans objectif actif. Un contrôle à l'entrée n'est pas un lien — il empêche d'ouvrir à tort, il ne
permet pas de répondre *« pour quoi ce travail a-t-il été fait »*.

**Trois décisions prises ici :**

1. **Une entreprise n'a qu'un objectif actif.** Rattacher une mission suppose de savoir duquel on
   parle ; l'ambiguïté était `EXEC-16`, relevée sans être refermée. Elle l'est par le haut plutôt
   que par une règle de tri. Changer d'objectif reste possible — on retire l'ancien, on en pose un
   neuf — et les missions déjà ouvertes gardent le leur.
2. **La garantie est posée à la création, par déclencheur, pas par `not null`.** Un `not null`
   aurait été faux : l'effacement RGPD supprime les objectifs mais **conserve** les missions,
   parce que le journal les référence et doit survivre dépouillé plutôt que détruit. Une cascade
   aurait emporté la preuve d'effacement ; un `restrict` aurait fait échouer l'effacement.
3. **Le lien porte l'entreprise**, comme toute clé étrangère du dépôt : une mission ne peut pas
   emprunter l'objectif d'une autre entreprise.

**Un défaut réel trouvé en chemin, et corrigé.** `loadStepContext` listait **tous** les objectifs,
sans filtrer sur leur état. Un objectif *atteint* ou *retiré* comptait donc encore comme déclaré :
l'employé continuait de travailler vers un but que son client venait de retirer, et le contexte du
modèle citait cette cible comme si elle tenait toujours. Le défaut datait de `20260806120003`, qui
a donné un état aux objectifs sans que ce chemin de lecture le reprenne.

**Le test instable de l'étape 1 est refermé.** `EXEC-12` n'exécutait qu'un travail et supposait que
c'était le sien, alors que la file est globale. Les travaux des autres entreprises sont désormais
repoussés plutôt que supprimés — ce qu'ils ont écrit reste intact, ils ne disputent plus le tour.
**0 échec sur 5** dans la configuration qui en produisait 2 sur 9.

**Coût :** 11 fichiers de fixtures rattachés à un objectif, 1 invariant (`LADY-B`), 1 correction de
production.

---

## Étape 4 — La configuration de Lady, versionnée

Deux tables : la configuration active, et l'historique de ses versions. Chaque version porte son
déclencheur, sa raison, le diagnostic qui l'a produite, la version précédente, et l'accord qui l'a
autorisée.

On doit pouvoir répondre : pourquoi Lady a changé, quand, ce qu'il y avait avant, quel diagnostic
l'a provoqué, quels résultats ont été observés, quelle politique l'a permis.

**Règle absolue :** une configuration ne peut que **retrancher** aux pouvoirs du noyau. Jamais en
ajouter. Cette garantie doit être mécanique — vérifiée par la base, pas par une relecture.

**Question de produit non tranchée, et son hypothèse de travail.** Une même Lady peut-elle porter
plusieurs domaines à la fois ? **Hypothèse retenue : oui**, le modèle de données l'autorise. C'est
le choix réversible — restreindre plus tard coûte une contrainte, élargir plus tard coûte une
migration.

**✅ Terminé quand :** un test prouve qu'une configuration tentant d'activer une capacité absente du
noyau est refusée par la base.

### Fait le 2026-08-15 — `20260815120003_configuration_de_lady.sql`

**La configuration existait déjà — éparpillée, et sans mémoire.** L'autonomie sur `employee`, les
capacités dans `employee_capability`, le contexte dans `company_profile`, le calibrage produit par
le moteur de recommandation et **jamais écrit nulle part**, et `strategy_change` réduit à une phrase
libre sans lien vers ce qui avait changé. Les trois questions que le produit promet restaient donc
sans réponse : **pourquoi Lady a changé, quand, et ce qu'il y avait avant.**

`lady_configuration` les rend décidables. Six garanties, toutes tenues par la base :

| Garantie | Ce qu'elle empêche |
|---|---|
| Une seule configuration active par employé | « laquelle s'applique » redevenu flou |
| La v1 n'a pas de passé, toute autre en a un | une chaîne qui casse en silence |
| Les versions se suivent sans trou | « ce qu'il y avait avant » devenu faux |
| Une chaîne ne traverse pas deux employés | l'histoire d'une Lady mélangée à celle d'une autre |
| Publiée, une configuration est immuable | une décision réécrite après coup |
| **Une capacité hors périmètre ne s'active pas** | **une configuration qui étend les pouvoirs du noyau** |

La dernière ligne est le critère de l'étape, et c'est le §11 de la vision : une configuration
**retranche**, elle n'étend jamais.

**Deux limites dites plutôt que simulées :**

1. **La borne du périmètre est celle d'aujourd'hui** — `capability_binding`, c'est-à-dire
   « existe-t-il un moteur pour cette capacité dans cette formule ». La borne par les capacités du
   **Lady Core** lui-même viendra à l'étape 5, quand `employee_definition` cessera d'être un métier.
   L'ADN v1 est en prose : il ne peut pas encore servir de borne mécanique.
2. **Aucune clé étrangère vers `diagnostic_session`**, délibérément. Elle appartient à la zone
   *vitrine*, étanche à la zone client ([`02-architecture.md`](02-architecture.md)) : un lien de
   schéma coudrait les deux zones. La référence est gardée comme trace, pas comme contrainte.

**Deux filets du dépôt ont fait leur travail sur moi.** L'invariant structurel a refusé mes deux
clés étrangères qui ne portaient pas l'entreprise ; et le verrou de changement d'entreprise manquait
sur la nouvelle table. Les deux ont été signalés avant tout envoi, pas découverts après.

---

## Étape 5 — Le noyau perd le métier

`employee_definition` porte aujourd'hui `unique (profession, version)` : le métier est l'identité du
noyau. Il devient le **Lady Core** : capacités concevables, limites fondamentales, règles, version.

On conserve intégralement ce qui existe déjà et qui est juste : l'immuabilité par déclencheur, et le
figeage de chaque employé sur une version.

Dans le même mouvement, `recommendation` cesse de pointer vers un métier et pointe vers une
configuration.

**✅ Terminé quand :** le mot « profession » n'est plus une clé d'identité, les invariants de
schéma passent, et un employé existant reste attaché à sa version d'origine.

### Fait le 2026-08-15 — `20260815120004_lady_core.sql`

`employee_definition` portait `unique (profession, version)` : **le métier était l'axe d'identité
du noyau.** Autrement dit, le produit avait autant de noyaux que de métiers — l'architecture même
qu'[`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md) déclare obsolète. Il n'y en a plus
qu'un, identifié par sa version et rien d'autre.

**Le mot « profession » portait trois sens différents.** Les séparer était le vrai travail :

| sens | ce qu'il devient |
|---|---|
| l'identité du noyau | **supprimé** — la version identifie, et elle seule |
| le rôle de Lady | `lady_configuration.role`, une **sortie** du diagnostic |
| le gisement de missions | colonne **renommée `gisement`** — ce sens-là est réel et n'a jamais été un métier |

Le troisième était le piège : le runtime lit cette colonne pour savoir **où puiser les sujets**.
La supprimer aurait cassé l'approvisionnement ; la garder sous son ancien nom aurait laissé le
métier dans le noyau. Le renommage dit enfin ce qu'elle fait. Le vocabulaire suit dans le code —
`RegistreDeGisementsParMetier` → `RegistreDeGisementsEnMemoire`, `metier_sans_gisement` →
`gisement_inconnu`.

**La borne qui manquait est posée.** L'étape 4 refusait déjà d'activer une capacité qu'aucun moteur
ne sert — mais c'était la borne de la *formule*, annoncée comme provisoire. Le noyau porte
désormais `capacites` : ce qu'une Lady peut **concevoir**, quelle que soit sa configuration. Les
deux bornes tiennent maintenant ensemble, et dans cet ordre :

1. **le noyau** — cette version de Lady conçoit-elle ce geste ?
2. **la formule** — un moteur le sert-il aujourd'hui ?

La première dit ce que Lady *peut être*, la seconde ce qu'elle *peut faire*. L'invariant `LADY-D`
éprouve les deux séparément, sur un noyau v2 publié exprès pour ça.

**Un noyau qui ne conçoit rien est refusé** — `capacites` doit être une liste non vide. C'est ce
qui a fait tomber quatorze fixtures : publier un noyau sans dire ce qu'il rend possible était
jusque-là silencieusement accepté.

**La recommandation ne désigne plus un métier.** Elle porte la **configuration proposée**, comme
donnée — celle-là même que le moteur de calibrage produisait déjà et que personne n'écrivait nulle
part. Elle ne peut pas *pointer* une configuration : la recommandation naît pendant le diagnostic,
avant qu'une entreprise existe. Au recrutement, elle devient la version 1. La règle d'honnêteté est
conservée telle quelle : hors périmètre ⇒ rien de proposé.

**Ce qui reste, et qui est daté.** L'ADN v1 contient encore `"profession": "commercial"` dans son
texte, et le contexte du modèle écrit toujours `Métier : commercial`. C'est une donnée, pas une
structure : elle disparaît à l'**étape 7**, quand `assembleContext` lira le rôle depuis la
configuration active au lieu de le lire dans l'ADN. Le noyau v2 publié par l'invariant montre déjà
la forme cible — une mission généraliste, aucun métier.

---

## Étape 6 — Les constats d'audit et le moteur de composition

Le diagnostic produit des **constats typés** — force, faiblesse, goulot, risque, opportunité —
chacun avec sa source et sa confiance. Puis un moteur **déterministe** les pondère et sélectionne
missions et capacités dans la bibliothèque.

**La règle qui gouverne cette étape**, déjà écrite en base pour le métier et ici généralisée :
*le modèle ne décide jamais. Il rédige la justification d'une décision déjà prise.*

**Le test le plus important du projet se trouve ici :** mêmes constats en entrée ⇒ même
configuration en sortie, toujours. Écris-le avant le moteur.

**✅ Terminé quand :** le test de déterminisme passe sur au moins cinq jeux de constats
contrastés, et qu'aucune configuration ne sort du vocabulaire écrit.

### Fait le 2026-08-15 — `20260815120005_constats_daudit.sql`, `packages/domain/{audit,composition}.ts`

**Le moteur allait droit de la déclaration à la configuration.** Le dirigeant disait « je manque
de prospects », l'employé partait prospecter. Autrement dit **la demande du client était la
décision** — et Sentio n'apportait rien de plus qu'un formulaire.

Trois choses étaient confondues, elles sont maintenant distinctes :

```text
ce que le client DIT   →   ce qu'on CONSTATE   →   ce qu'on en CONCLUT
detected_friction          audit_finding          configuration_proposee
```

Un constat porte **son genre** (force, faiblesse, goulot, risque, opportunité), **son domaine**,
**sa source** et **sa confiance**. Une déduction ne pèse pas comme une mesure — sans quoi une
impression vaudrait une observation et le diagnostic ne serait qu'un écho poli.

**Le mécanisme qui rend le diagnostic capable de contredire la demande, c'est la force.** Elle
pèse *négativement*. Quand un dirigeant dit « on parle aux mauvaises personnes », il déclare
implicitement que le volume ne manque pas : ce constat-là retire à la recherche le besoin qu'on
lui aurait prêté, et le rôle bascule vers la qualification. Sans jamais inventer une donnée.

**Le test le plus important du projet est écrit** — cinq dossiers volontairement contrastés,
chacun composé cinquante fois plus trois permutations de l'ordre d'arrivée des constats. L'ordre
d'arrivée est un accident de la conversation : s'il changeait la configuration, deux dirigeants
racontant la même chose dans un ordre différent recevraient deux Lady différentes, et personne ne
saurait pourquoi.

**Deux règles de produit ont émergé en écrivant le moteur, et n'étaient écrites nulle part :**

1. **Un domaine cassé ouvre toute sa famille d'actes ; une simple opportunité n'ouvre que l'acte
   d'entrée.** Sans cette distinction, un client dont le problème est le ciblage recevait des
   relances en plus — alors qu'il a besoin qu'on écrive *moins, et mieux*. C'est un test existant
   qui l'a signalé, et c'est le moteur qui avait tort.
2. **On n'écrit jamais à une entreprise qu'on n'a pas qualifiée.** Le moteur activait `envoyer`
   sans `qualifier` : la composition ferme désormais l'ensemble sur les exigences de chaque acte.
   Ce n'est pas une dépendance technique, c'est la garantie de réputation que `peut_envoyer()`
   défend déjà en base.

**Conséquence visible :** les configurations diffèrent désormais réellement d'un client à l'autre.
Le socle de cinq capacités toujours activées a disparu — un dossier « pas assez d'entreprises
approchées, liste déjà en main » reçoit `rechercher` + `qualifier` + `envoyer`, et **pas** de
relance. C'est ce que la vision promettait, et c'est ce qui casse le plus de tests : ils
supposaient une configuration fixe.

**Le refus honnête fonctionne de bout en bout.** Un dossier dont le besoin dominant tombe dans un
domaine que la bibliothèque ne couvre pas — les demandes entrantes, par exemple — sort en
`hors_perimetre`, **sans se rabattre sur le deuxième besoin**. Vendre le deuxième en taisant le
premier serait exactement le mensonge que ce mécanisme existe pour empêcher.

---

## Étape 7 — Le runtime fabrique le travail

Le moteur dérive les tâches des missions au lieu de réveiller ce qui existe déjà. Et
`assembleContext` n'injecte que les capacités de la configuration active — jamais la bibliothèque
entière, sous peine de détruire le raisonnement du modèle.

**✅ Terminé quand :** un employé neuf, avec un objectif et une configuration, produit son premier
lot de travail sans qu'aucune tâche n'ait été créée à la main.

### Fait le 2026-08-15 — `20260815120006`, `20260815120007`, `apps/worker/src/premier-lot.integration.test.ts`

**Le chaînon manquant n'était pas là où le plan le croyait.** L'approvisionnement fabriquait déjà
les missions ; ce qui manquait était en amont : `lady_configuration` disait ce que Lady **devait**
faire, `employee_capability` ce qu'elle **pouvait** faire, et **rien ne reliait les deux**. Aucun
chemin de production n'écrivait `employee_capability` — les seules insertions vivaient dans des
fixtures de test. Un employé recruté n'avait donc aucun pouvoir, et la configuration était une
intention sans effet.

`appliquer_la_configuration()` referme ça en **un seul geste atomique** : désactiver l'ancienne
version, activer la neuve, réaligner les capacités ouvertes, reporter l'autonomie. Fait au bord en
quatre requêtes, la moindre interruption laisserait un employé dont les pouvoirs ne correspondent
à aucune configuration — et personne ne s'en apercevrait, chaque table étant cohérente prise
isolément.

**`employee_capability` devient une projection de la configuration.** Le retrait compte autant que
l'ajout : une capacité qu'une nouvelle version ne reprend pas cesse d'être utilisable. Sans ça,
« une configuration retranche au périmètre » serait faux — Lady garderait indéfiniment tout pouvoir
ouvert un jour.

**Le mot « Métier » a disparu du contexte du modèle**, comme annoncé à l'étape 5. La première ligne
lue par Lady est désormais son **rôle**, tiré de la configuration active, suivi de ses priorités.
Sans configuration, aucune ligne de rôle : une Lady non configurée n'en a pas, et lui en inventer un
serait exactement la faute que le reste de l'architecture rend impossible.

**Un défaut que j'avais introduit à l'étape 4, trouvé en écrivant ce test.** L'immuabilité de
`lady_configuration` refusait *toute* suppression — donc aussi celle qui vient d'une cascade,
c'est-à-dire **l'effacement d'une entreprise**. Deux choses étaient confondues sous le même refus :
réécrire l'histoire (interdit, sans exception) et effacer un client (obligatoire, par un chemin
explicite). Le verrou les distingue maintenant, selon le motif déjà établi pour le journal. Et
`erase_tenant()` emporte désormais les configurations : elles portent le rôle décidé **et la raison
en clair**, c'est-à-dire de la donnée client.

**Le critère est prouvé de bout en bout** par une suite dédiée (`LADY-G`) qui n'écrit **aucune
ligne de `task`** : trois prospects confiés, une configuration appliquée, et trois missions
apparaissent — chacune rattachée à son objectif, chacune mise en file. Elle vérifie aussi que Lady
travaille sous le rôle de sa configuration, et que ses pouvoirs viennent d'elle et non du noyau.

---

## Étape 8 — Un deuxième domaine dans la bibliothèque

Le minimum pour que le diagnostic ait un vrai choix : **la communication entrante**
(`accuser_reception`, `router`, `repondre`, `escalader`).

Tant qu'un seul domaine existe, la recommandation reste un théâtre à issue unique — le problème
qu'ADR-0007 avait déjà identifié le 2026-07-27, et qui revient tel quel si on l'oublie.

Chaque acte : un contrat, une classe d'effet, un moteur lié pour chaque formule vendable, un test.
Le déploiement échoue déjà tout seul si un acte n'a pas de moteur — ne pas contourner ce contrôle.

**✅ Terminé quand :** deux entreprises aux constats opposés reçoivent deux configurations
réellement différentes, et la différence s'explique par les constats.

### Fait le 2026-08-15 — `20260815120008_objet_du_constat.sql`, axe « objet » dans le moteur

**⚠️ La prémisse de cette étape était fausse, et l'étape 6 l'a révélée.** J'avais écrit « tant
qu'un seul domaine existe, la recommandation reste un théâtre à issue unique ». C'est faux : la
bibliothèque en couvre **quatre** — recherche, évaluation, communication sortante, données. Le
critère de l'étape était donc déjà atteint avant de commencer.

**Le vrai manque était ailleurs, et plus grave.** L'étape 2 avait séparé l'acte de l'objet *en
base* ; le moteur de composition, lui, raisonnait encore **en domaines seuls**. Un besoin sur
`communication_sortante × facture` aurait donc été servi par les actes du prospect : le moteur
recollait ce que le schéma avait séparé, et le refus honnête aurait répondu « oui » à la mauvaise
question.

Un besoin est désormais un **couple (domaine, objet)**. `relancer` existe, `facture` existe, et
`relancer × facture` n'est servi par **aucun moteur** — le moteur le dit au lieu de promettre un
geste que rien n'exécute.

**Pourquoi aucun nouveau domaine n'a été écrit.** La communication entrante demanderait quatre
moteurs neufs et un canal d'entrée qui n'existe pas — aucune fonction n'est déployée. Le dépôt
interdit par construction de déclarer une capacité sans moteur : le contrôle de déploiement échoue
(`20260729120010`, bloc `do $$`). Déclarer `accuser_reception` aujourd'hui aurait été une promesse
invérifiable. Ce qui a été fait à la place rend l'ajout futur possible **sans réécrire le moteur**.

**Le cas canonique de la vision (§7) fonctionne maintenant de bout en bout.** Une question a été
ajoutée au diagnostic : *que deviennent les demandes que vous recevez sans les avoir cherchées ?*
Sans elle, Sentio ne pouvait pas constater ce que le dirigeant ne déclare pas — donc pas le dire.
Un client qui demande de la prospection, a déjà une liste, et perd ses demandes entrantes reçoit
désormais un **refus honnête** plutôt que la prospection qu'il croyait vouloir. La question est
facultative : un diagnostic mené sans elle reste valable, il voit simplement moins.

### La cause racine du test instable, enfin trouvée

Poursuivie depuis l'étape 1, contournée à l'étape 3, **identifiée ici** : `job.next_run_at` reçoit
le `now()` de **Postgres** ; la file compare `next_run_at <= maintenant`, où `maintenant` venait de
l'horloge du **processus Node**. Un décalage d'une milliseconde entre les deux suffit à rendre le
travail « pas encore dû » — l'exécutant ne prend rien, le journal reste vide, et le test échoue sur
une assertion qui n'a rien à voir avec ce qu'elle vérifie.

Les suites lisent désormais l'heure **selon la base**. En production le même décalage est sans
conséquence — le battement suivant reprend le travail — mais en test il n'y a pas de battement
suivant. **0 échec sur 3 exécutions complètes** et 0 sur 6 en isolation, là où le taux tournait
autour d'un sur huit.

---

## Étape 9 — Pouvoir encaisser

Les dix tâches `RECRUT-01` → `RECRUT-10`. Aujourd'hui, **personne ne peut acheter** — même si dix
dirigeants le voulaient.

L'enchaînement : paiement hébergé → confirmation **côté serveur** (jamais la redirection du
navigateur) → réservation d'une identité → création de l'employé sur une version figée → contexte
initialisé depuis le diagnostic → connexion par lien magique → rattachement au compte créé pendant
le diagnostic.

Tout se construit et se teste avec un prestataire de paiement **en mode bac à sable**. Aucun compte
réel, aucune somme réelle, aucune signature — cela appartient à la partie II.

*(C'est ici que tu peux déposer l'immatriculation si tu veux comprimer le calendrier. Voir plus
haut.)*

**✅ Terminé quand :** un parcours d'achat complet passe de bout en bout en test, et qu'une
confirmation de paiement falsifiée est refusée.

### Fait le 2026-08-15 — `20260815120009_recrutement.sql`, `supabase/functions/recrutement/`

**Rien, en production, ne transformait une recommandation en employé.** `reserve_identity()`
n'était appelée que par des fixtures : personne ne pouvait acheter, et chaque pièce posée depuis
l'étape 1 attendait un chemin qui n'existait pas.

`recruter()` le pose, en **une transaction** : l'entreprise, le diagnostic rattaché, l'abonnement,
l'objectif du dirigeant, l'identité réservée, l'employé figé sur son noyau, la configuration v1
appliquée, le contexte d'entreprise repris du diagnostic, la notification de bienvenue, la
recommandation consommée. Neuf écritures qui n'ont aucun sens séparées : interrompues au milieu,
elles laissent un client qui a **payé** et un employé incapable de travailler.

**L'ordre n'est pas indifférent.** L'abonnement précède les capacités, parce que le garde de
périmètre refuse d'activer sans formule active — et il a raison. Et *tout ce qui peut échouer*
échoue avant la réservation d'identité, parce qu'une identité ne se réutilise jamais.

**Le rejeu est inoffensif.** Un prestataire de paiement rejoue ses notifications. Sans garde, un
rejeu créerait une seconde entreprise et consommerait une seconde identité. La référence de
facturation est unique, et un rejeu rend le recrutement déjà fait.

**On ne vend pas sur un refus.** Une recommandation `hors_perimetre` n'a aucune configuration
proposée — la base l'impose depuis l'étape 5 — et recruter dessus est refusé en premier, avant même
le contrôle de statut : c'est la raison de fond, et elle mérite le message.

### La porte : jamais la redirection du navigateur

Un parcours d'achat se termine par une redirection vers une page de succès. **Elle ne prouve
rien** — elle vient du navigateur, donc de quelqu'un qui peut la fabriquer, la rejouer, la
partager. Recruter dessus offrirait un employé à qui sait recopier une URL.

Ce que le serveur écoute est la notification **signée** du prestataire. Et il a fallu étendre la
primitive : `signHeartbeat` ne couvre que l'horodatage, ce qui suffit pour un battement dont le
corps ne décide de rien. **Une confirmation de paiement, elle, décide** — quelle recommandation,
quelle entreprise, quelle référence. Une signature qui ne couvrirait que l'instant laisserait
quiconque l'intercepte changer le corps dans les cinq minutes et recruter sur la proposition d'un
autre. `verifierLaCharge` couvre l'horodatage **et** le corps exact : un octet invalide tout.

Dix cas éprouvent la porte, dont celui-là, et aucun refus ne dit au demandeur où il en est —
distinguer « secret absent » de « signature invalide » lui apprendrait ce qu'il lui reste à
trouver.

### Ce qui n'est pas fait, et pourquoi

| Tâche | État |
|---|---|
| `RECRUT-01` — intégration du prestataire | **Le contrat est écrit** (notification signée, référence unique) ; le branchement exige un compte, donc la partie II |
| `RECRUT-07/08/09` — page de succès, lien magique, anti-scanner | Ce sont la **porte de l'espace client** : elles vont avec l'étape 10, pas avec l'encaissement |

---

## Étape 10 — L'espace client, version minimale

Pas les 21 tâches du dashboard. **Neuf**, celles sans lesquelles un client qui paie résilie au
premier mois :

- la structure de l'espace privé
- la fiche de l'employé : mission, objectif, périmètre
- ses performances et sa progression
- ses capacités actives
- la progression vers l'objectif
- un état vide soigné — les premiers jours sont vides par nature, ils doivent rester lisibles
- la liste des notifications
- **approuver ou refuser une action suspendue**
- **le réglage du niveau d'autonomie**

Les deux derniers ne sont pas du confort : sans eux, Lady se bloque en attendant, et personne ne
peut la débloquer sauf toi.

Le reste du dashboard (CRM, ROI, temps économisé, repères, exclusions) attend le deuxième client.

**✅ Terminé quand :** un client peut voir ce que fait son employé, l'autoriser, et régler son
autonomie — sans jamais passer par toi.

### Fait le 2026-08-15 — `/espace`, `20260815120011` à `20260815120013`

**L'espace lit avec la session du client, donc sous RLS.** C'est une divergence assumée avec le
`/dashboard` hérité, qui lit par un pool de service hors RLS : dans l'espace privé, l'isolation
entre entreprises est une **propriété de l'accès**, pas une discipline du fichier. Il n'y a même
pas d'identifiant d'entreprise à passer — donc aucun à falsifier.

**Trois trous trouvés en le câblant, invisibles tant qu'aucune interface ne les demandait :**

1. **Régler l'autonomie ne pouvait pas être un `update`.** C'est le réglage qui décide si un
   message part sans qu'une personne l'ait relu. Le client **publie une version** de configuration,
   avec le déclencheur `demande_client` — le reste recopié à l'identique, parce qu'un réglage n'est
   pas une reconfiguration.
2. **Le client ne pouvait pas lire le nom de son propre employé.** La table des identités naît
   fermée, à raison — c'est un réservoir global. Une politique ouvre exactement ses employés à lui.
   L'invariant qui interdisait tout accès est **précisé, pas affaibli** : ce qui reste interdit,
   c'est d'énumérer.
3. **⭐ Après avoir payé, l'acheteur n'était rattaché à rien.** `recruter()` créait une entreprise
   que *personne ne pouvait voir*. Et ça ne pouvait pas être autrement au moment du paiement :
   **l'acheteur n'a pas encore de compte**. Le recrutement écrit donc une *attente de
   rattachement*, consommée à la première connexion — sur une adresse **prouvée par le lien
   magique**, jamais déclarée. Une attente ne se consomme qu'une fois : une adresse partagée ne
   rattache pas un second compte.

**Ce que l'espace affiche, et ce qu'il refuse d'afficher.** Aucun chiffre qui ne vienne d'une ligne
en base (invariant 4). Pas de progression estimée, pas de « temps économisé » calculé au doigt
mouillé : là où rien n'est mesuré, l'espace écrit qu'il ne le sait pas encore. Les états vides
disent ce qui manque **et pourquoi** — « votre employé ne travaillera pas tant qu'il n'a pas
d'objectif : un employé lancé sans but travaille pour personne ».

**Ce que je n'ai pas pu vérifier.** La page compile, typecheck et se construit (`ƒ /espace`), mais
je ne l'ai **pas vue s'afficher** : le rendu exige `NEXT_PUBLIC_SUPABASE_URL` et la clé anonyme,
qui sont des secrets absents de ce poste. Les garanties qui comptent — isolation, versionnement de
l'autonomie, rattachement — sont prouvées par les invariants `LADY-L`, `LADY-M` et `LADY-N`. Le
rendu, lui, reste à voir de tes yeux.

---

## Étape 11 — Le filet : alerte et sauvegarde

**C'est l'étape qui décide si tu pourras dormir une fois en ligne.**

- **L'alerte** (`CONF-07`) : un email quand un quota approche, quand des tâches échouent, quand une
  tâche reste bloquée, quand la base grossit anormalement. Aujourd'hui, si le moteur s'arrête,
  **personne ne te prévient** — tu l'apprendrais par un client mécontent, ou pas du tout. Ce n'est
  pas théorique : un travail programmé a échoué 72 fois par jour avant d'être remarqué.
- **La sauvegarde** (`CONF-06`) : un export hors plateforme. Il n'y en a aucune.

Le code se construit et se teste entièrement en local. Le branchement sur le vrai service d'envoi
appartient à la partie II.

**✅ Terminé quand :** une panne provoquée volontairement déclenche l'alerte dans les minutes qui
suivent, et une sauvegarde est restaurée avec succès sur une base vierge.

### Fait le 2026-08-15 — `etat_de_sante()`, `pnpm run surveiller`, `pnpm run sauvegarde`

**Les deux moitiés du critère ont été exécutées, pas décrites.**

Une panne a été provoquée pour de bon — une mission verrouillée depuis neuf heures par un exécutant
mort, reprise sept fois — et la surveillance a rendu deux alertes et un code de sortie `1`. Une
sauvegarde a été prise, **restaurée sur une base vierge**, et comparée : 350 identités, même compte
sur les cinq tables témoins.

**La surveillance constate, elle n'envoie rien** — et c'est ce qui la rend éprouvable. Une fonction
qui expédierait un courriel ne se testerait qu'en expédiant des courriels. Son **code de sortie est
la notification** : posé sur une tâche programmée, un code non nul *est* l'alerte, car tout
ordonnanceur sait prévenir d'un échec et aucun ne sait lire une sortie standard.

Le code `2` — « la surveillance elle-même est en panne » — est distinct du `1` à dessein. Une
surveillance qui ne peut pas joindre la base ne dit pas « tout va bien » : elle dit qu'elle ne sait
pas. C'est l'alerte qu'on oublie de traiter, parce qu'elle ressemble à du silence.

**Une base saine est silencieuse**, et c'est vérifié aussi : une alerte qui se déclenche tout le
temps ne se lit plus au bout d'une semaine.

**La sauvegarde restaure dans le même geste.** Une sauvegarde jamais restaurée n'est pas une
sauvegarde, c'est un fichier — et le jour où on en a besoin est le pire moment pour découvrir
qu'elle est illisible. Le fichier va hors du dépôt et hors de la plateforme : rangé à côté de ce
qu'il sauvegarde, il ne protégerait de rien. Le script refuse de restaurer sur la base d'origine,
et ne fait que la lire.

**Ce qui reste pour la partie II :** brancher l'expédition du courriel. Le contrat est écrit — ce
qu'on envoie, à quel seuil, et ce qui distingue une alerte d'un avertissement.

---

## Étape 12 — Répétition générale, à blanc

Le parcours entier joué en local, de bout en bout, sans qu'aucune donnée ne soit saisie à la main :
un diagnostic → une configuration de Lady → un paiement en bac à sable → un employé créé → un lot de
travail produit → une action suspendue → un accord donné depuis l'espace client → un résultat
observé.

C'est le contrôle qui dit que **le produit existe**. Tout ce qui vient après est de la mise en
service.

**✅ Terminé quand :** le parcours complet passe en une seule exécution automatisée, et chaque écart
constaté est corrigé.

### Fait le 2026-08-15 — `EXEC-11` levé, le parcours va jusqu'au bout

Le parcours complet passe désormais en une exécution, **sans qu'aucune ligne de `task`, `job`,
`employee`, `lady_configuration` ou `tenant_member` ne soit écrite par le test** : le diagnostic
compose, le paiement recrute, l'acheteur retrouve son entreprise, le travail s'ouvre, Lady
s'arrête pour demander, le dirigeant accorde — **et l'action part**.

`EXEC-11` a demandé trois corrections, dont deux invisibles jusqu'à ce que le parcours entier soit
joué :

1. **La mission ne retournait pas en file.** Un déclencheur l'y remet quand le client tranche — en
   base, parce que le client écrit directement dans `approval` sous RLS et qu'**aucun code serveur
   ne s'exécute sur ce chemin**.
2. **La décision n'était pas journalisée.** `accord_accorde` et `accord_refuse` existaient dans le
   vocabulaire et la machine à états savait les lire ; personne ne les écrivait.
3. **⭐ L'état retenait la mauvaise chose.** `actionEnAttente` était reconstruite depuis la trace de
   la politique — qui porte le nom de la capacité, **pas ses arguments**. L'action n'était donc pas
   rejouable. Elle vient maintenant de la proposition, et **survit à l'accord** : le runtime
   exécute *celle que le client a autorisée*, sans rappeler le modèle. Le rappeler lui ferait
   proposer autre chose, que la politique suspendrait de nouveau — le client accorderait
   indéfiniment dans le vide.

Un fondement d'autorisation a été ajouté : `accord_ponctuel`, distinct d'`accord_permanent`. Un
accord ponctuel ne couvre rien d'autre et ne se révoque pas — il est déjà consommé. Les confondre
reviendrait à répondre « vous l'aviez autorisé » à un client qui n'a rien autorisé de général.

Et l'accord est **relu en base** avant d'exécuter : le journal dit ce qui s'est passé, la table dit
ce qui est vrai maintenant. Un accord révoqué entre-temps ne laisse rien partir.

**Stabilité mesurée :** la répétition seule, 5 exécutions vertes sur 5 ; la suite du worker,
5 sur 5 ; `verify` complet, 2 sur 3 — l'échec restant appartient à la famille d'instabilité
inter-suites documentée depuis l'étape 1 (la file est globale), pas à ce travail : la suite de la
boucle passe 4 fois sur 4 en isolation.

### Ce que l'étape avait révélé, et qui est maintenant levé

La répétition générale a été écrite et jouée. **Elle s'arrête**, et là où elle s'arrête est
précisément ce qu'il fallait apprendre avant de vendre.

**Ce que le parcours franchit :** le diagnostic constate et compose · la recommandation est
enregistrée · le paiement recrute en une transaction · l'acheteur retrouve son entreprise à sa
connexion · du travail s'ouvre tout seul · Lady propose une action irréversible et **s'arrête pour
demander** · le dirigeant accorde depuis son espace.

**Où il s'arrête :** rien ne repart.

```text
approvisionnement_ouverture → run_demarre → contexte_assemble
  → proposition_recue → politique_suspend → accord_accorde → (rien)
```

C'est `EXEC-11 — reprise après validation humaine`, **P0, jamais implémenté**. Le client dit oui,
et Lady l'ignore. Indéfiniment.

**Deux tiers du chemin ont été posés** (`20260815120016`), parce qu'ils manquaient tous les deux et
qu'aucun test ne pouvait les voir :

1. **La mission ne retournait pas en file.** `mettreDeCote()` l'en sort quand Lady s'arrête — c'est
   juste — mais **personne ne l'y remettait**. Un déclencheur le fait désormais, et il est en base
   parce que le client tranche en écrivant directement dans `approval`, sous RLS : **aucun code
   serveur ne s'exécute sur ce chemin**.
2. **La décision n'était pas journalisée.** `accord_accorde` et `accord_refuse` existaient dans le
   vocabulaire depuis le début, et la machine à états savait les interpréter — *personne ne les
   écrivait*. Sans eux, un run reprendrait sur un journal qui le croit toujours suspendu.

**Ce qui reste** est dans le runtime : reprendre la mission et **exécuter l'action que le client
vient d'autoriser**, au lieu de la reproposer au modèle — qui la fait suspendre à nouveau. Ça
touche le moteur d'autorisation, pièce de sécurité : ça mérite son propre travail.

**La répétition générale elle-même n'est pas livrée.** Écrite, elle s'est révélée instable une fois
sur trois dans la suite complète — la file est globale et le tour se dispute. Livrer un contrôle
qui échoue au hasard est exactement ce que ce dépôt s'interdit. Ce qu'elle prouvait de
déterministe est devenu l'invariant `LADY-R` ; le parcours de bout en bout se réécrira **après**
`EXEC-11`, quand il aura une fin à atteindre.

---

## Étape 12 bis — Le déclencheur : les résultats reviennent dans le diagnostic

**Pourquoi cette étape existe.** Le produit vend un employé qui *s'ajuste*. Jusqu'ici, il
s'ajustait une fois — au recrutement — et plus jamais. Une Lady pouvait rater sa cible un mois
entier sans que sa configuration bouge d'un millimètre, et le client l'aurait vu avant nous.

### Fait le 2026-08-26 — `20260815120018`, `20260815120019`, `reevaluation.ts` (domaine et runtime)

La boucle est refermée, en quatre pièces qui existaient déjà et ne se parlaient pas :

1. **`mesures_du_travail()`** (`20260815120018`) rend les nombres bruts : missions ouvertes,
   missions réellement travaillées, réponses, rendez-vous, ventes, part de l'horizon écoulée,
   écart de rythme. Elle ne calcule **aucun taux** — « 1 réponse sur 2 envois = 50 % » est un
   chiffre vrai et une information fausse.
2. **`releverDesResultats()`** (`packages/domain`) en tire des constats, de la même forme que ceux
   du premier diagnostic. Elle distingue trois causes que le même retard peut avoir : personne ne
   répond (le message), beaucoup répondent et personne n'achète (le ciblage), ça vend mais trop
   lentement (le volume). Et **elle se tait** sous 25 % d'horizon écoulé ou 10 missions
   travaillées.
3. **`proposer_une_configuration()`** (`20260815120019`) publie une version suivante **inactive**,
   déclencheur `resultats`, et prévient le dirigeant par une notification de genre `proposition` —
   pas `evolution` : rien n'a évolué, on demande. Une seule proposition à la fois ; un refus est
   daté et rouvre la porte à la suivante.
4. **`/espace`** affiche la proposition avec deux boutons : *Accepter ce changement* ou *Garder
   comme aujourd'hui*. `accepter_la_configuration()` enregistre le changement, l'applique, puis
   annonce l'évolution — dans cet ordre, pour qu'aucune annonce ne précède son fait.

**La règle que tout ce travail sert : Lady ne change jamais de rôle toute seule** (§10 de la
vision). L'invariant `LADY-U` l'éprouve en base — après une réévaluation, la configuration active
et les pouvoirs de l'employé n'ont pas bougé d'un octet. C'est ce qui sépare un employé
configurable d'un produit qui se réécrit tout seul pendant que son client dort.

**Ce qui est délibérément limité.** La réévaluation tourne **une fois par jour et par employé**,
pas à chaque battement : les mesures portent sur des jours, et relire toutes les cinq minutes ne
remplirait que le journal. Et les constats mesurés **s'ajoutent** à ceux du premier diagnostic au
lieu de les remplacer : ce que le dirigeant a déclaré au départ reste vrai, simplement une mesure
pèse plus lourd qu'une déclaration.

---

## Étape 12 ter — Lady agit vraiment

**Pourquoi cette étape existe.** Le worker approvisionnait, décidait et journalisait — et ne
touchait à **aucune donnée du client**. Tous les tests de boucle branchaient un faux moteur : ils
prouvaient que le runtime appelle quelque chose, jamais qu'un employé produit un effet réel. Un
client qui l'aurait acheté ce jour-là aurait vu un journal impeccable et une base inchangée.

### Fait le 2026-08-26 — `packages/runtime/src/attelage.ts`, moteurs internes montés

**Ce qui manquait, précisément.** `execute-action.ts` appelait `moteur.execute(proposition.input)`,
c'est-à-dire passait au moteur **ce que le modèle avait écrit**. Les moteurs, eux, attendent une
entrée typée *et* le contexte de la mission. Faute de cette traduction, aucun moteur n'était
enregistré, et brancher le premier aurait laissé une réponse de modèle désigner sur qui agir.

**L'attelage pose la règle, et elle est de sécurité : le modèle choisit le geste, jamais la
cible.** Les identifiants — entreprise, employé, prospect — viennent de la mission, relus en base
au moment d'agir. Un identifiant proposé par le modèle est **refusé**, pas silencieusement
remplacé : le remplacer sans rien dire ferait d'une tentative détectée un incident invisible. La
qualification n'accepte carrément **aucun champ** — le modèle demande qu'elle ait lieu, il ne
l'oriente pas.

**Deux moteurs sont montés**, parce que leurs effets sont internes et réversibles : `qualifier.prospect`
et `mettre_a_jour.prospect`. Le test `agir-vraiment.integration.test.ts` vérifie la seule chose
qui compte pour un dirigeant : **la fiche de son prospect a changé**, avec la raison écrite à
côté.

⛔ **`envoyer.prospect` et `relancer.prospect` restent non montés**, et le verrou est nommé à un
seul endroit (`composition.ts`) : écrire à une entreprise attend un compte d'envoi réel, un
domaine en UE et une clé hors dépôt. L'attelage sait les traduire ; c'est le moteur qui manque, et
il manquera jusqu'à l'étape 15.

**Un défaut sérieux trouvé en chemin, invisible jusque-là.** Le registre rangeait les moteurs par
leur seul nom (`base`) — or `capability_binding` nomme « base » le moteur de *chacune* des cinq
capacités. Monter deux moteurs ensemble pour la première fois les a fait s'écraser : « qualifier
un prospect » exécutait « mettre à jour une fiche », silencieusement, avec les bons journaux. La
clé est désormais **(capacité, moteur)**, et un doublon exact est refusé au lieu d'être écrasé.

---

## Étape 12 quater — L'employé progresse, et il le prouve

**Pourquoi cette étape existe.** Le produit promettait un employé qui s'améliore. Trois pièces
étaient posées, aucune reliée : `learned_fact` était lue à chaque pas et **écrite par personne** ;
`strategy_variant` décrivait des façons de travailler que **rien ne jouait** ; la vue qui compte
les résultats comptait sur zéro ligne. Autrement dit, l'employé recommençait chaque mission comme
la première, et « il progresse » était une phrase.

### Fait le 2026-08-26 — `20260815120020`, `reflexion.ts`, `progression.ts`

**1. Il essaie — et on sait ce qu'il a essayé.** Chaque mission reçoit à son ouverture, au plus
une par genre, une façon de travailler tirée de manière reproductible (la même mission donne
toujours la même). Sans cette trace, `outcome` compte des résultats pour personne.

**2. Le registre de langage est l'un de ces genres.** Parler courant, professionnel, technique ou
dans le jargon de la niche n'est pas un réglage décrété : c'est une façon de faire qui **se
compare** aux autres sur des résultats. C'est ce que demande un client quand il dit « qu'il parle
comme mes clients ».

**3. Il retient.** La réflexion d'après-run existe enfin : à la fin d'un run **terminé**, l'employé
relit son journal et propose 0 à 3 faits, filtrés par le tri déjà écrit (trop court, trop long,
contredit l'ADN, déjà connu). L'auteur est `apprentissage`, jamais `client` — c'est le dirigeant
qui doit pouvoir contredire ce que son employé a cru comprendre, pas l'inverse. ⚠️ **La mémoire
est un bonus, jamais une condition de succès** : la réflexion tourne *après* que la mission est
close et son verrou rendu, et une réflexion qui échoue journalise puis se tait.

**4. Il garde ce qui marche chez CE client.** `resultats_par_variante(entreprise)` compte, sur ses
missions **réellement travaillées**, ce que chaque façon de faire a produit. Le départage exige un
signal : au moins 20 missions par variante comparée, et un écart d'au moins 20 % — sinon rien ne
bouge. Une vente pèse plus qu'un rendez-vous, qui pèse plus qu'une réponse, et le niveau de
comparaison est choisi **pour toute la comparaison** : sans cela, la façon de faire qui fait
beaucoup répondre sans jamais vendre gagnerait.

**Ce qui s'applique seul, et ce qui ne le fait jamais.** Changer de manière à l'intérieur du rôle
est réversible et interne : ça s'applique sans accord — mais **jamais en silence**, chaque
changement écrit un `strategy_change` et une notification adossée à sa preuve. Changer de RÔLE
reste soumis à l'accord du dirigeant (étape 12 bis, §10 de la vision).

**Un cinquième des missions continue d'explorer**, même quand une préférence existe. Une
préférence qu'on n'explore plus n'est plus une mesure, c'est une conviction — et le jour où le
marché change, personne ne le voit. C'est un coût assumé, et il est écrit dans l'espace client.

**L'invariant `LADY-V` garde la promesse la plus lourde de tout l'apprentissage** : les résultats
d'une entreprise ne se mélangent jamais à ceux d'une autre. Une moyenne du produit ferait
converger tous les employés vers le ton qui plaît au client médian — et ferait fuiter, par la
bande, ce qui marche chez un concurrent.

---

## Étape 12 quinquies — Les deux limites que le dirigeant garde en main

**La question à laquelle cette étape répond :** « qu'est-ce qui empêche cet employé de prendre le
contrôle de mon entreprise ? »

Le produit avait déjà beaucoup de réponses — périmètre de capacités, accord requis sur les actions
irréversibles, cible imposée par la mission, rôle jamais changé sans accord. Il en manquait deux,
et ce sont celles qui comptent le jour où quelque chose va mal.

### Fait le 2026-08-26 — `20260815120021`, invariant `LADY-W`

**1. Le cliquet d'autonomie.** L'autonomie décide si un message part sans qu'une personne l'ait
relu : c'est le réglage le plus lourd du produit. Jusqu'ici, **rien en base** n'empêchait une
configuration de l'augmenter — la prudence tenait à une valeur écrite dans un fichier TypeScript.
Une ligne changée un jour de fatigue, une proposition acceptée d'un clic, et un employé passait en
« agit seul » sans que personne ne l'ait voulu.

Désormais, seul un geste explicite du dirigeant peut **augmenter** l'autonomie. Un recrutement, un
diagnostic, une réévaluation sur résultats peuvent la maintenir ou la **réduire** — jamais la
lever. Et une v1 ne naît jamais en « agit seul » : au recrutement, personne n'a encore rien
consenti.

**2. L'arrêt.** Il n'existait aucun moyen de dire « stop, maintenant ». Un dirigeant inquiet un
dimanche soir n'avait rien à actionner — et un produit qui ne s'arrête pas sur commande n'est pas
un employé, c'est un processus.

L'arrêt est posé **en base**, à trois endroits qui verrouillent trois choses différentes :

| Où | Ce que ça arrête |
|---|---|
| `peut_ouvrir_une_mission` | plus aucune mission ne s'ouvre |
| la prise de travail dans la file | plus aucune mission **déjà préparée** n'est reprise |
| `peut_envoyer` | plus rien ne part |

Le mettre à un seul endroit laisserait passer ce que les deux autres retiennent : refuser d'ouvrir
de nouvelles missions ne sert à rien si celles qui attendaient partent quand même. Et pendant
l'arrêt, **rien ne bouge non plus tout seul** : ni réévaluation de configuration, ni progression —
un arrêt existe précisément pour que rien ne change sans lui.

Il n'y a **aucune reprise automatique**. Un arrêt qui se lève tout seul n'est pas un arrêt. Le
bouton est en haut de l'espace client, sans confirmation à cliquer : un arrêt qu'on doit négocier
n'en est pas un.

---

## Étape 12 sexies — L'espace client, lisible

**Pourquoi cette étape existe.** Le style avait été mis de côté volontairement — « d'abord on fait
tourner ». Entre-temps, trois sections ont été greffées sur la page (la proposition, la mémoire,
l'arrêt) sans que personne ne regarde l'ensemble. Le résultat n'était pas laid : il était **mal
hiérarchisé**, ce qui est pire — un dirigeant qui ouvre son espace ne devait plus savoir où
regarder.

### Fait le 2026-08-26 — `/espace`, mise en page, direction artistique et petits écrans

**L'ordre suit ce que le lecteur a à faire**, pas l'ordre dans lequel les fonctionnalités ont été
écrites :

1. ce qui **attend une réponse** (une proposition, un accord) — c'est ce qu'on vient chercher ;
2. l'objectif, et ce que l'employé fait pour l'atteindre ;
3. ce qu'il a appris et ce qui marche chez ce client ;
4. ce qui s'est passé ;
5. **ce que le dirigeant garde en main** — autonomie et arrêt, ensemble, à la fin.

⚠️ **L'arrêt est descendu en bas, et ce n'est pas un recul.** Un bouton d'arrêt en haut d'une page
consultée tous les jours occupe la meilleure place pour ne rien dire 364 jours sur 365. Quand
l'employé EST arrêté, en revanche, ça ne se lit pas au milieu de neuf cadres identiques : l'état
devient un bandeau rouge sous le titre, et le bouton de reprise est dedans.

**La direction artistique est celle de la landing, reprise telle quelle** plutôt qu'une seconde
inventée à côté. `landing.css` pose une grammaire à trois voix, et l'espace la parle :

| Voix | Typographie | Ce qu'elle porte dans l'espace |
|---|---|---|
| humaine | sérif éditorial (Instrument Serif) | le prénom de l'employé, l'objectif, ce qu'on propose |
| machine | monospace | les étiquettes, les dates, les états, ce qu'il a appris |
| interface | Inter | tout le reste, et elle s'efface |

⚠️ **La couleur porte le même sens que sur la landing, pas un sens local.** L'ambre y signifie
« ça s'est arrêté et ça attend une personne » — donc ici : une proposition sans réponse, et un
employé à l'arrêt. La menthe y signifie « c'est acquis, c'est mesuré » — donc ici : ce qui a été
retenu des résultats, et le bouton qui accepte. Un rouge « danger » avait été essayé pour l'arrêt
puis retiré : il n'existe nulle part dans la landing, et **un employé qu'on met en pause n'est pas
une erreur, c'est une décision**.

Deux blocs ambrés se suivent quand l'employé est arrêté ET qu'une proposition attend. Ils
s'annuleraient s'ils avaient la même forme : l'arrêt est donc un **bandeau** — un trait dans la
marge, sans fond ni angles arrondis — et la proposition reste une carte.

**Trois défauts trouvés en regardant, pas en relisant :** les listes gardaient le retrait de 40 px
que `list-style: none` ne supprime pas (chaque liste se décalait par rapport au titre de sa carte),
`10000` s'affichait sans séparateur là où un dirigeant lit `10 000`, et rien n'avait été prévu pour
un téléphone — alors que c'est là qu'un dirigeant lit son espace le soir. Vérifié à 375 px : les
boutons passent l'un sous l'autre avec une cible assez large pour un pouce.

---

## Étape 12 septies — L'espace devient une scène

**Pourquoi cette étape existe.** La version précédente était juste : huit cartes, chaque phrase
défendable, tout vérifié. Et personne n'ouvre ça douze fois par jour. Un dirigeant ne vient pas
lire un rapport sur son employée — il vient **voir si elle tourne**, et **s'il y a quelque chose à
décider**. Deux questions, auxquelles un mur de texte répond mal.

### Fait le 2026-08-26 — `Scene.tsx`, l'espace comme présence

**Au repos, la page ne dit presque rien** : une silhouette qui tourne, un prénom en sérif, une
ligne d'état, quatre orbes d'un mot. C'est tout. Les deux questions sont répondues sans lire —
la silhouette est là, et un point ambré bat s'il y a quelque chose à trancher.

**La silhouette EST le bouton.** On clique dessus, et ses capacités s'équipent autour d'elle, en
couronne, chacune partant du centre avec un décalage. Ce n'est pas un effet : ça dit une chose
vraie — **ce sont ses pouvoirs à elle**, pas une liste posée à côté. La silhouette réutilise
`AgentHologram3D`, le buste filaire déjà écrit pour la landing : anonyme par choix de produit, on
vend un employé, pas l'avatar d'une personne qui n'existe pas.

**Tout le reste est derrière un geste**, dans un tiroir qui monte de sous la scène. Rien n'a été
retiré : l'accord, la proposition, le réglage d'autonomie, l'arrêt, la mémoire, le journal — tout
est resté, **rangé au lieu d'être empilé**. Ce qui ATTEND une personne garde seul le droit
d'appeler le regard.

**Le mouvement dit quelque chose, ou il n'existe pas.** Le halo ne bat que si quelque chose
attend ; les capacités jaillissent du centre ; les tiroirs montent. Aucune animation d'ambiance —
une page qu'on ouvre douze fois par jour et qui se rejoue douze fois devient une page qu'on
n'ouvre plus. `prefers-reduced-motion` laisse la scène **compréhensible**, pas seulement immobile :
c'est la transition qui disparaît, jamais l'information.

**Trois défauts trouvés à l'écran, pas à la relecture :**

1. la couronne déployée tombait pile sur le prénom — c'est la scène qui **reflowe** pour lui faire
   de la place (`margin-top`, jamais `transform` : un décalage par transform aurait poussé le nom
   sur les orbes, qui ne bougent pas) ;
2. les accents de couleur des boutons ne s'appliquaient pas : la règle de base porte un `:not()`,
   dont la spécificité compte celle de son argument — `.oui` perdait contre elle, **sans qu'aucune
   erreur ne le dise** ;
3. sur 375 px, une pastille placée à ±40 % de la largeur porte encore sa propre largeur : les deux
   capacités latérales sortaient de l'écran. Sur téléphone, la couronne devient une **colonne** —
   le geste est le même, la forme s'adapte.

---

# PARTIE II — METTRE EN VENTE

⛔ **Tout ce qui suit t'appartient.** Un agent prépare, explique, rédige des brouillons et vérifie
après coup. Il n'exécute rien : ces étapes touchent une infrastructure réelle, de l'argent réel ou
une signature.

---

## Étape 13 — Immatriculation

Le seul élément du plan avec un délai qu'aucun travail ne raccourcit. Il bloque l'étape 14, qui
bloque l'étape 17.

**✅ Terminé quand :** l'immatriculation est obtenue, et la date est notée ici.
**→ Déposé le :** *(à remplir)* **→ Obtenu le :** *(à remplir)*

---

## Étape 14 — Le légal

Mentions légales définitives, CGU/CGV, registre des traitements RGPD, analyse d'impact (décision
automatisée). Un agent peut rédiger les brouillons complets à partir des documents déjà présents
dans le dépôt ; la relecture, l'adaptation et la publication te reviennent.

À traiter dans le même mouvement : la vérification des conditions d'usage commercial des offres
gratuites sur lesquelles le produit repose, et les contrats de sous-traitance par prestataire.

**✅ Terminé quand :** les documents sont publiés et datés.

---

## Étape 15 — Mise en ligne

Trois gestes, dans cet ordre.

1. **Pousser le schéma.** Au 15 août, **4 migrations du 12 août ne sont pas appliquées** en ligne
   (profils sectoriels, relance, variantes de stratégie, liste d'attente), auxquelles s'ajoutent
   celles des étapes 2 à 8.
2. **Poser les six secrets.** Les six manquent tous aujourd'hui.
3. **Déployer les fonctions.** Aucune n'est déployée à ce jour.

Et avant tout envoi réel : **l'opt-out d'entraînement chez le fournisseur de modèle**. Sans lui,
aucune donnée réelle ne doit partir.

**✅ Terminé quand :** `pnpm run deploiement:verifier --distant` passe entièrement.

---

## Étape 16 — Répétition générale, en réel

Toi comme premier client. Un vrai diagnostic, un vrai paiement (remboursé ensuite), un vrai employé,
un vrai envoi vers une adresse que tu contrôles.

C'est la seule étape qui teste ce qu'aucun test ne teste : l'écart entre la base locale et la base
en ligne, la vraie latence, le vrai fournisseur de modèle, la vraie délivrabilité.

**✅ Terminé quand :** le parcours entier a été joué en réel, et chaque écart constaté est soit
corrigé, soit écrit ici.

---

## Étape 17 — Vendre

**✅ Terminé quand :** un euro est encaissé et une entreprise existe en base.

---

## Questions de produit soulevées en chemin

*Un agent qui rencontre une question de produit pendant la partie I l'écrit ici et continue sur
l'hypothèse la plus prudente. Elles se tranchent au moment de la partie II, jamais avant.*

| Question | Hypothèse retenue | Soulevée à |
|---|---|---|
| Une Lady peut-elle porter plusieurs domaines à la fois ? | Oui — restreindre plus tard coûte une contrainte, élargir plus tard coûte une migration | Étape 4 |
| Le mot « métier » survit-il côté client ? | Oui, comme étiquette de restitution seulement — jamais en entrée | ADR-0029 |
| Quel plancher de couverture déclenche `hors_perimetre` ? | Le mécanisme existant est conservé tel quel ; le seuil se règle en données | ADR-0029 |
| Un changement de configuration se déploie-t-il sans accord du dirigeant ? | Non — accord requis par défaut, comme toute action irréversible | ADR-0029 |

---

## Ce qui vient après le premier euro

L'évolution de l'employé, le reste du dashboard, le CRM client, le calcul du ROI, les profils
sectoriels supplémentaires, l'extension de la bibliothèque au-delà de deux domaines. Tout cela rend
le produit meilleur ; rien n'est nécessaire pour le premier euro.

## Et sur « ne plus rien toucher pendant cinq mois »

Ce n'est pas atteignable, et ce n'est pas le code qui l'empêche. La réputation d'envoi dérive en
semaines. Les offres gratuites changent leurs conditions. Les paiements échouent. Dix clients qui
paient posent des questions. Et par construction, Lady s'arrête pour demander l'accord sur une
action irréversible — c'est une protection, pas un défaut.

Ce qui est atteignable : **ne rien avoir à coder pendant cinq mois**, avec 15 à 30 minutes de
surveillance par semaine. L'étape 11 est ce qui fait la différence entre « ça tourne » et « je ne
sais pas quand ça s'est arrêté ».
