# 05 — Le runtime d'un employé

> À lire si tu travailles sur : l'exécution, l'appel de modèle, les validations humaines,
> la file de travaux, ou les niveaux d'autonomie.

---

## Un run est une machine à états persistée, pas une boucle en mémoire

C'est la décision d'architecture la plus structurante du projet. Elle résout trois problèmes
d'un seul coup :

| Problème | Comment elle le résout |
|---|---|
| **€0** : aucun serveur permanent | chaque battement exécute un pas borné (quelques secondes), enregistre l'état, rend la main |
| **Validation humaine** : reprendre une tâche suspendue | une tâche en attente est simplement un état persisté de plus ; aucun redémarrage ne perd de travail |
| **Montée en charge** | passer de 1 à 50 exécutants en parallèle ne change pas le modèle, seulement le nombre de consommateurs de la file |

### La boucle d'un pas

```
charger l'état du run
        │
assembler le contexte  (ADN → profil entreprise → faits appris → tâche)
        │
demander la prochaine action au Model Gateway
        │
soumettre l'action au Policy Engine
        │
   ┌────┴────┐
exécuter   suspendre (attente d'accord humain)
        │
journaliser dans `execution_event`
        │
replanifier le pas suivant, ou terminer
```

Rien n'est conservé en mémoire entre deux pas. L'état complet se reconstruit depuis la base.

---

## Idempotence — obligatoire, dès le premier envoi

Toute action à effet extérieur porte une **clé d'idempotence**. Un rejeu (panne, dépassement de
délai, double battement, reprise après interruption) ne doit **jamais** produire deux fois le
même effet.

Sans cela, la première panne réelle se traduit par un prospect contacté deux fois — c'est-à-dire
par un client qui perd confiance dans son employé. C'est l'un des deux seuls points de
l'architecture qui ne se rattrape pas après coup (l'autre étant l'isolation par entreprise).

---

## Policy Engine — les niveaux d'autonomie

Chaque action est d'abord classée par **effet** :

| Classe d'effet | Exemple | Défaut raisonnable |
|---|---|---|
| lecture | consulter des prospects | automatique |
| écriture interne | mettre à jour une fiche | automatique |
| **effet extérieur irréversible** | envoyer un email, publier | **jamais automatique par défaut** |

Quatre niveaux d'autonomie : `auto`, `notifier`, `confirmer`, `confirmer une fois`.

**`confirmer une fois`** est le mode recommandé à la vente : la première action d'une classe
d'effet demande l'accord du dirigeant ; une fois accordé, les suivantes s'exécutent seules,
jusqu'à révocation. Le client construit sa confiance en un seul geste, et peut revenir en
arrière à tout moment.

**Règle non négociable :** l'irréversible n'est jamais en `auto` par défaut, quel que soit le
niveau d'autonomie choisi par le client à l'inscription.

**Le Policy Engine est aussi la conformité.** Il constitue le droit d'intervention humaine
exigé pour une décision automatisée — il doit être documenté comme tel.
Voir [`10-securite-rgpd.md`](10-securite-rgpd.md).

---

## Model Gateway — point de passage unique

**Aucun appel de modèle ne se fait ailleurs.** Un employé ne connaît jamais son fournisseur.

**Responsabilités :**

1. **Routage par classe de données.** Une requête portant des données réelles d'un client ne
   peut pas partir vers un fournisseur qui n'est pas contractuellement « sans entraînement ».
   Le fournisseur incompatible est **sauté**, pas tenté puis rejeté. C'est ce qui permet
   d'utiliser un tier gratuit pour la démonstration sans jamais y exposer un client.
2. **Chaîne de repli** ordonnée entre fournisseurs — déclenchée **uniquement** sur un
   dépassement de quota ou une panne passagère. Jamais sur une erreur logique, qui doit
   remonter immédiatement : sinon un vrai bug se cache derrière des tentatives silencieuses.
3. **Comptage.** Chaque appel incrémente le compteur de l'entreprise et le compteur global du
   fournisseur. C'est ce comptage qui rend les quotas de formule réels et non décoratifs.
4. **Plafond dur** par entreprise et par jour. Au-delà, la tâche est **reportée avec un message
   clair**, jamais dégradée en silence.

---

## Interaction avec un humain ≠ run autonome

Le diagnostic sur la vitrine est une **conversation en aller-retour**, pas un run autonome.
Il ne doit pas passer par le runtime : il appelle le Model Gateway directement, un tour à la
fois, sans tâche ni file. Contorsionner le runtime pour un dialogue interactif complique les
deux. Voir [`07-parcours-produit.md`](07-parcours-produit.md).

---

## Ce qui déclenche le travail

En V1, un **battement planifié** (planificateur interne à la base, ou déclencheur externe
appelant un point d'entrée signé) réveille le système, qui prend les travaux dus dans la file
par ordre de priorité.

Conséquence à assumer dans le discours client : les employés travaillent **par battements**,
pas en continu. Dire « Carter travaille chaque jour » est vrai ; promettre du temps réel serait
faux. La périodicité exacte est une décision ouverte (D4).
