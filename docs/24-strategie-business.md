# 24 — Stratégie business : positionnement, lancement, objectifs

> À lire si tu travailles sur : le discours commercial, le modèle économique, la stratégie de
> lancement, ou avant de recruter.
>
> **Document interne, écrit par le fondateur le 2026-07-29.** Il emploie du vocabulaire interdit
> côté client ([`17-lexique.md`](17-lexique.md)) et des chiffres de prix que la règle de
> `projet.md:422` exclut de la documentation produit. C'est délibéré : ce fichier est le seul endroit
> du dépôt où ces éléments ont leur place, précisément pour qu'ils n'apparaissent nulle part ailleurs.

---

## Positionnement

**Ne pas dire :** « une plateforme de création d'agents IA » — ce marché devient une commodité, et
c'est le segment le plus encombré et le plus résilié
([`21-concurrence.md`](21-concurrence.md)).

**Dire :** *« la façon la plus simple pour une entreprise d'intégrer des employés numériques »* ou
*« Sentio permet de recruter, gérer et faire évoluer ses employés numériques »*.

La différence n'est pas le modèle utilisé — elle ne se voit d'ailleurs jamais
([`00-vision.md`](00-vision.md)). Elle est dans l'expérience : simplicité, accompagnement,
personnalisation, confiance, évolution automatique. C'est exactement ce que
[`23-proposition-de-valeur.md`](23-proposition-de-valeur.md) détaille et relie à des preuves
techniques — ce document-ci en est le pendant commercial.

**Le client doit ressentir :** *« je viens d'embaucher quelqu'un qui travaille avec moi »*, jamais
*« je viens de configurer un outil technique »*.

---

## Généraliste sur les métiers, pas sur les secteurs

Ce texte généralise sur les **métiers** (marketing, commercial, support, administratif) — chacun
avec sa propre définition (`employee_definition`), là où [`adr/0011`](adr/0011-generaliste-profils-sectoriels.md)
généralise sur les **secteurs** au sein d'un même métier. Les deux se complètent, ils ne se
recouvrent pas :

| Axe | Ce qui varie | Décidé |
|---|---|---|
| **Métier** | Commercial, Marketing, Support, Administratif — chacun un ADN différent | V1 : **Commercial seul** ([`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md)). Les autres métiers sont l'horizon décrit ici, pas la V1 |
| **Secteur** | vocabulaire, cycle d'achat, objections d'un même métier | généraliste dès la V1, via `sector_profile` |

**À ne pas confondre en vendant :** le discours d'ensemble de Sentio peut légitimement parler de
« un employé numérique qui s'adapte à votre entreprise » — c'est la vision, et depuis
[`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md) c'est aussi l'architecture. Mais ce
qui borne la promesse n'est plus un catalogue de métiers : c'est **ce que la bibliothèque d'actes
sait réellement faire**. Ne jamais laisser un prospect croire que Lady couvre un domaine dont les
actes ne sont pas écrits. C'est la même règle que [R14](14-recommandations.md) : dire honnêtement
ce qui sort du périmètre disponible, et le mécanisme reste `hors_perimetre` + liste d'attente.

---

## Modèle économique — hypothèse de travail, pas une décision

**Ces prix ne tranchent pas D2**, encore ouverte dans
[`15-decisions-ouvertes.md`](15-decisions-ouvertes.md). Ils servent de point de départ à la
discussion, cohérents avec la fourchette observée sur le marché (100 à 800 €/mois,
[`21-concurrence.md`](21-concurrence.md)) et avec la règle projet — prix fixe, indépendant des
modèles et des outils (`projet.md:367-368`).

| Offre | Prix envisagé | Cible |
|---|---|---|
| Starter | 100 €/mois | petite entreprise qui découvre les employés numériques |
| Business | 500 €/mois | plusieurs employés numériques en activité |
| Enterprise | 1 500 à 2 500 €/mois | besoins avancés, accompagnement, personnalisation |

**Tension à ne pas relâcher :** `projet.md:422` recommande de **ne jamais mettre de chiffre dans la
documentation produit** — seulement Start, Growth, Scale avec leurs caractéristiques. Ces prix
n'ont donc leur place que dans ce document interne, dans un outil de facturation, ou dans une offre
commerciale — jamais dans `docs/`, `AGENTS.md`, `projet.md` ou la vitrine.

**Correspondance avec les formules du dépôt :** Starter/Business/Enterprise ci-dessus recoupent
Start/Growth/Scale de [`00-vision.md`](00-vision.md), sans nécessairement leur être identiques —
à clarifier au moment de trancher D2, pour ne pas faire vivre deux nomenclatures en parallèle.

---

## Stratégie de lancement

**Phase 1 — dix partenaires fondateurs.** Objectif : retours d'usage, amélioration produit,
témoignages, études de cas. Pas la croissance — la validation.

Cette phase correspond à la **phase 10** de [`20-plan-action.md`](20-plan-action.md) (acquisition du
premier client), qu'elle précise : dix clients servis de près, pas un seul. Le plan d'action
recommandait déjà un accompagnement manuel du tout premier client — cette stratégie l'étend
explicitement à dix.

**Phase 2 — croissance.** Contenu (LinkedIn, YouTube, SEO), démonstrations, partenariats,
influenceurs. À n'engager qu'après la phase 1 : vendre au volume un produit non validé reproduit
exactement le mode d'échec documenté en [`21-concurrence.md`](21-concurrence.md) — beaucoup de
volume, mauvaise conversion.

---

## Objectifs financiers — hypothèses, à réviser après les premiers résultats réels

| Horizon | Clients | MRR envisagé |
|---|---|---|
| 3 premiers mois | premiers clients, validation | 5 000 à 15 000 € |
| Année 1 | ~250 clients | 100 000 à 150 000 € |
| Année 2 | 800 à 1 500 clients | 500 000 € à 1 M€ |

À traiter comme des repères d'ambition, pas des prévisions engageantes — aucune ligne du dépôt ne
les mesure aujourd'hui, et [`09-metriques-roi.md`](09-metriques-roi.md) interdit précisément
d'afficher un chiffre non mesuré **au client**. La même discipline s'applique en interne : ne pas se
raconter une trajectoire que rien ne confirme encore.

**Condition explicite posée par le fondateur :** ces objectifs supposent un excellent produit, une
forte satisfaction client, une bonne rétention et une acquisition efficace — pas un acquis.

---

## Indicateurs prioritaires

| Indicateur | Cible | Pourquoi il prime |
|---|---|---|
| **Rétention** | 90 % de renouvellement annuel | le marché comparable tourne à 50-70 % de résiliation ([`21-concurrence.md`](21-concurrence.md)) — 90 % de rétention est l'inverse exact du mode d'échec dominant |
| **Satisfaction** | résultats obtenus, temps économisé, satisfaction ressentie | c'est ce que le modèle d'attribution de [`09-metriques-roi.md`](09-metriques-roi.md) est conçu pour mesurer honnêtement |
| **Activation** | part des clients qui utilisent réellement leur employé après inscription | signal précoce absent du dashboard actuel — à instrumenter |

**Ce qu'il manque au produit pour les mesurer :** aucune de ces trois métriques n'a de tâche dédiée
dans `backlog-v1.csv` aujourd'hui. La rétention et l'activation sont des mesures **internes**
(tableau de bord du fondateur), distinctes du dashboard **client** déjà spécifié — à ne pas
confondre au moment de les construire.

---

## Équipe — quand recruter

| Seuil de MRR | Recrutement | Mission |
|---|---|---|
| Avant 50 000 € | aucun | le fondateur porte produit, développement, marketing, ventes, relation client |
| ~50 000 € | Customer Success / opérations | accompagner les clients, améliorer leur expérience, remonter les retours |
| ~100 000 € | développeur, marketing, customer success | |
| ~250 000 € | équipe structurée | |

Cohérent avec [`adr/0001`](adr/0001-repartir-de-zero.md) : le risque du projet est commercial, pas
technique — le premier recrutement au seuil des 50 000 € est donc orienté client, pas ingénierie.

---

## Philosophie

Sentio ne vend pas de l'intelligence artificielle. Il vend une nouvelle manière de travailler :
chaque entreprise aura, à terme, des employés humains et des employés numériques, et Sentio veut
être la plateforme qui rend ce premier recrutement simple pour n'importe quelle entreprise.

La technologie sous-jacente changera vite et se copiera facilement — c'est le constat de
[`21-concurrence.md`](21-concurrence.md). Ce qui ne se copie pas : la marque, l'expérience, la
confiance construite mesure après mesure. C'est l'avantage que ce dépôt tout entier essaie de rendre
vrai, ligne de code après ligne de code.
