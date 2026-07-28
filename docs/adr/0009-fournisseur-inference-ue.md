# ADR-0009 — Fournisseur d'inférence : conformité UE avant qualité de modèle

**Date :** 2026-07-28
**Statut :** acceptée

## Contexte

[`ADR-0005`](0005-cles-plateforme-classe-de-donnees.md) a tranché que la plateforme paie
l'inférence et route par classe de données. Elle n'a jamais dit **avec qui**. Depuis, trois
documents raisonnent sur un fournisseur qui n'existait nulle part :

- [`../16-compromis.md`](../16-compromis.md) C2 affirme qu'il existe « un seul fournisseur
  conforme » et un « fournisseur de secours gratuit », sans les identifier ;
- [`../11-exploitation.md`](../11-exploitation.md) fixe une alerte à « 60-70 % du quota
  journalier » — pourcentage d'un nombre inconnu, donc non instrumentable ;
- [`../10-securite-rgpd.md`](../10-securite-rgpd.md) exige un contrat de sous-traitance signé
  avec le fournisseur de modèle avant le premier client réel.

Le choix n'était ni tranché, ni suivi dans [`../15-decisions-ouvertes.md`](../15-decisions-ouvertes.md).

L'état du marché au 2026-07-28 est détaillé dans
[`../19-fournisseurs-modeles.md`](../19-fournisseurs-modeles.md). Son constat central :
**aucun fournisseur ne réunit €0 récurrent, non-entraînement et hébergement UE.** On en obtient
deux sur trois.

## Décision

**Un fournisseur européen à €0, au prix d'un assouplissement d'invariant.**

1. **Principal — Mistral, tier *Experiment*.** Entité française, inférence en UE, ~1 Md
   tokens/mois, ~2 requêtes/minute. La limite de débit est compatible avec un runtime avancé par
   battements.
2. **Secours — OVHcloud AI Endpoints, tier anonyme.** Gravelines, zéro rétention. Tests et
   développement uniquement.
3. **Sortie payante — OVHcloud AI Endpoints au token**, quand le €0 casse. Reste en UE.

**Groq est écarté** bien qu'étant le seul fournisseur gratuit à interdire *contractuellement*
l'entraînement, sans distinction gratuit/payant : il est américain, donc transfert hors UE,
clauses contractuelles types et analyse d'impact. C'est un arbitrage juridique, pas technique.

**Google AI Studio et Cerebras sont exclus définitivement** : le premier entraîne sur son tier
gratuit, le second interdit l'usage commercial.

## Pourquoi

Le critère décisif est le coût de conformité, pas la qualité du modèle. Sentio est un fondateur
seul avec un budget nul : un fournisseur hors UE ajoute un transfert international à instruire, au
moment précis où il faut déjà signer des contrats de sous-traitance, tenir un registre et produire
une analyse d'impact pour décision automatisée. Rester en UE supprime toute cette branche.

Le choix ne coûte presque rien en capacité parce que **Sentio n'a jamais promis de temps réel**
(C5) : le travail est asynchrone par construction, donc une limite de débit basse est absorbée par
la file, là où elle serait rédhibitoire pour un produit interactif.

## Compromis assumé

**1. L'invariant 5 est assoupli.** [`../../AGENTS.md`](../../AGENTS.md) exigeait un fournisseur
« contractuellement sans entraînement ». Sur le tier gratuit retenu, le non-entraînement s'obtient
par un **opt-out en console**, activable et révocable — c'est plus faible qu'une clause
contractuelle. L'invariant devient : *« sans entraînement, par clause contractuelle ou par opt-out
documenté, vérifié et daté »*.

Conséquence opérationnelle : tant que l'opt-out n'est pas activé et prouvé, le compte est un
fournisseur **non conforme** et aucune donnée réelle ne doit y transiter. C'est un préalable de
mise en service, pas une bonne pratique.

C'est le vrai coût de cette décision, et il est inscrit ici pour qu'il ne se perde pas.

**2. Sentio ne tourne pas sur les meilleurs modèles ouverts.** GLM-5.2, Kimi K3, MiniMax M3 et
DeepSeek V4 dominent les classements de juillet 2026 ; aucun n'est servi par le fournisseur
retenu. Le produit tourne sur des modèles bons, pas sur les meilleurs. Ce compromis se lève au
passage au payant.

**3. Le facteur limitant change de nature.** C1 supposait un plafond en volume quotidien. Le
plafond réel est un **débit par minute**. La file doit lisser les appels dans le temps, et la
surveillance doit compter en requêtes/minute glissantes, pas seulement en tokens/jour.

**4. Le secours n'en est pas un.** La démonstration étant scriptée (C6) et le diagnostic
manipulant de la donnée réelle dès la première question, le fournisseur de secours ne sert que les
tests internes. Le nommer ne crée aucune redondance de production. C2 reste vrai mot pour mot.

## Quand revisiter

- **Au premier client payant** — bascule vers OVHcloud au token, et l'assouplissement de
  l'invariant 5 tombe : le payant restaure une garantie contractuelle.
- **À 60-70 % du quota consommé**, désormais mesurable en requêtes/minute.
- **Si le fournisseur principal change sa politique de données** — le traiter comme non conforme
  jusqu'à preuve du contraire, jamais l'inverse.
- **Si la latence du diagnostic de la vitrine devient inacceptable** — c'est le seul point de
  tension du choix, et le seul endroit où Groq redeviendrait tentant.
