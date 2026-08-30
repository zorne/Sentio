# Fermer le silence — les dix façons de tomber en panne sans le dire

> À lire si tu travailles sur : le battement, la surveillance, les alertes, le verdict, ou avant
> d'armer le planificateur. C'est le plan du lot en cours, et son critère de fin.

---

## Pourquoi ce document existe

Il a été écrit **au milieu du lot, pas à la fin**, et c'est le point.

Le plan de ce lot — les dix cas, l'ordre des étapes, ce que chacune doit prouver — n'existait que
dans un échange. Un agent arrivé sans contexte a repris le travail à l'étape 6 et n'a trouvé nulle
part ni la liste, ni les deux étapes restantes. Il s'est arrêté plutôt que de les fabriquer.

C'est exactement le défaut que ce lot combat, appliqué au travail lui-même : **une connaissance qui
ne vit que dans la mémoire de quelqu'un est une connaissance déjà perdue.** Le remède est le même
que partout ailleurs dans ce dépôt — l'écrire à l'endroit où on la cherchera.

---

## Le défaut de fond

Un produit qui promet « votre employée travaille chaque jour » a une défaillance pire que la
panne : **la panne muette**. Le client paie, rien ne se fait, et rien ne le dit.

Le constat qui a ouvert ce lot n'est pas une hypothèse de conception. C'est l'état exact de la
production au 2026-08-30 : le battement rendait `{traites: 10, echoues: 0}` alors que les dix
missions avaient été **reportées**. `traites` s'incrémentait dès qu'un pas ne levait pas
d'exception. Un run reporté comptait donc comme un succès.

Si le planificateur avait été armé, ce compte rendu rassurant et faux serait parti **144 fois par
jour** pendant que rien ne se faisait. C'est ce qui a justifié de ne pas l'armer.

---

## Les dix cas

Dix façons recensées de tomber en panne sans le dire. La colonne « destinataire » n'est pas
décorative : elle décide de qui doit être prévenu, et se tromper de destinataire est une manière
de se taire — un dirigeant à qui l'on demande de réparer ce qui n'est pas de son ressort apprend à
ignorer le canal.

| # | Défaillance | Destinataire |
|---|---|---|
| 1 | Un run échoue (`failed`) — journal seul, aucune notification | dirigeant si répété |
| 2 | Capacité activée sans moteur — `echec_definitif` silencieux | dirigeant |
| 3 | Travail écarté faute de capacité — journalisé depuis `451780c`, rien ne le lit | dirigeant |
| 4 | Modèle retiré par le fournisseur — réponses vides, aucune alerte | interne, urgent |
| 5 | Le battement ne part plus — rien du tout | interne, urgent |
| 6 | `TaskDeferred` — aucun fournisseur conforme, mission reportée indéfiniment | interne |
| 7 | Réévaluation muette (`trop_tot`, `hors_perimetre`, `deja_proposee`) | interne |
| 8 | Blocage `needs_attention` qui draine le vivier — `intervention_requise` existe, personne ne la lit | dirigeant |
| 9 | Deux gardes écrivent le même `politique_refuse` — « non activée » et « inconnue du registre » indiscernables | interne |
| 10 | La reprise absente — les missions bloquées restent exclues à jamais, l'exclusion du gisement portant sur tous les états | dirigeant |

⚠️ **Les cas 4 et 5 se sont déjà produits pour de vrai dans l'histoire de ce dépôt**, et aucun test
ne les couvrait au moment d'écrire ces lignes. Ce sont les deux qui portent la mention « urgent ».

---

## Les étapes du lot

Une étape à la fois, dans l'ordre. Chacune est un commit sur `noyau-lady`.

| Étape | Ce qu'elle ferme | Cas | État |
|---|---|---|---|
| 1 | Ne plus proposer au modèle ce qui ne peut pas s'appliquer (`b155519`) | 9 | ✅ |
| 2 | Un moteur qui manque est une attente, pas un échec (`48fb1a0`) | 2 | ✅ |
| 3 | Une mission mise de côté faute d'outil peut repartir (`620e06e`) | 3, 10 | ✅ |
| 4 | Un silence ne peut plus passer pour un succès (`e75f6df`) | 1, 6, 7 | ✅ |
| 5 | Un travail qui n'aboutit pas finit par se dire, et à la bonne personne (`564765f`) | 1, 8 | ✅ |
| 6 | Le workflow n'échoue que si c'est anormal | 4 | à faire |
| 7 | Trace de fraîcheur et guetteur externe | 5 | à faire |
| 8 | **La répétition générale du silence** | les dix | à faire |
| — | La documentation, en un seul geste | — | à faire |

### Étape 6 — Le workflow n'échoue que si c'est anormal

Le seul canal qui atteigne un humain sans nouvelle infrastructure, c'est **l'email d'échec d'un
workflow GitHub**. Le battement rend son verdict ; le workflow le **lit** et échoue uniquement sur
`anormal`. Jamais sur un état normal : « rien à faire aujourd'hui » n'est pas une panne.

⚠️ **Aucune décision dans le bash.** Le workflow lit `verdict`, il ne le reconstitue jamais à partir
des chiffres. La règle vit dans `packages/core/src/runtime/verdict.ts`, avec ses tests. La recopier
dans un script la ferait diverger au premier changement, et c'est le script — sans test, sans revue
— qui déciderait alors si l'on alerte.

Le piège à éviter est écrit dans l'histoire de ce dépôt : `prospect-cron` échouait 72 fois par jour,
plusieurs centaines d'échecs s'étaient accumulés, et **« le vrai coût n'était pas le bruit, c'était
l'accoutumance »**.

Traite aussi l'**interrupteur silencieux** : le planificateur sortait avec le code `0` quand un
secret manquait. Le raisonnement d'origine tenait tant que la fonction n'était pas déployée ; elle
l'est. Un secret retiré ou expiré arrêterait Lady en laissant le planificateur vert.

**Exigence à prouver, pas à supposer** : que l'email d'échec arrive réellement dans la boîte du
fondateur. Un canal auquel personne n'est abonné est un silence de plus. Voir
[`20-plan-action.md`](20-plan-action.md), qui porte les gestes non mécanisables.

### Étape 7 — Trace de fraîcheur et guetteur externe

Un workflow qui ne s'exécute pas n'échoue pas : **le canal de l'étape 6 est structurellement
aveugle à sa propre absence.** Il faut un signal dont l'**arrêt** est l'alerte.

**a) La trace de fraîcheur.** Le battement inscrit son dernier passage réussi, par le seul chemin
qui prouve que la chaîne entière a fonctionné.

**b) Le guetteur externe** — healthchecks.io : conçu pour ça, gratuit, open source, et rien qu'un
jeton opaque ne sort du réseau. Aucune donnée personnelle.

⚠️ **Le signal part vers l'extérieur, il n'est pas interrogé.** Pas de point d'entrée public : une
porte de moins à défendre, et ça couvre toutes les pannes indistinctement — GitHub arrêté, secrets
tournés, Supabase muet, quota épuisé.

Trois exigences :

1. l'URL de ping est **un secret** : qui la possède peut faire taire l'alerte ;
2. le ping part **si et seulement si `verdict === "normal"`** — sinon on surveille que GitHub
   tourne, pas que Lady travaille ;
3. **rien ne se déclenche tant que le cron n'est pas armé** : le guetteur ne doit pas s'alarmer
   d'un silence qu'on a décidé.

C'est ici que se traite la seconde moitié du cas 5 : **GitHub désactive un `schedule` après 60
jours sans activité sur le dépôt.** Aucun workflow ne subsiste alors pour échouer — seul un
guetteur externe peut le voir.

### Étape 8 — La répétition générale du silence

On a recensé dix façons de tomber en panne sans le dire, et on a construit des détecteurs. **Aucun
n'a jamais été déclenché.** Un système d'alarme jamais éprouvé n'est pas un système d'alarme, c'est
une hypothèse.

Provoquer délibérément chacun des dix cas, en local, et observer ce qui part réellement. Une ligne
par cas :

| Cas | Comment il a été provoqué | Signal attendu | Signal réellement observé | Couvert |

Les règles :

- **Provoqué, pas simulé.** Retirer vraiment une capacité, couper vraiment le fournisseur, bloquer
  vraiment une mission. Un test qui appelle directement la fonction d'alerte ne prouve rien sur la
  chaîne.
- **Observé de bout en bout**, là où un humain le verrait : la notification dans l'espace client,
  le verdict `anormal` dans le compte rendu, l'échec du workflow, l'absence de ping. Jamais au
  milieu de la chaîne.
- **Un cas non couvert s'écrit non couvert.** On n'ajuste pas le tableau pour qu'il soit vert. Si
  un détecteur ne se déclenche pas, c'est le résultat le plus utile de l'étape : il vaut mieux le
  découvrir maintenant que le jour où il compte.

---

## Ce qui autorise la fusion

**L'étape 8, et elle seule.** Pas la 7.

Tant qu'on n'a pas vu chaque alarme sonner pour de vrai, on ne sait pas si le silence est fermé —
on le suppose. Et supposer qu'une alarme fonctionne est précisément le défaut que ce lot répare.

Jusque-là, et sans exception : **aucune fusion, aucun envoi, aucun `db push`, planificateur
désarmé.**
