# 15 — Décisions non tranchées

> À lire **avant de commencer un lot**. Si une décision de cette liste bloque ton travail :
> **demande au fondateur, ne choisis pas à sa place.**
>
> Quand une décision est tranchée : la retirer d'ici et créer une entrée dans [`adr/`](adr/).

---

## ⚠️ D1 — Périmètre métier de la V1 (bloque tout)

**Question :** combien de métiers réels au lancement ?

| Option | Conséquence |
|---|---|
| **1 métier : Commercial** *(recommandé)* | prospection, relance, suivi — autonome et mesurable. Le diagnostic reste honnête : hors périmètre → liste d'attente. |
| 2 métiers : Commercial + Support | vraie recommandation différenciée, prépare la collaboration. Double le travail d'outils et de mesures. |
| 4 métiers | risque élevé : quatre métiers superficiels valent moins qu'un seul qui produit du chiffre d'affaires. |

**Recommandation : un seul, Commercial.** Le registre de métiers étant en données, en ajouter
un plus tard est une donnée plus un jeu d'outils — jamais une refonte.

**Bloque :** le lot 2, donc tout ce qui suit.

---

## D2 — Prix de Sentio Start

Nécessaire pour calculer le ROI affiché au client et pour connaître le seuil au-delà duquel
l'inférence coûte plus que l'abonnement ne rapporte.
**Bloque :** lots 5 et 6.

---

## D3 — Objectif de conversion : achat immédiat, ou audit/essai gratuit

**Recommandation :** un premier client servi à la main vaut plus qu'un tunnel entièrement
automatisé. **Bloque :** lot 5.

---

## D4 — Périodicité réelle du travail des employés

Continu, quotidien, hebdomadaire ?
**Recommandation :** quotidien en V1 — compatible €0, lisible pour le client, suffisant en
prospection. Détermine aussi le discours (« Carter travaille chaque jour »).
**Bloque :** lot 3.

---

## D5 — Source des prospects pour le métier commercial

Donnée fournie par le client / enrichissement externe / mixte ?
**Recommandation :** démarrer sur la donnée fournie par le client — zéro coût, zéro
dépendance, zéro risque juridique. **Bloque :** lot 2.

---

## D6 — Emails envoyés depuis le domaine du client, ou depuis Sentio

**Recommandation :** depuis le domaine du client (délivrabilité et légitimité), mais cela
impose une configuration technique à l'inscription — friction réelle à arbitrer.
**Bloque :** lot 2.

---

## D7 — Niveau d'autonomie par défaut à la vente

**Recommandation :** `confirmer une fois` sur l'irréversible. **Bloque :** lot 3.

---

## D8 — Quand l'auto-apprentissage modifie le **profil entreprise**, s'applique-t-il seul ?

| Option | Conséquence |
|---|---|
| **Auto + notification** *(recommandé)* | conforme à « l'employé évolue seul », le dirigeant garde la possibilité de corriger |
| Proposition validée par le dirigeant | plus sûr, mais transforme l'employé en formulaire à valider |
| Auto silencieux | le client découvre un jour que son employé « croit » quelque chose de faux |

Dans tous les cas, le client conserve le droit d'écriture et de retrait sur **l'intégralité**
des deux tables de mémoire. Ne concerne **jamais** l'ADN.
**Bloque :** lot 7.

---

## D9 — Rétention du journal d'exécution

**Recommandation :** 12 mois puis anonymisation — arbitrage entre volume de base gratuit et
preuve réglementaire. **Bloque :** lot 0 (le schéma doit prévoir le champ de rétention).

---

## D10 — Le fondateur code-t-il seul l'ensemble ?

Détermine l'ordre des lots : automatisation complète d'abord, ou vendable d'abord avec un
premier client servi à la main. Voir [`12-roadmap.md`](12-roadmap.md).
**Bloque :** l'ordonnancement, pas un lot précis.

---

## D11 — Marque unique ou coexistence avec un produit antérieur

**Recommandation :** un seul nom. Deux marques pour un fondateur seul divisent l'attention
pour zéro bénéfice.

---

## Comment trancher

Pour chaque décision : écrire **ce qu'on gagne, ce qu'on perd, et à quelle condition on
reviendrait dessus**. Puis créer l'entrée dans [`adr/`](adr/). Une décision non écrite est une
décision qui sera reprise à l'envers dans six mois.
