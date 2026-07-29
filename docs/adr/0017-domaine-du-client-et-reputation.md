# ADR-0017 — On envoie depuis le domaine du client, et rien ne part si ça peut brûler sa réputation (D6 tranchée)

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Les messages d'un employé numérique partent soit du domaine du client, soit d'un domaine de
Sentio. Le domaine du client donne la meilleure délivrabilité et la seule légitimité qui vaille —
le message vient réellement de son entreprise. Il met aussi **son** outil de travail en jeu : une
réputation d'envoi dégradée se répare en mois, et elle affecte les emails que son équipe envoie
au quotidien, pas seulement ceux de l'employé.

Les grandes messageries imposent des seuils chiffrés ([`../10-securite-rgpd.md`](../10-securite-rgpd.md)) :
plaintes sous 0,3 %, rebonds sous 2 %, authentification SPF, DKIM et DMARC alignées, désabonnement
en un clic, et 25 à 50 messages par boîte et par jour après une montée en charge de trois à quatre
semaines.

## Décision

**On envoie depuis le domaine du client. Et la contrainte qui commande tout le lot 2 est celle
énoncée par le fondateur : ne jamais délivrer un message qui pourrait brûler la réputation de son
client.**

Cette phrase n'est pas un objectif de qualité, c'est une **règle d'exécution**. Elle se traduit
en une seule ligne de conception :

> **La capacité d'envoi ne doit pas *pouvoir* émettre quand une seule des conditions manque.**
> Pas « ne doit pas émettre » : *ne doit pas pouvoir*. Un envoi impossible par construction ne se
> contourne pas un soir de démonstration.

Les conditions, toutes obligatoires, toutes vérifiées **avant** chaque message :

1. **Domaine authentifié** — SPF, DKIM et DMARC vérifiés et datés. Sans les trois, zéro message.
2. **Montée en charge respectée** — le plafond quotidien du domaine est celui de son âge d'envoi,
   pas celui de la formule. Le plus bas des deux gagne, toujours.
3. **Plafond quotidien par employé** non atteint.
4. **Aucune suspension en cours** — au-delà des seuils de rebonds ou de plaintes, l'envoi
   s'arrête tout seul et ne redémarre pas tout seul.
5. **Destinataire hors liste d'exclusion et hors désinscriptions** — vérifié **avant** l'envoi,
   pas après.
6. **Prospect qualifié, et origine de la donnée renseignée** ([`0016`](0016-source-des-prospects.md)).
7. **Message porteur de l'information due et du moyen d'opposition**
   ([`../25-conformite-legale.md`](../25-conformite-legale.md)).

Le sous-domaine dédié reste **possible et recommandé à l'installation** — il cloisonne la
réputation du domaine principal du client — mais ce n'est pas une décision d'architecture : c'est
un conseil de mise en service. Le code ne fait pas la différence entre un domaine et un
sous-domaine ; il exige les mêmes preuves des deux.

## Pourquoi

Parce que le risque n'est pas le nôtre. Sentio qui se fait mal noter, c'est un incident ; un
client dont les devis n'arrivent plus chez ses acheteurs parce que son employé numérique a
mal travaillé, c'est la fin de la relation — et probablement la fin du produit, sur un marché où
la première cause d'échec est la mise en œuvre.

Et parce que la seule garantie qui tienne dans le temps est mécanique. Un employé numérique
travaille sans surveillance, la nuit, des mois durant. Une règle qui repose sur la vigilance
d'un fondateur seul cédera un jour ; une règle qui rend l'envoi impossible ne cédera pas.

## Compromis assumé

**1. La mise en service est plus lente.** Un client ne peut pas envoyer le jour de son inscription :
il doit d'abord authentifier son domaine, puis monter en charge pendant des semaines. C'est un
frein réel à l'expérience « il travaille dès aujourd'hui », et il faut l'annoncer à la vente
plutôt que de le découvrir en cours de route.

**2. Les volumes de la V1 seront faibles** — quelques dizaines de messages par jour au mieux. Le
produit ne pourra pas se vendre sur le volume ; il devra se vendre sur la qualification et sur le
résultat prouvé.

**3. Une part du travail est invisible.** Authentification, montée en charge, surveillance des
rebonds : des heures de construction que le client ne verra jamais, et qui ne feront jamais
l'objet d'une capture d'écran. C'est pourtant ce qui protège la seule chose qu'il ne peut pas
racheter.

**4. Sentio se prive d'une option de facilité** — envoyer depuis son propre domaine pour démarrer
vite, quitte à migrer plus tard. Migrer une réputation d'envoi n'existe pas : on la reconstruit.

## Quand revisiter

- **Si un client refuse d'authentifier son domaine** : la réponse est non, pas un contournement.
  Le cas doit être documenté comme une non-vente, pas comme une exception technique.
- **Au premier dépassement de seuil réel** — vérifier que la suspension automatique a bien
  précédé la dégradation, et non l'inverse.
- **Si un fournisseur d'envoi impose son propre domaine** : ce serait un changement de fond, à
  rouvrir ici avant d'être choisi.
