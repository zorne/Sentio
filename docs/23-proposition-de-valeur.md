# 23 — Proposition de valeur

> À lire si tu travailles sur : le discours commercial, une promesse client, une priorité de
> développement, ou si tu hésites entre deux options.
>
> Ce fichier dit **ce qui crée la valeur de Sentio**. Chaque promesse y est reliée à ce qui la prouve
> dans le dépôt. Une promesse sans preuve technique est un slogan — et un slogan se copie.

---

## Les six promesses

La valeur de Sentio n'est pas dans une fonctionnalité inédite. Elle est dans **l'expérience du
client et le résultat obtenu**, tenus par six engagements.

### 1. Un employé conseillé selon les besoins réels, pas choisi dans un catalogue

Le dirigeant décrit sa situation, Sentio l'analyse et propose l'employé adapté, calibré sur son
secteur et son objectif. Le client ne compare pas, ne configure pas, ne paramètre pas.

**Ce qui le prouve :** moteur de règles déterministe, jamais le modèle
([`07-parcours-produit.md`](07-parcours-produit.md)) · calibrage réel du profil entreprise
([`adr/0010`](adr/0010-diagnostic-calibrage.md)) · profils sectoriels
([`adr/0011`](adr/0011-generaliste-profils-sectoriels.md)) · honnêteté hors périmètre (R14).

### 2. Un dashboard qui montre les résultats sans mentir

Aucun chiffre affiché sans une ligne en base qui le justifie. Le chiffre d'affaires attribué repose
sur les ventes que le client confirme lui-même, dans une fenêtre annoncée. Les estimations sont
signalées comme telles.

**Ce qui le prouve :** invariant 4 ([`AGENTS.md`](../AGENTS.md)) · modèle d'attribution et provenance
de chaque valeur ([`09-metriques-roi.md`](09-metriques-roi.md)) · `TEST-08`, qui échoue si un seul
chiffre n'est pas traçable · état vide soigné plutôt qu'une jauge à zéro.

> **C'est l'engagement le plus difficile à copier** — non pas techniquement, mais commercialement.
> Afficher le revenu réellement attribué expose les mois faibles. Les concurrents ne peuvent pas se
> le permettre ; Sentio le peut, parce que ses invariants l'y obligent déjà.

### 3. Un dashboard simple à comprendre

Le dirigeant voit ses résultats, sa progression, ses employés. Jamais la mécanique : ni modèle, ni
outil, ni enchaînement technique.

**Ce qui le prouve :** [`07-parcours-produit.md`](07-parcours-produit.md) impose la simplicité comme
règle · [`17-lexique.md`](17-lexique.md) est vérifié automatiquement en intégration continue
(`CONF-08`) · les repères de performance situent les chiffres au lieu de laisser le client les
interpréter seul (`DASH-18`).

### 4. Des employés qui s'améliorent seuls

L'employé tire des enseignements de son travail, teste des variantes, et conserve ce qui fonctionne
sur le marché du client.

**Ce qui le prouve :** [`08-evolution-apprentissage.md`](08-evolution-apprentissage.md) · variantes
sélectionnées par les résultats mesurés · **aucune notification d'évolution sans ligne
`strategy_change`** — l'invariant qui empêche de simuler le progrès.

### 5. Une mémoire qui rend l'employé meilleur avec le temps

Ce que l'employé apprend sur l'entreprise du client lui reste acquis. Le client peut consulter,
corriger et retirer ce que son employé a appris.

**Ce qui le prouve :** [`04-contextes-memoire.md`](04-contextes-memoire.md), la pièce centrale ·
traçabilité par ligne (auteur, date, tâche source, statut) · aucun apprentissage entre entreprises,
ligne rouge de confidentialité.

### 6. La qualité du travail plutôt que le volume

Peu de prospects, chacun choisi et justifiable. C'est l'inverse de ce que vend le marché, et les
données donnent raison à l'inverse.

**Ce qui le prouve :** compromis C13 · qualification en P0 · plafonds de volume et garde-fous de
délivrabilité · motif de sélection journalisé (`METIER-22`).

---

## Le calendrier a été aligné sur les promesses

Les promesses 4 et 5 — l'amélioration automatique et la mémoire qui s'enrichit — vivaient dans le
**lot 7**, seul lot sans aucune tâche P0 et explicitement décalable après le premier client. Deux des
six promesses n'auraient donc pas été tenues au lancement.

**Corrigé le 2026-07-28** : trois tâches sont passées **P0** et doivent être faites **avant la
vente** —

| Tâche | Ce qu'elle rend vrai |
|---|---|
| `EVOL-01` | l'employé écrit ce qu'il apprend : la mémoire s'enrichit réellement |
| `EVOL-05` | chaque évolution réelle laisse une ligne `strategy_change` |
| `EVOL-06` | aucune notification d'évolution sans cette ligne |

Le reste du lot 7 demeure décalable. La règle qui a présidé à cet arbitrage vaut pour toute promesse
future : **vendre une promesse que le produit ne tient pas encore est exactement le mensonge que
[`AGENTS.md`](../AGENTS.md) proscrit** et que C8 identifie comme « le plus facile à commettre dans ce
produit ». Une promesse retirée du discours coûte moins cher qu'une promesse non tenue.

---

## Ce qui n'est pas un différenciateur

À savoir pour ne pas construire le discours dessus :

- **L'employé numérique avec un prénom et un visage.** C'est ce que font les concurrents les plus
  visibles — et les plus résiliés ([`21-concurrence.md`](21-concurrence.md)). La fiction ne suffit pas.
- **Le fait d'utiliser des modèles performants.** Tout le monde y a accès, et le client ne doit
  jamais les voir.
- **La rapidité ou le volume.** Sentio est structurellement lent et peu volumineux. C'est un choix,
  pas un argument.

La valeur est dans l'expérience et le résultat prouvé. Le reste est du décor.
