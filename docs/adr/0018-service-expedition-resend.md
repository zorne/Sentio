# ADR-0018 — Resend expédie la V1, derrière une interface qui le rend remplaçable

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Le lot 2 a besoin d'expédier des messages depuis le domaine du client
([`0017`](0017-domaine-du-client-et-reputation.md)). Aucune décision ne couvrait ce choix : ni le
backlog, ni le plan d'action ne nommaient de service d'expédition.

Les candidats sérieux se ressemblent sur l'essentiel — authentification du domaine, suivi des
rebonds et des plaintes, API d'envoi — et se distinguent sur trois points : la simplicité
d'intégration, la localisation des données, et le coût au démarrage.

## Décision

**Resend est le service d'expédition de la V1. Il est branché derrière une interface
`EmailProvider`, et le reste du code ne le connaît pas.**

Motifs retenus par le fondateur : API simple et moderne, délivrabilité éprouvée, offre gratuite
suffisante pour le développement et les premiers envois, domaine personnalisé dès le départ.

Trois conséquences de conception, non négociables :

1. **Aucun module en dehors de l'adaptateur ne nomme Resend.** La capacité d'envoi parle à
   `EmailProvider` ; ajouter Brevo, Postmark ou le SMTP du client sera une classe de plus et une
   ligne de configuration — jamais une modification du métier. C'est le même motif que le Model
   Gateway pour l'inférence ([`0006`](0006-capacite-vs-outil.md)).
2. **Le domaine d'envoi est configuré en région UE (Irlande)**, que Resend propose depuis fin
   2024.
3. **La clé d'API vit en variable d'environnement**, jamais dans le dépôt
   ([`../../AGENTS.md`](../../AGENTS.md), invariant 7). La clé d'idempotence de l'action est
   transmise à Resend dans l'en-tête prévu à cet effet : la déduplication tient alors des deux
   côtés, pas seulement du nôtre.

## Pourquoi

Parce que le facteur limitant de ce lot n'est pas le service d'expédition : c'est la garde qui
décide **si** un message a le droit de partir. Une fois cette garde en place, le service devient
un détail interchangeable — et le choix le plus rationnel est celui qui coûte le moins de temps
à intégrer aujourd'hui, à condition de pouvoir en changer demain sans rien réécrire. C'est
exactement ce que l'interface garantit.

## Compromis assumé

**1. Les métadonnées restent aux États-Unis.** C'est le point à connaître, et il n'était pas dans
les motifs. Resend permet d'**expédier** depuis l'Irlande, mais les données de compte — journaux
d'envoi, métadonnées, historique d'API — sont stockées aux États-Unis quelle que soit la région
d'expédition choisie. Or ces journaux contiennent les adresses des prospects **du client**, dont
Sentio est sous-traitant.

Ce n'est pas une raison de revenir sur la décision : la région UE couvre l'acheminement, le
transfert restant est encadrable, et le volume de la V1 est faible. Mais cela ajoute trois
obligations qui n'existeraient pas avec un service intégralement européen, et qui doivent être
réglées **avant le premier envoi réel** :

- signer le contrat de sous-traitance de Resend et l'inscrire au registre
  ([`../26-registre-traitements.md`](../26-registre-traitements.md), partie IV) ;
- vérifier et documenter le mécanisme de transfert hors UE (clauses contractuelles types ou
  cadre de protection des données), puisque la contrainte européenne du projet est **dure**
  ([`../10-securite-rgpd.md`](../10-securite-rgpd.md)) ;
- ne faire transiter que le nécessaire : pas de donnée personnelle superflue dans les objets, les
  en-têtes ou les métadonnées.

**2. Une dépendance de plus à un acteur non européen**, alors que le projet a choisi l'inverse
pour l'inférence ([`0009`](0009-fournisseur-inference-ue.md)). L'incohérence est réelle et
assumée pour la V1 ; elle est bornée par le point suivant.

**3. Le coût de sortie est faible, mais pas nul.** L'interface protège le code, pas la
réputation : changer de service d'expédition impose de réauthentifier le domaine et de refaire une
montée en charge. Ce n'est pas une bascule de configuration, c'est quelques semaines.

## Quand revisiter

- **Avant le premier envoi réel** — les trois obligations du compromis 1.
- **Si un client exige une localisation européenne intégrale** : c'est le moment où l'interface
  sert, avec un service européen en second fournisseur.
- **Au premier dépassement de l'offre gratuite** — comparer le coût au volume réel plutôt qu'aux
  grilles affichées.
- **Si Resend ouvre le stockage des journaux en UE**, ce compromis tombe et l'ADR se met à jour.
