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

### Les cinq règles, non négociables

1. **Une étape à la fois, dans l'ordre.** Aucune étape ne se saute, même si elle paraît facile.
   Un lot aval construit sur un lot amont incomplet produit du travail à refaire.
2. **Une étape est terminée quand son critère « ✅ Terminé quand » passe** — jamais sur une
   impression d'avancement. Si le critère ne passe pas, l'étape n'est pas finie.
3. **`pnpm run verify` doit être vert avant de cocher quoi que ce soit.** C'est la définition
   unique de « vérifié » ([`adr/0024`](adr/0024-verification-automatique.md)).
4. **Les étapes marquées ⛔ HUMAIN ne sont jamais faites par un agent.** Elles touchent une
   infrastructure réelle, de l'argent réel ou une signature. Un agent les prépare, les explique,
   et s'arrête.
5. **Toute découverte d'architecture se signale** — un manque structurel trouvé en écrivant du
   code se dit, il ne se contourne pas.

### Ce qu'un agent ne fait jamais sur ce projet

Pousser un schéma en ligne · poser un secret · déployer une fonction · toucher la base distante en
écriture · engager une dépense · signer quoi que ce soit · publier vers l'extérieur.

---

## Tableau de bord

| # | Étape | Qui | État |
|---|---|---|---|
| 0 | Décision d'ordre + démarrer l'immatriculation | ⛔ humain | ☐ |
| 1 | Rendre `verify` honnête | agent | ☐ |
| 2 | Séparer l'acte et l'objet dans les capacités | agent | ☐ |
| 3 | La couche mission, et la chaîne objectif → travail | agent | ☐ |
| 4 | La configuration de Lady, versionnée | agent | ☐ |
| 5 | Le noyau perd le métier ; la recommandation vise une configuration | agent | ☐ |
| 6 | Les constats d'audit et le moteur de composition | agent | ☐ |
| 7 | Le runtime fabrique le travail à partir des missions | agent | ☐ |
| 8 | Un deuxième domaine dans la bibliothèque | agent | ☐ |
| 9 | Pouvoir encaisser | agent | ☐ |
| 10 | L'espace client, version minimale | agent | ☐ |
| 11 | Le filet : alerte et sauvegarde | agent | ☐ |
| 12 | Mise en ligne | ⛔ humain | ☐ |
| 13 | Mentions légales et CGV définitives | ⛔ humain | ☐ |
| 14 | Répétition générale, en réel | mixte | ☐ |
| 15 | Vendre | ⛔ humain | ☐ |

---

# Étape 0 — Décision d'ordre, et démarrer l'immatriculation ⛔ HUMAIN

**Deux gestes, le même jour.**

### 0.1 — Trancher l'ordre

La question : **basculer vers Lady avant de vendre, ou vendre d'abord avec le commercial existant ?**

Ce plan est écrit sur la première réponse. La raison est factuelle : au 15 août 2026, la base en
ligne contient **zéro entreprise, zéro employé, zéro diagnostic**. Réorganiser le schéma maintenant
ne demande de convertir aucune donnée de client. La même opération avec trente entreprises coûte
dix fois plus, et se fait sous contrainte de service.

*Si tu choisis l'autre ordre :* les étapes 2 à 8 passent après l'étape 15, et le premier client est
vendu sur un employé commercial figé. Tout le reste du plan est inchangé — mais la dette est réelle
et il faudra la payer avec des clients en production.

**✅ Terminé quand :** la réponse est écrite dans ce fichier, à cette ligne.
**→ Décision :** *(à remplir)*

### 0.2 — Démarrer l'immatriculation

C'est le seul élément du plan avec un **délai administratif** que rien n'accélère. Il bloque
l'étape 13 (mentions légales et CGV définitives), qui bloque l'étape 15 (vendre). Lancé aujourd'hui,
il court en parallèle de tout le reste et ne sera jamais le chemin critique. Lancé au moment de
vendre, il l'est.

**✅ Terminé quand :** le dossier est déposé et la date de dépôt est notée ici.
**→ Déposé le :** *(à remplir)*

---

# Étape 1 — Rendre `verify` honnête

**Le problème, constaté le 2026-08-15.** `pnpm run verify` est vert alors que **152 tests
d'intégration sautent en silence** — 135 dans `apps/worker`, 17 dans `apps/vitrine`. Ils ne
s'exécutent que si `DATABASE_URL` est présente. La garde qui fait échouer bruyamment plutôt que
sauter (`SENTIO_REQUIRE_DB_TESTS=1`) existe, mais elle n'est posée que dans l'intégration continue.

En local, `verify` couvre donc un cinquième du moteur en affichant le même vert. Et il tourne avant
chaque `git push`.

**Ce qu'il faut faire.** Faire échouer `verify` quand la base manque, au lieu de sauter. Deux bases
séparées, comme la CI : `sentio_test` pour le cœur, `vitrine_test` pour la vitrine — les migrations
de la vitrine effacent le schéma du cœur si on les lance sur la même base.

**Pourquoi en premier.** Toutes les étapes suivantes seront validées par `verify`. Un contrôle qui
ment invalide tout ce qui vient après.

**✅ Terminé quand :** `pnpm run verify` sans base **échoue** avec un message explicite ; avec les
deux bases, il passe et `apps/worker` affiche 151 tests exécutés, pas 16.

---

# Étape 2 — Séparer l'acte et l'objet dans les capacités

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

# Étape 3 — La couche mission, et la chaîne objectif → travail

**Le trou, constaté dans le schéma.** `task` n'a aucun lien vers un objectif. `objective` n'a aucun
lien vers un employé ni une mission. Il n'y a donc rien entre « le dirigeant veut +5 000 €/mois » et
« une ligne dans `task` ». C'est la cause structurelle du symptôme connu : le moteur réveille ce qui
existe mais ne fabrique pas le travail.

Une mission : une composition ordonnée d'actes, un déclencheur, une condition de fin, une métrique.
Elle appartient à la configuration et se rattache à un objectif.

**✅ Terminé quand :** une tâche ne peut pas exister sans mission, une mission pas sans objectif —
et c'est la base qui le refuse, pas le code.

---

# Étape 4 — La configuration de Lady, versionnée

Deux tables : la configuration active, et l'historique de ses versions. Chaque version porte son
déclencheur, sa raison, le diagnostic qui l'a produite, la version précédente, et l'accord qui l'a
autorisée.

On doit pouvoir répondre : pourquoi Lady a changé, quand, ce qu'il y avait avant, quel diagnostic
l'a provoqué, quels résultats ont été observés, quelle politique l'a permis.

**Règle absolue :** une configuration ne peut que **retrancher** aux pouvoirs du noyau. Jamais en
ajouter. Cette garantie doit être mécanique — vérifiée par la base, pas par une relecture.

**✅ Terminé quand :** un test prouve qu'une configuration tentant d'activer une capacité absente du
noyau est refusée par la base.

---

# Étape 5 — Le noyau perd le métier

`employee_definition` porte aujourd'hui `unique (profession, version)` : le métier est l'identité du
noyau. Il devient le **Lady Core** : capacités concevables, limites fondamentales, règles, version.

On conserve intégralement ce qui existe déjà et qui est juste : l'immuabilité par déclencheur, et le
figeage de chaque employé sur une version.

Dans le même mouvement, `recommendation` cesse de pointer vers un métier et pointe vers une
configuration.

**✅ Terminé quand :** le mot « profession » n'est plus une clé d'identité, les invariants de
schéma passent, et un employé existant reste attaché à sa version d'origine.

---

# Étape 6 — Les constats d'audit et le moteur de composition

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

# Étape 7 — Le runtime fabrique le travail

Le moteur dérive les tâches des missions au lieu de réveiller ce qui existe déjà. Et
`assembleContext` n'injecte que les capacités de la configuration active — jamais la bibliothèque
entière, sous peine de détruire le raisonnement du modèle.

**✅ Terminé quand :** un employé neuf, avec un objectif et une configuration, produit son premier
lot de travail sans qu'aucune tâche n'ait été créée à la main.

---

# Étape 8 — Un deuxième domaine dans la bibliothèque

Le minimum pour que le diagnostic ait un vrai choix : **la communication entrante**
(`accuser_reception`, `router`, `repondre`, `escalader`).

Tant qu'un seul domaine existe, la recommandation reste un théâtre à issue unique — le problème
qu'ADR-0007 avait déjà identifié en 2026-07-27, et qui revient tel quel si on l'oublie.

Chaque acte : un contrat, une classe d'effet, un moteur lié pour chaque formule vendable, un test.
Le déploiement échoue déjà tout seul si un acte n'a pas de moteur — ne pas contourner ce contrôle.

**✅ Terminé quand :** deux entreprises aux constats opposés reçoivent deux configurations
réellement différentes, et la différence s'explique par les constats.

---

# Étape 9 — Pouvoir encaisser

Les dix tâches `RECRUT-01` → `RECRUT-10`. Aujourd'hui, **personne ne peut acheter** — même si dix
dirigeants le voulaient.

L'enchaînement : paiement hébergé → confirmation **côté serveur** (jamais la redirection du
navigateur) → réservation d'une identité → création de l'employé sur une version figée → contexte
initialisé depuis le diagnostic → connexion par lien magique → rattachement au compte créé pendant
le diagnostic.

**✅ Terminé quand :** un parcours d'achat complet passe de bout en bout en test, et qu'une
confirmation de paiement falsifiée est refusée.

---

# Étape 10 — L'espace client, version minimale

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

Les deux derniers ne sont pas du confort : sans eux, Lady se bloque en t'attendant, et personne ne
peut la débloquer sauf toi.

Le reste du dashboard (CRM, ROI, temps économisé, repères, exclusions) attend le deuxième client.

**✅ Terminé quand :** un client peut voir ce que fait son employé, l'autoriser, et régler son
autonomie — sans jamais passer par toi.

---

# Étape 11 — Le filet : alerte et sauvegarde

**C'est l'étape qui décide si tu peux dormir.**

- **L'alerte** (`CONF-07`) : un email quand un quota approche, quand des tâches échouent, quand une
  tâche reste bloquée, quand la base grossit anormalement. Aujourd'hui, si le moteur s'arrête,
  **personne ne te prévient** — tu l'apprendrais par un client mécontent, ou pas du tout. Ce n'est
  pas théorique : un travail programmé a échoué 72 fois par jour avant d'être remarqué.
- **La sauvegarde** (`CONF-06`) : un export hors plateforme. Il n'y en a aucune.

**Ne pas repousser cette étape après le premier client.** Un incident invisible chez un client
payant coûte plus que les deux jours gagnés à la sauter.

**✅ Terminé quand :** une panne provoquée volontairement déclenche l'email dans les minutes qui
suivent, et une sauvegarde est restaurée avec succès sur une base vierge.

---

# Étape 12 — Mise en ligne ⛔ HUMAIN

Trois gestes, dans cet ordre. Un agent peut préparer, expliquer et vérifier après — jamais exécuter.

1. **Pousser le schéma.** Au 15 août, **4 migrations du 12 août ne sont pas appliquées** en ligne
   (profils sectoriels, relance, variantes de stratégie, liste d'attente), auxquelles s'ajouteront
   celles des étapes 2 à 8.
2. **Poser les six secrets.** Les six manquent tous aujourd'hui.
3. **Déployer les fonctions.** Aucune n'est déployée à ce jour.

Et avant tout envoi réel, **l'opt-out d'entraînement chez le fournisseur de modèle** — sans lui,
aucune donnée réelle ne doit partir.

**✅ Terminé quand :** `pnpm run deploiement:verifier --distant` passe entièrement.

---

# Étape 13 — Mentions légales et CGV définitives ⛔ HUMAIN

Dépend de l'immatriculation lancée à l'étape 0. Mentions légales, CGU/CGV, registre des
traitements, analyse d'impact.

**✅ Terminé quand :** les documents sont publiés et datés.

---

# Étape 14 — Répétition générale, en réel

Toi comme premier client. Un vrai diagnostic, un vrai paiement (remboursé), un vrai employé, un vrai
envoi vers une adresse que tu contrôles.

C'est la seule étape qui teste ce qu'aucun test ne teste : l'écart entre la base locale et la base
en ligne, la vraie latence, le vrai fournisseur de modèle, la vraie délivrabilité.

**✅ Terminé quand :** le parcours entier a été joué en réel, et chaque écart constaté est soit
corrigé, soit écrit ici.

---

# Étape 15 — Vendre ⛔ HUMAIN

**✅ Terminé quand :** un euro est encaissé et une entreprise existe en base.

---

## Ce qui vient juste après, et qu'on ne fait pas avant

L'évolution de l'employé, le reste du dashboard, le CRM client, le calcul du ROI, les profils
sectoriels supplémentaires, l'extension de la bibliothèque au-delà de deux domaines. Tout cela rend
le produit meilleur ; rien de tout cela n'est nécessaire pour le premier euro.

## Et sur « ne plus rien toucher pendant cinq mois »

Ce n'est pas atteignable, et ce n'est pas le code qui l'empêche. La réputation d'envoi dérive en
semaines. Les offres gratuites changent leurs conditions. Les paiements échouent. Dix clients qui
paient posent des questions. Et par construction, Lady s'arrête pour demander l'accord sur une
action irréversible — c'est une protection, pas un défaut.

Ce qui est atteignable : **ne rien avoir à coder pendant cinq mois**, avec 15 à 30 minutes de
surveillance par semaine. L'étape 11 est ce qui fait la différence entre « ça tourne » et « je ne
sais pas quand ça s'est arrêté ».
