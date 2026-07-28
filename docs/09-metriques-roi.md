# 09 — Métriques et ROI

> À lire si tu travailles sur : le dashboard, la fiche employé, la progression vers l'objectif,
> ou n'importe quel chiffre montré à un client.

---

## La règle, avant tout le reste

> **Aucun chiffre affiché sans une ligne en base qui le justifie.**

Ce produit vend de la confiance. Un client qui découvre un chiffre inventé ne revient jamais,
et il n'a alors plus aucune raison de croire les autres.

---

## Ce que le client voit (§20 de la vision)

Uniquement : chiffre d'affaires généré, temps économisé, taux de conversion, progression,
retour sur investissement, objectifs atteints. **Aucun jargon technique.**

Jamais : le modèle utilisé, les outils, les workflows, le nombre d'appels, les coûts internes.

---

## D'où vient chaque chiffre

| Métrique | Comment elle est produite | Nature |
|---|---|---|
| Prospects contactés, réponses, rendez-vous | comptage direct d'événements du journal | **fait vérifiable** |
| Taux de conversion | ratio d'événements | **fait vérifiable** |
| **CA généré** | somme des ventes **déclarées gagnées par le client**, rattachées à un prospect touché par l'employé, dans une fenêtre d'attribution annoncée | **déclaratif — confirmé par le client** |
| **Temps économisé** | nombre d'actions × durée de référence par action, affiché comme une estimation avec sa base de calcul | **estimation assumée** |
| **ROI** | (CA attribué − prix de l'abonnement) ÷ prix | dérivé des deux ci-dessus |
| Progression vers l'objectif | CA attribué ÷ objectif déclaré | dérivé |

---

## Le modèle d'attribution, en clair

Aucun système ne peut prouver seul qu'une vente vient de l'employé. Le seul modèle défendable :

1. L'employé touche un prospect → un événement est journalisé.
2. Le prospect devient client → **le dirigeant le déclare** dans son dashboard, avec le montant.
3. Sentio rattache cette vente à l'employé **si** le prospect a été touché dans la fenêtre
   d'attribution annoncée (par exemple 90 jours).
4. Le CA généré affiché est la somme de ces ventes confirmées.

**Ce qui doit être visible pour le client :** la fenêtre d'attribution, et le fait que le
chiffre repose sur ses propres confirmations. Un ROI calculé sans confirmation client est un
chiffre inventé.

---

## Le temps économisé

Le calcul honnête : `nombre d'actions réalisées × durée de référence par type d'action`.

Les durées de référence sont une **hypothèse**, pas une mesure. Elles doivent être :
- documentées quelque part de consultable,
- affichées comme estimation (« environ 4 heures ce mois-ci, sur la base de 12 min par
  prospect qualifié »),
- conservatrices plutôt que flatteuses.

---

## L'état vide — à concevoir, pas à éviter

Les premières semaines, un client payant ouvrira un dashboard presque vide. C'est inévitable et
c'est **le moment le plus fragile de la relation**.

**Bonne réponse :** une montée en puissance lisible.
> « Carter a contacté 12 entreprises cette semaine. 2 ont répondu. Il apprend ce qui fonctionne
> sur votre marché. »

**Mauvaises réponses :** des chiffres de démonstration, une jauge à 0 % sans explication, un
graphique vide, ou un ROI affiché à −100 %.

---

## Donner les repères plutôt que les cacher

Un client qui ignore ce qu'est un résultat normal lit ses propres chiffres comme un échec. C'est le
mode de résiliation dominant du marché : il part au troisième mois en croyant que ça ne marche pas,
alors que les chiffres sont conformes. **Afficher l'ordre de grandeur à côté de la mesure** coûte une
ligne et retient un client.

| Indicateur | Repère réaliste (vérifié le 2026-07-28) |
|---|---|
| Taux de réponse à froid | **3 à 5 %** — au-delà de 5 % c'est bon, 8 % excellent |
| Prospects convertis en rendez-vous | 2 à 5 % |
| Rendez-vous qualifiés par mois | 12 à 20 pour un commercial rodé |

Ces repères sont des **données de configuration**, pas des constantes de code, et ils portent leur
date. Ils ne remplacent jamais une mesure : ils la situent. Voir `DASH-18` et
[`21-concurrence.md`](21-concurrence.md).

**Ce que ça n'autorise pas :** afficher un repère à la place d'un chiffre absent. Un dashboard sans
activité affiche un état vide, pas une moyenne de marché.

---

## Provenance

Chaque valeur affichée doit pouvoir répondre à « d'où vient ce chiffre ? ». En pratique :
chaque métrique porte sa **provenance** (comptée / déclarée / estimée / dérivée), et
l'interface la reflète — même discrètement.

C'est aussi ce qui protège Sentio en cas de litige avec un client sur les résultats promis.
