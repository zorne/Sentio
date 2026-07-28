# ADR-0010 — Le diagnostic calibre l'employé, il ne recommande plus un métier

**Date :** 2026-07-28
**Statut :** acceptée

## Contexte

Le parcours produit fait aboutir le diagnostic à une **recommandation de métier**, produite par un
moteur de règles déterministe : frein détecté → métier. Avec un seul métier au catalogue
([`0008`](0008-perimetre-v1-commercial-seul.md)), cette recommandation ne décide de rien : quelle que
soit la conversation, la réponse est connue d'avance.

Le dépôt le reconnaît déjà — le compromis **C7** de [`../16-compromis.md`](../16-compromis.md)
s'intitule « *le client ne choisit jamais est théâtral tant qu'un seul métier existe* ». Le compromis
était assumé, mais il laissait un problème réel : le diagnostic consomme des appels de modèle sur de
la donnée réelle, occupe le moment le plus décisif du parcours, et ne produit qu'une justification
rédigée après coup pour une conclusion déjà écrite.

Deux éléments nouveaux ont rouvert le sujet. D'abord la verticalisation
([`../22-niche-et-verticalisation.md`](../22-niche-et-verticalisation.md)) : un employé de niche a
besoin d'être ajusté à la situation de chaque client, ce qui donne au diagnostic quelque chose de
réel à décider. Ensuite les données du marché ([`../21-concurrence.md`](../21-concurrence.md)) :
l'onboarding adaptatif retient mieux que le préréglage figé, et l'absence de prise en compte des
demandes du client est un motif de résiliation.

## Décision

**Le diagnostic calibre l'employé au lieu de recommander un métier.**

Le moteur de règles déterministe est conservé — même composant (`ACQUIS-14`), même table
`diagnostic_session`, même initialisation du contexte entreprise au recrutement (`RECRUT-05`). Seule
sa **sortie** change :

- **avant** : frein détecté → quel métier ;
- **après** : frein détecté + situation → **comment cet employé est calibré** — objectif, capacités
  activées, cible visée, ton, angles d'accroche, exclusions.

Ce calibrage s'écrit dans `company_profile` et `employee_capability`. **Il ne touche jamais l'ADN**,
qui reste immuable, versionné et commun à tous les clients de la niche (invariant 1).

Ce qui ne change pas : le client ne choisit toujours pas son employé, il n'y a toujours qu'une seule
proposition, le modèle ne décide toujours rien — il rédige. Et un besoin hors périmètre doit toujours
être dit comme tel, au moment où il est formulé.

## Pourquoi

Parce que le diagnostic devient une vraie décision au lieu d'une mise en scène. Le même travail
produit désormais un résultat qui a des conséquences observables sur le travail de l'employé, ce qui
justifie son coût d'inférence et sa place dans le parcours.

Parce que c'est ce que le marché retient : les produits qui s'ajustent à la situation réelle du
client sont gardés, ceux qui appliquent un préréglage sont résiliés.

Et parce que le compromis C7 disparaît sans rien sacrifier — la promesse « le client ne choisit
jamais » reste vraie, elle devient simplement honnête.

## Compromis assumé

**1. Chaque question du diagnostic crée une dette.** Ce que le client exprime, l'employé devra le
tenir. Un diagnostic qui recueille large et un employé qui livre étroit est pire qu'un diagnostic
sobre : il installe une déception au lieu d'une surprise. Le périmètre de ce que le diagnostic
accepte de recueillir doit rester borné à ce que les capacités savent faire.

**2. Le calibrage est une surface d'erreur nouvelle.** Un employé mal calibré travaillera
correctement sur la mauvaise cible — panne silencieuse, plus difficile à détecter qu'un échec franc.
D'où l'obligation de journaliser le motif de sélection d'un prospect (`METIER-22`) : c'est ce qui
rend un mauvais calibrage visible.

**3. Le client peut vouloir corriger le calibrage.** Il faut donc que le contexte entreprise reste
modifiable et que la correction soit possible depuis le dashboard — ce que la traçabilité par ligne
de [`../04-contextes-memoire.md`](../04-contextes-memoire.md) permet déjà, mais qui demande une
interface.

**4. Rien de tout cela ne remplace le choix de la niche.** Calibrer finement un employé générique
reste moins performant que calibrer sommairement un employé de niche. Le calibrage est un
multiplicateur, pas un substitut — décision **D15**.

## Quand revisiter

- **Le jour où un deuxième métier existe** : la recommandation redevient un choix réel, et les deux
  fonctions coexistent — recommander *puis* calibrer.
- **Si le taux d'abandon du diagnostic monte** : c'est le signe que le questionnement est devenu trop
  long. Le calibrage doit rester une conversation, pas un formulaire.
- **Si les employés calibrés ne font pas mieux que les employés par défaut** après un volume
  suffisant : le calibrage ne servirait alors qu'à rassurer, et il faudrait le dire.
