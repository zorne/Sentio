# 16 — Compromis assumés

> À lire si tu travailles sur : le discours commercial, une promesse client, ou si tu te
> demandes « pourquoi ce n'est pas fait proprement ? ».
>
> Chacun de ces compromis est **volontaire**. Aucun n'est un oubli.

---

## C1 — Le €0 plafonne le nombre de clients

Les tiers gratuits imposent un quota d'inférence journalier **partagé par tous les clients**.
Un run d'employé consomme plusieurs appels de modèle. L'ordre de grandeur réaliste est de
**quelques dizaines de runs par jour, tous clients confondus** — soit quelques clients actifs,
pas quelques dizaines.

Ce n'est pas un défaut d'architecture, c'est le plafond du €0.

> **Meilleur endroit où rompre le €0 :** une clé d'inférence payante plafonnée coûte quelques
> euros par mois et multiplie la capacité par un ordre de grandeur.

---

## C2 — Le fournisseur de secours gratuit ne verra jamais un client réel

Sa politique de données n'est pas contractuellement « sans entraînement ». Il ne sert donc
qu'à la démonstration et aux tests.

**La capacité réelle de Sentio est celle du seul fournisseur conforme.** Le filet de secours
n'en est pas un pour les clients payants — il ne faut pas se rassurer avec.

---

## C3 — Les offres gratuites interdisent souvent l'usage commercial

Vendre un abonnement depuis une offre d'hébergement gratuite expose à une suspension de
compte, c'est-à-dire à la **disparition du produit sans préavis**.

À vérifier dans les conditions de chaque prestataire **avant** d'encaisser, pas après.

---

## C4 — Pas de sauvegarde restaurable finement

Un incident de données chez un client payant est irréversible. Un export régulier hors
plateforme est le minimum absolu ; l'offre payante de base est la première dépense justifiée.

---

## C5 — Aucun serveur permanent

Les employés ne travaillent pas « en continu » mais **par battements**. Le vocabulaire client
doit en tenir compte : « Carter travaille chaque jour » est vrai, promettre du temps réel
serait faux.

---

## C6 — La démonstration de la vitrine est scriptée

Une vraie exécution en direct, exposée à des inconnus, brûlerait le quota des clients payants
et tomberait en panne le jour du pic de trafic.

**Limite à ne pas franchir :** elle doit être présentée comme une démonstration, jamais comme
une analyse en direct du visiteur.

---

## C7 — « Le client ne choisit jamais » est théâtral tant qu'un seul métier existe

Assumé — à une condition : que le diagnostic reste honnête quand le besoin détecté sort du
périmètre disponible.

Le mensonge n'est pas dans la mise en scène. Il serait dans la vente d'un employé incapable de
faire le travail.

---

## C8 — « Les employés évoluent seuls » est vrai, mais lentement

Mémoire et variantes de stratégie mesurées, pas de ré-entraînement. Avec peu de volume, le
gain est faible et lent.

**Toute notification d'évolution non adossée à un changement enregistré est un mensonge** — et
c'est le mensonge le plus facile à commettre dans ce produit, parce qu'il ne coûte rien et
rend l'interface vivante.

---

## C9 — CA généré et temps économisé restent déclaratifs

Aucun système ne peut prouver seul qu'une vente vient de l'employé. Le modèle d'attribution
(confirmation par le client, fenêtre annoncée) est la seule version défendable.

Un ROI calculé sans confirmation du client est un chiffre inventé.

---

## C10 — L'architecture coûte du temps avant de rapporter

Isolation, versionnage, capacités abstraites, idempotence, journal : **environ un tiers du
travail initial sert la scalabilité, pas la première démonstration**. C'est le prix explicite
de l'exigence « ça doit être scalable ».

Les raccourcis sont possibles sur presque tout. **Les deux seuls qui ne se rattrapent pas :
l'isolation par entreprise et l'idempotence.** Ne pas les prendre.

---

## C11 — Repartir de zéro coûte trois à quatre semaines

Décision prise en connaissance de cause : un code antérieur existant couvrait déjà une partie
du besoin. Ce code reste une **référence gratuite** — ses décisions documentées recensent des
incidents déjà vécus (encodage des appels d'outils, quota épuisé pendant la réflexion
d'après-run, repli entre fournisseurs). Les relire avant d'écrire l'équivalent évite de
repayer les mêmes erreurs.

---

## C12 — Ce dépôt est public

Y publier l'architecture rend lisibles par n'importe qui : le positionnement, les limites du
produit, les compromis assumés et la fragilité du modèle €0.

Aucun secret n'y figure, donc **aucun risque technique** — mais un concurrent ou un prospect
peut tout lire. Passer le dépôt en privé est gratuit et prend dix secondes ; à faire si ce
n'est pas voulu.
