# 01 — Contraintes et conflits

> À lire si tu travailles sur : n'importe quelle décision technique.
> Ce fichier explique **pourquoi** l'architecture est ce qu'elle est.

---

## Les décisions cadres, déjà tranchées

| Sujet | Décision | Conséquence |
|---|---|---|
| Base de départ | **Repartir de zéro** — aucun code antérieur repris | ~3-4 semaines de reconstruction, assumées |
| Coût de l'inférence | **Clés de la plateforme** (tiers gratuits), pas de clé fournie par le client | le client ne voit jamais un modèle — mais le quota est partagé |
| Fournisseur d'inférence | **Fournisseur européen à €0**, secours et sortie payante en UE aussi | → [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md), [`adr/0009`](adr/0009-fournisseur-inference-ue.md) |
| Budget | **€0 strict** | pas de worker permanent, pas de file managée, pas de sauvegarde fine |
| Mémoire | **Deux contextes** dans Supabase | → [`04-contextes-memoire.md`](04-contextes-memoire.md) |
| Périmètre métier V1 | **Un seul métier : Commercial** | → [`adr/0008-perimetre-v1-commercial-seul.md`](adr/0008-perimetre-v1-commercial-seul.md) |

---

## Les quatre conflits entre la vision et le budget

L'architecture ne nie pas ces conflits, elle les rend gérables.

**1. « Les employés travaillent seuls » vs. aucun serveur permanent.**
Le €0 n'offre aucun processus qui tourne en continu. Réponse architecturale : un run est une
**machine à états persistée**, avancée pas à pas par un battement planifié. Rien n'est gardé en
mémoire, tout est repris depuis la base. → [`05-runtime-employe.md`](05-runtime-employe.md)

**2. « Le prix est indépendant des modèles » vs. quota gratuit partagé.**
La plateforme absorbe le coût. Avec des clés en tier gratuit, la capacité totale de **tous les
clients réunis** est plafonnée par un quota unique. Réponse : le **Model Gateway** tient des
compteurs par entreprise et par fournisseur, applique des plafonds durs et sépare trois
enveloppes. Le facteur limitant est un **débit par minute**, pas un volume quotidien — la file
doit lisser les appels dans le temps.
→ [`11-exploitation.md`](11-exploitation.md), [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md)

**3. « Les employés deviennent plus performants » vs. très peu de volume.**
Une boucle d'amélioration mesurée a besoin de données. Avec 1 à 5 clients, le gain est lent et
statistiquement faible. Réponse : dire ce que l'évolution est vraiment, et n'annoncer une
évolution que si elle est enregistrée. → [`08-evolution-apprentissage.md`](08-evolution-apprentissage.md)

**4. « Le dashboard affiche le CA généré » vs. impossibilité de le prouver.**
Aucun système ne peut démontrer seul qu'une vente vient de l'employé. Réponse : un modèle
d'attribution déclaratif, confirmé par le client, avec une fenêtre annoncée.
→ [`09-metriques-roi.md`](09-metriques-roi.md)

---

## Ce que « €0 strict » interdit concrètement

- Pas de processus permanent (worker, serveur applicatif dédié).
- Pas de file de messages managée : la file vit dans Postgres.
- Pas de base vectorielle : la mémoire est faite de faits structurés.
- Pas de sauvegarde à restauration fine tant qu'on reste sur l'offre gratuite.
- Pas de génération d'images, de voix, ou d'appel de modèle coûteux dans une boucle.
- Pas de service tiers payant sans arbitrage explicite du fondateur.

## Ce que « €0 strict » ne doit jamais faire sacrifier

- L'isolation entre entreprises.
- L'idempotence des actions à effet extérieur.
- La règle « donnée réelle → fournisseur sans entraînement », par clause contractuelle ou par
  opt-out documenté et vérifié.
- L'honnêteté des chiffres affichés.

Ces quatre points ne sont pas rattrapables après coup. Le reste l'est.

---

## Le €0 a une date de péremption

Il casse au premier client payant, pour des raisons juridiques autant que techniques
(usage commercial souvent interdit sur les offres gratuites, absence de sauvegarde
restaurable). Les seuils précis sont dans [`11-exploitation.md`](11-exploitation.md).

**L'endroit où rompre le €0 en premier, si un seul euro doit être dépensé :** une clé
d'inférence payante plafonnée, chez un fournisseur européen — de l'ordre de 0,05 à 1,01 $ par
million de tokens en entrée. La dépense lève d'un coup la limite de débit, la zone grise
juridique de l'usage commercial, et l'assouplissement de l'invariant « sans entraînement ».
Chiffres et fournisseurs : [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md).

---

## Règle sur les secrets

Aucune clé, aucun jeton, aucun identifiant dans ce dépôt — y compris dans un fichier
d'exemple, un commentaire ou une capture. Les secrets vivent uniquement dans les variables
d'environnement de l'hébergeur. Une clé qui a transité par un chat, un ticket ou un commit
est **compromise** et doit être régénérée.
