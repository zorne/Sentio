# 08 — « Les employés évoluent seuls »

> À lire si tu travailles sur : l'apprentissage, la réflexion après run, les stratégies,
> les notifications d'évolution.
>
> Prérequis : [`04-contextes-memoire.md`](04-contextes-memoire.md).

---

## Ce que ce n'est pas

**Ce n'est pas du ré-entraînement de modèle. Aucun poids n'est jamais modifié.**

L'apprentissage passe par ce que l'employé **lit** au prochain run, pas par ce qu'il *est*.
C'est ce qui rend l'évolution instantanée, réversible, auditable et gratuite — trois propriétés
qu'un ré-entraînement n'aurait pas.

---

## Ce que c'est, concrètement

### 1. Réflexion après run

À la fin de chaque run, l'employé résume son journal en **0 à 3 faits courts**, écrits dans
`learned_fact`.

> « Les dirigeants de ce secteur répondent surtout le matin. »
> « L'accroche centrée sur le coût a mieux fonctionné que celle centrée sur le temps. »

**La réflexion ne doit jamais faire échouer la tâche.** Si elle échoue (quota épuisé, erreur du
modèle), on journalise un avertissement et on continue. **La mémoire est un bonus, jamais une
condition de succès.** Cette règle vient d'un incident réel vécu sur un projet antérieur : une
tâche accomplie était rapportée comme échouée parce que la réflexion d'après-coup avait planté.

### 2. Variantes de stratégie

Un employé dispose de plusieurs approches sur un même geste métier : angle d'accroche, moment
de relance, ordre de qualification. Le résultat mesuré (`outcome`) fait monter la variante qui
gagne.

C'est ici que se trouve la vraie amélioration mesurable — pas dans les faits appris, qui ne
font qu'informer.

### 3. Traçabilité de l'évolution

Toute évolution réelle écrit une ligne `strategy_change` : quoi, quand, sur la base de quelle
mesure.

---

## L'invariant le plus facile à violer

> **Une notification « Évolution » n'est émise que s'il existe une ligne `strategy_change`
> correspondante.**

Sinon c'est une notification décorative — c'est-à-dire un **mensonge à un client payant**.

C'est le mensonge le plus tentant de tout le produit : il rend l'interface vivante à coût nul.
Ne le fais pas. Un client qui comprend que « votre employé a progressé » s'affiche tous les
mardis quoi qu'il arrive n'a plus aucune raison de croire les autres chiffres.

---

## Ce que l'apprentissage peut et ne peut pas toucher

| Cible | Autorisé ? |
|---|---|
| `learned_fact` | ✅ oui, c'est son rôle |
| `company_profile` | ✅ oui — mode d'application à trancher (décision D8) |
| `strategy_change` | ✅ oui, c'est sa trace |
| **`employee_definition` (ADN)** | ❌ **jamais** — aucun chemin de code ne doit exister |
| Les capacités autorisées de l'employé | ❌ jamais — elles viennent de l'ADN |

Un employé ne peut donc **jamais apprendre à sortir de son métier**. Il peut seulement devenir
meilleur dedans. C'est exactement ce que demande le §11 de la vision.

---

## L'honnêteté à tenir vis-à-vis du client

Avec peu de volume, l'amélioration mesurée est **lente et statistiquement faible**. Cinq
prospects contactés ne permettent aucune conclusion sur une stratégie.

Promettre une progression visible dès la première semaine serait faux. Le discours juste :
l'employé accumule de l'expérience sur votre entreprise dès le premier jour, et les
optimisations mesurées arrivent avec le volume.

---

## Pistes explicitement écartées pour la V1

| Piste | Pourquoi écartée |
|---|---|
| Base vectorielle / recherche sémantique | les faits structurés couvrent l'essentiel du besoin ; à reconsidérer si un vrai besoin de non-structuré apparaît |
| Ré-entraînement, ajustement fin | coût, irréversibilité, aucun gain face à une bonne mémoire |
| Apprentissage inter-entreprises | une entreprise ne doit jamais bénéficier des données d'une autre — c'est une ligne rouge de confidentialité, pas une optimisation à discuter |
