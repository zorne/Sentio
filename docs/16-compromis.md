# 16 — Compromis assumés

> À lire si tu travailles sur : le discours commercial, une promesse client, ou si tu te
> demandes « pourquoi ce n'est pas fait proprement ? ».
>
> Chacun de ces compromis est **volontaire**. Aucun n'est un oubli.

---

## C1 — Le €0 plafonne le nombre de clients

Le tier gratuit impose un quota d'inférence **partagé par tous les clients**. Un run d'employé
consomme plusieurs appels de modèle. Le plafond réaliste reste de l'ordre de **quelques dizaines
de runs par jour, tous clients confondus** — soit quelques clients actifs, pas quelques dizaines.

**Le facteur limitant n'est pas celui qu'on croyait.** Le fournisseur retenu offre un volume
mensuel très large mais un **débit par minute** bas. Ce n'est donc pas le nombre de tokens qui
plafonne Sentio, c'est la cadence. Conséquence : la file doit lisser les appels dans le temps
plutôt que les grouper, et un pic de diagnostics sur la vitrine reste le vrai danger.

Ce n'est pas un défaut d'architecture, c'est le plafond du €0. Chiffres :
[`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md).

> **Meilleur endroit où rompre le €0 :** une clé d'inférence payante plafonnée chez un
> fournisseur européen, qui lève la limite de débit d'un coup.

---

## C2 — Le fournisseur de secours ne verra jamais un client réel

**La capacité réelle de Sentio est celle du seul fournisseur conforme.** Le filet de secours
n'en est pas un pour les clients payants — il ne faut pas se rassurer avec.

Son usage est même plus étroit qu'il n'y paraît : la démonstration de la vitrine est scriptée
(C6) et ne consomme aucun appel de modèle, et le diagnostic manipule de la donnée réelle dès la
première question. **Il ne reste que les tests internes et le développement.**

S'y ajoute une fragilité propre au fournisseur principal : son non-entraînement repose sur un
**opt-out en console, révocable**, pas sur une clause contractuelle. Tant qu'il n'est pas activé
et prouvé, le fournisseur est non conforme et aucune donnée réelle ne doit y transiter. Voir
[`adr/0009`](adr/0009-fournisseur-inference-ue.md).

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
