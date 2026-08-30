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
| 6 | Le workflow n'échoue que si c'est anormal (`4f3e0eb`) | 4 | ✅ |
| 7 | Trace de fraîcheur et guetteur externe (`9feefb1`) | 5 | ✅ |
| 8 | **La répétition générale du silence** (`ad9a99c`) | les dix | ✅ |
| — | La documentation, en un seul geste | — | ✅ |

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

## Le résultat de la répétition générale

Exécutée le 2026-08-31, sur une base dédiée, par
[`apps/worker/src/repetition-du-silence.integration.test.ts`](../apps/worker/src/repetition-du-silence.integration.test.ts).
Chaque cas est provoqué pour de vrai — vrai Postgres, vrai port HTTP, vrai
fournisseur de modèle en TLS — et le workflow est joué avec sa logique de décision **extraite du
fichier réel**, de sorte qu'elle ne puisse pas diverger de ce qui tourne.

| Cas | Provoqué par | Observé | Couvert |
|---|---|---|---|
| 1 — un run échoue | un moteur qui lève au moment d'agir | `echec_definitif`, verdict `anormal`, workflow **1**, « missions en échec » à la surveillance | ✅ |
| 2 — capacité sans moteur | `envoyer.prospect` activée, aucun moteur monté | `needs_attention` avec cause `moteur_non_monte`, verdict `anormal`, **aucune** notification au dirigeant | ✅ |
| 3 — travail écarté faute de capacité | un employé sans aucun outil activé | rien ne s'ouvre, rien ne se déclenche, personne n'est prévenu | ❌ |
| 4a — modèle retiré | un fournisseur HTTP qui répond 404 `model_not_found` | verdict `anormal`, workflow **1**, aucun ping | ✅ |
| 4b — modèle qui répond du vide | un fournisseur HTTP qui répond 200 avec un contenu vide | `{pas_suivant: 9, budget_epuise: 1}`, verdict **`normal`**, workflow **0**, guetteur **pingé** | ❌ |
| 5a — un secret manque | la garde réelle du workflow, secrets vides | code de sortie **1** | ✅ |
| 5b — le planificateur s'est tu | trace de fraîcheur vieillie de trois heures | alerte « battement absent » à 180 minutes | ⚠️ partiel |
| 6a — aucun fournisseur conforme | opt-out déclaré non prouvé | `NonCompliantRouting` en exception, verdict `anormal`, workflow **1** | ✅ |
| 6b — plafond atteint | `usage_counter` poussé au-dessus du quota | `{report_de_quota: 2}`, **aucun échec**, verdict `anormal`, workflow **1** | ✅ |
| 7 — réévaluation muette | une Lady configurée, sans rien à mesurer | silence journalisé et compté, **aucun consommateur** | ❌ |
| 8 — blocage qui draine le vivier | trois journées avec la capacité applicable retirée | notification au dirigeant, **nommant l'outil à activer** | ✅ |
| 9 — deux gardes, un `politique_refuse` | le modèle propose une capacité non autorisée | l'événement ne porte **ni raison ni cause** : les deux gardes restent indiscernables | ❌ |
| 10 — la reprise | mission bloquée, outil activé, second battement | **deux défauts** : la reprise est affamée, puis défaite dans le cycle qui la fait | ❌ |

### Le cas 6b, celui qui a ouvert le lot

`{report_de_quota: 2}`, `echoues: 0`, et pourtant `anormal`. C'est exactement le rapport
rassurant et faux qui serait parti 144 fois par jour si le planificateur avait été armé. Il est
désormais attrapé, et le workflow échoue dessus.

### Les quatre trous, et ce qu'ils coûtent

**4b — un modèle qui répond du vide passe pour un modèle qui travaille.** C'est le plus grave.
`proposition_illisible` fait avancer le pas ; le run consomme tout son budget — dix appels
facturés — et se referme sur `budget_epuise`. Or `pas_suivant` et `budget_epuise` comptent tous
deux comme « du travail a avancé ». Verdict normal, workflow vert, guetteur pingé. **Dix appels
payants, rien de fait, et toutes les alarmes disent que tout va bien.** C'est la classe de défaut
que ce lot existe pour fermer, et elle ne l'est pas.

**10 — l'étape 3 ne tient pas de bout en bout, pour deux raisons indépendantes.**

  1. **La reprise est affamée.** Elle prend les `reprisesMaxParCycle` (5) missions bloquées les
     plus anciennes, **toutes entreprises confondues**. Une mission dont la cause ne disparaît
     jamais — un moteur non monté — reste en tête de cette liste pour toujours. Cinq d'entre elles
     suffisent à ce qu'aucune autre ne soit jamais reprise, chez aucun client.
  2. **La reprise est défaite dans le cycle qui la fait.** Elle remet la mission en file et repasse
     la tâche en `pending`, puis écrit `reprise_apres_outil` au journal. Mais
     `reconstruireEtatRun` **ne connaît pas cet événement** : il retombe sur `attention_requise`,
     `peutReprendre` refuse, et `remettreLaFileDaccord` remet la mission de côté. Le dirigeant
     active l'outil manquant, et il ne se passe toujours rien.

Le test unitaire de la reprise passe : il éprouve le module, jamais la boucle qui le suit. C'est
précisément ce que la répétition générale était là pour trouver.

**3 — ce qui n'existe pas n'est surveillé par personne.** Un employé sans outil activé n'ouvre
aucune mission. « Rien à faire » est un silence légitime, et tous nos détecteurs raisonnent sur du
travail commencé. Le dirigeant n'apprend jamais qu'il lui manque un outil.

**7 et 9 — deux silences internes.** La réévaluation compte ses silences dans un rapport que
personne ne lit. Et `decideNextAction` appelle `policy.refuse` depuis deux endroits — « hors de la
liste autorisée » et « capacité inconnue du registre » — avec exactement la même charge : rien ne
dit laquelle a refusé. Les étapes 1 et 5 ont fermé autre chose, et il ne faut pas les confondre.

### Ce que la répétition a appris sur elle-même

Deux fois, le banc a failli mentir, et les deux méritent d'être connus :

  · trois cas se déclaraient « non couverts » alors que leurs battements étaient **refusés en
    401** — la signature était calculée à l'heure de la machine, pas à l'instant donné au worker.
    Le banc refuse désormais d'observer un battement qui n'a pas eu lieu : une observation vide ne
    vaut pas un constat ;
  · un moteur enregistré sous un autre nom que celui de `capability_binding` n'est jamais résolu.
    De l'extérieur, il ressemble à un moteur **absent**, pas à un moteur qui **échoue** — deux
    pannes différentes sous la même apparence.

---

## Ce qui autorise la fusion

**L'étape 8, et elle seule.** Pas la 7.

Tant qu'on n'a pas vu chaque alarme sonner pour de vrai, on ne sait pas si le silence est fermé —
on le suppose. Et supposer qu'une alarme fonctionne est précisément le défaut que ce lot répare.

⚠️ **La répétition a eu lieu, et son verdict est que le critère n'est PAS atteint.** Six cas sur
dix sonnent, un partiellement, et **quatre restent muets** — dont deux qui laissent une employée
tourner sans rien faire pendant que toutes les alarmes affichent vert. Ce n'est pas un échec de
l'étape 8 : c'est son résultat, et c'est exactement pourquoi elle passait avant la fusion et non
après.

Ce qu'il reste à trancher, dans cet ordre de gravité :

| # | Ce qu'il faut décider | Pourquoi maintenant |
|---|---|---|
| 4b | un pas qui ne produit aucune proposition lisible doit-il compter comme « du travail a avancé » ? | c'est le seul trou qui rende le guetteur VERT pendant que rien ne se fait |
| 10 | `reprise_apres_outil` doit-il ramener un run en `en_cours` ? et la reprise doit-elle cesser de servir les plus anciennes d'abord ? | l'étape 3 est livrée et ne fonctionne pas hors de son test |
| 9 | le refus de politique doit-il nommer la garde qui a refusé ? | c'est le cas 9 tel qu'il était énoncé, et il est resté ouvert |
| 3, 7 | un travail qui n'existe pas, et un silence que personne ne lit, doivent-ils remonter ? | les deux sont des silences légitimes aujourd'hui : les signaler à tort coûterait l'accoutumance |

Jusque-là, et sans exception : **aucune fusion, aucun envoi, aucun `db push`, planificateur
désarmé.**
