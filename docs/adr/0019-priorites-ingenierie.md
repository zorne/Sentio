# ADR-0019 — Sentio est un logiciel pour entreprises exigeantes, pas un produit minimum viable

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Le projet a jusqu'ici tranché des décisions **ponctuelles** : isolation, transparence, source des
prospects, service d'expédition. Chacune a été arbitrée sur ses propres mérites, et plusieurs ont
été arbitrées dans le même sens sans que la règle sous-jacente soit écrite — préférer le garde
mécanique à la consigne, refuser la fonctionnalité qui abîme la confiance, payer aujourd'hui ce
qui ne se rattrape pas demain.

Cette règle existait donc en pratique, mais pas en droit. Un projet mené seul sur des mois a
besoin qu'elle soit écrite : c'est ce qui permet de **refuser** un raccourci sans avoir à le
redémontrer chaque fois, et c'est ce qui rendra les arbitrages futurs cohérents avec les passés.

Le fondateur l'énonce ici, et fixe un **ordre**, parce que sans ordre une liste de qualités ne
tranche rien : le jour où deux se contredisent, il faut savoir laquelle cède.

## Décision

**Sentio se construit comme un logiciel destiné à des entreprises exigeantes. Les six priorités
suivantes guident toute décision d'architecture, dans cet ordre.**

### 1. Sécurité

Aucune décision ne sacrifie la sécurité pour gagner du temps. Moindre privilège partout ;
validation de **toutes** les entrées ; aucune donnée sensible dans les journaux ; chiffrement des
données sensibles ; secrets uniquement en variables d'environnement ou dans un gestionnaire
dédié.

*Déjà tenu :* droits explicites plutôt que défauts de plateforme, portée d'entreprise obligatoire
à la construction, clés hors du dépôt.
*Ce que ça engage :* toute entrée venue d'un client, d'un prospect, d'un modèle ou d'un service
externe est validée **avant** d'atteindre le domaine, et la validation se teste.

### 2. Confidentialité

Privacy by design réel : isolation stricte entre entreprises, conformité RGPD, **collecte
minimale**, effacement possible, journalisation des accès sensibles.

*Déjà tenu :* quatre couches d'isolation, `erase_tenant()` exécutable, provenance de la mémoire
immuable, étanchéité inter-entreprises érigée en règle ([`0014`](0014-etancheite-entre-entreprises.md)).
*Ce que ça engage :* on ne collecte pas « au cas où ». Toute colonne nouvelle portant une donnée
personnelle doit dire pourquoi elle existe et combien de temps elle vit.

### 3. Architecture

Propre, modulaire, découplée. **Tout service externe reste derrière une interface** — Resend
aujourd'hui, un autre demain — sans impact sur le domaine métier.

*Déjà tenu :* `ModelProvider`, `EmailProvider`, `CapabilityEngine`, les ports du noyau.
*Ce que ça engage :* aucun service externe n'est nommé ailleurs que dans son adaptateur, et un
adaptateur ne remonte jamais son vocabulaire dans le domaine.

### 4. Fiabilité

Rendre les bugs critiques **extrêmement improbables**, pas seulement rares. **Chaque bug corrigé
s'accompagne d'un test de non-régression.** Les traitements critiques sont idempotents,
transactionnels quand il le faut, et conçus pour survivre à une panne au milieu.

*Déjà tenu :* clés d'idempotence, réservation avant envoi, garde d'envoi en base, vérification
par la négative de chaque correctif.
*Ce que ça engage :* un correctif sans test qui échoue **avant** lui n'est pas un correctif.

### 5. Observabilité

Tout incident en production doit se comprendre vite : journaux **structurés**, métriques,
identifiant de corrélation, audit des actions sensibles.

*Déjà tenu :* journal en ajout seul, décisions de politique tracées, compte-rendu d'effacement.
*Ce qui manque, et devient une dette reconnue :* il n'existe pas encore d'identifiant de
corrélation traversant un run, ni de journalisation applicative structurée hors du journal
métier. À construire avec le lot 3, et à ne pas repousser au-delà.

### 6. Qualité avant rapidité

Quand vitesse et robustesse s'opposent, **la robustesse gagne**. Repousser une fonctionnalité est
préférable à introduire de la dette.

*Ce que ça engage :* une fonctionnalité incomplète mais correcte est livrable ; une fonctionnalité
complète mais fragile ne l'est pas.

### Comment s'en servir

L'ordre tranche les conflits : la sécurité prime sur la confidentialité si les deux s'opposent
(rare), la confidentialité prime sur l'élégance architecturale, et **les cinq premières priment
toutes sur le délai**. Une décision qui contredit l'une d'elles ne se prend pas en silence : elle
s'écrit ici, avec son coût.

## Pourquoi

Parce que la cible l'exige. Sentio demande à une entreprise de lui confier ses clients, ses prix,
ses arguments — et de laisser un employé numérique écrire en son nom, depuis son domaine. Rien de
tout cela ne se vend à une entreprise sérieuse avec un produit « suffisant pour commencer ». Le
premier incident visible coûterait plus que tous les mois gagnés.

Et parce que le risque de ce projet n'est pas technique, il est commercial
([`0001`](0001-repartir-de-zero.md)) : ce qui fait échouer les concurrents n'est pas un manque de
fonctionnalités, c'est une mise en œuvre qui abîme la confiance. Bâtir solidement est donc aussi
la stratégie commerciale, pas seulement une exigence d'ingénieur.

## Compromis assumé

**1. Le premier client arrivera plus tard.** Chaque garde mécanique, chaque test par la négative,
chaque interface intermédiaire coûte des heures qui ne produisent aucune fonctionnalité visible.
C'est accepté, et c'est le compromis le plus lourd de cette entrée.

**2. On construira des choses que personne ne verra** — filets structurels, procédures
d'effacement, marquages d'en-tête. Impossible d'en faire une capture d'écran, impossible de les
vendre. Elles se voient le jour où elles manquent.

**3. Le risque s'inverse.** À trop bâtir avant de vendre, on peut construire longtemps un produit
que personne n'achète — exactement ce que `adr/0001` désigne comme le vrai danger. La parade est
la phase 10 du plan d'action : commencer à parler à des clients **avant** que tout soit fini, pas
après.

**4. Certaines décisions seront plus lentes à prendre**, parce qu'il faudra les écrire. C'est
voulu : une décision qu'on n'a pas su écrire est une décision qu'on n'a pas comprise.

## Quand revisiter

- **Si le produit n'a pas de client six mois après la mise en ligne** — le compromis 3 se serait
  réalisé, et l'arbitrage vitesse/robustesse mériterait d'être rouvert, sans toucher aux
  priorités 1 et 2.
- **À la première embauche** — ces priorités deviennent alors un contrat entre plusieurs
  personnes, et non plus une discipline personnelle.
- **Jamais pour la sécurité ni la confidentialité :** ce sont les deux qui ne se rattrapent pas.
