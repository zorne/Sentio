# ADR-0016 — Les prospects viennent du client d'abord, de Sentio ensuite (D5 tranchée)

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Un commercial doit contacter des entreprises. Deux façons de savoir lesquelles : le client fournit
sa liste, ou Sentio la constitue.

Le marché tranche à moitié la question. Sur 412 déploiements arrêtés
([`../21-concurrence.md`](../21-concurrence.md)), la cause dominante est **une donnée client sale
transformée en mauvais messages à grande échelle**. Une liste constituée automatiquement, non
vérifiée, est précisément la matière première de cet échec — et son coût ne se paie pas en
performances, il se paie en réputation d'envoi et en confiance perdue.

Mais l'autre moitié compte aussi : « il trouve des clients tout seul » est ce qui fait acheter.
Un employé qui attend qu'on lui donne un fichier ressemble à un outil d'emailing de plus.

## Décision

**V1 : le client fournit ses prospects. V2 : Sentio en trouve, une fois la qualification éprouvée.**

1. Le client importe sa liste — fichier ou export de son outil. C'est lui qui reste
   **responsable** de ces données ([`../25-conformite-legale.md`](../25-conformite-legale.md)).
2. **L'origine de chaque prospect est obligatoire, au niveau de la base.** Un prospect sans
   origine renseignée ne peut pas exister, donc ne peut pas être contacté. Ce n'est pas une
   colonne d'information : c'est la condition qui rend la prospection régulière.
3. La **qualification** est P0 et non P1 : chaque prospect passe par elle avant tout message. Une
   liste fournie n'est pas une liste propre.
4. La recherche autonome (V2) ne s'ouvrira que sur une source **documentée**, avec la même
   exigence d'origine — et jamais sur un fichier acheté dont on ignore comment les personnes ont
   été informées.

## Pourquoi

Parce que l'ordre compte plus que le choix. Commencer par la liste du client permet de construire
et d'éprouver la qualification, les exclusions, la désinscription et les garde-fous d'envoi sur
un volume maîtrisé. Le jour où Sentio cherchera lui-même, tout ce qui protège le client sera déjà
en place et prouvé — au lieu d'être écrit dans l'urgence, après le premier incident.

C'est aussi la seule version défendable juridiquement dès le premier jour : la condition
d'information à la collecte dépend de l'origine de la donnée, et sur sa propre liste, le client
sait répondre.

## Compromis assumé

**1. La promesse est plus faible à la vente.** « Donnez-lui vos contacts » impressionne moins que
« il trouve vos clients ». Il faudra le compenser par la qualité de la qualification et par ce
que le client voit se passer, pas par le discours.

**2. Un client sans fichier ne peut pas démarrer.** C'est un frein réel à l'entrée. Il est assumé
pour la V1 : mieux vaut un client qui commence bien qu'un client servi vite et mal.

**3. La V2 devra rouvrir le sujet**, avec une question qu'on ne sait pas encore trancher : quelle
source de prospects est à la fois exploitable et régulière. La décider maintenant, sans avoir vu
un seul envoi réel, serait la décider à l'aveugle.

## Quand revisiter

- **Quand la qualification aura tourné sur plusieurs centaines de prospects réels** — c'est le
  signal que la V2 peut s'ouvrir.
- **Si les premiers prospects refusés le sont massivement pour donnée invalide** : le problème
  serait alors dans l'import, pas dans la source.
- **Avant tout achat de fichier**, quel qu'en soit le vendeur.
