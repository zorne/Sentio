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
| 2 | Séparer l'acte et l'objet dans les capacités | ☐ |
| 3 | La couche mission, et la chaîne objectif → travail | ☐ |
| 4 | La configuration de Lady, versionnée | ☐ |
| 5 | Le noyau perd le métier | ☐ |
| 6 | Les constats d'audit et le moteur de composition | ☐ |
| 7 | Le runtime fabrique le travail | ☐ |
| 8 | Un deuxième domaine dans la bibliothèque | ☐ |
| 9 | Pouvoir encaisser | ☐ |
| 10 | L'espace client, version minimale | ☐ |
| 11 | Le filet : alerte et sauvegarde | ☐ |
| 12 | Répétition générale, à blanc | ☐ |

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

**✅ Terminé quand :** les 35 invariants de schéma passent, `verify` est vert, et aucune clé de
capacité ne contient de nom d'objet.

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

**✅ Terminé quand :** une tâche ne peut pas exister sans mission, une mission pas sans objectif —
et c'est la base qui le refuse, pas le code.

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

---

## Étape 7 — Le runtime fabrique le travail

Le moteur dérive les tâches des missions au lieu de réveiller ce qui existe déjà. Et
`assembleContext` n'injecte que les capacités de la configuration active — jamais la bibliothèque
entière, sous peine de détruire le raisonnement du modèle.

**✅ Terminé quand :** un employé neuf, avec un objectif et une configuration, produit son premier
lot de travail sans qu'aucune tâche n'ait été créée à la main.

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
