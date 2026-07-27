# 17 — Lexique

> À lire si tu écris **le moindre texte visible par un client** : interface, email,
> notification, message d'erreur, page légale.
>
> Le vocabulaire n'est pas cosmétique. C'est le produit (§2 de la vision).

---

## Interdit dans tout texte visible par un client

| Interdit | Pourquoi |
|---|---|
| IA, intelligence artificielle | le client ne doit jamais avoir l'impression d'utiliser une IA |
| bot | déshumanise et dévalorise |
| assistant | Sentio ne vend pas un assistant, mais un collaborateur |
| agent | vocabulaire technique interne, jamais client |
| automation, automatisation | vend un outil, pas un collaborateur |
| GPT, modèle, prompt, token | complexité technique que le client ne doit jamais voir |
| workflow, pipeline, run, tâche système | idem |

## Imposé

| Employer | Plutôt que |
|---|---|
| employé numérique, collaborateur | agent, bot, IA |
| recruter, recrutement | acheter, souscrire, activer |
| équipe | flotte, parc, instances |
| performance, résultats, progression | métriques, KPI techniques |
| fiche employé | profil de configuration |
| mission, objectif, périmètre | prompt système, scope, capacités |
| Sentio recommande | l'algorithme propose |
| votre employé a appris | le modèle a été mis à jour |

---

## Nommer un employé

Prénom + métier, comme on parlerait d'un collaborateur :

> ✅ Carter Commercial · James Support · Emma Comptabilité · Leo Marketing
> ❌ Agent IA Commercial · Assistant commercial · Bot de prospection

L'identité est **choisie automatiquement par Sentio**, jamais par le client, et **jamais
réutilisée** entre deux employés.

---

## Ton

- Sobre, professionnel, sans emphase commerciale.
- Le registre est celui d'un cabinet, pas d'une plateforme technologique.
- Pas de longs textes : chaque phrase doit apporter quelque chose.
- On parle de résultats et de personnes, jamais de fonctionnalités.

---

## Deux zones de vocabulaire, à ne jamais mélanger

| Zone | Langue | Vocabulaire |
|---|---|---|
| Code, tables, modules, journal technique | anglais | `employee`, `tenant`, `task`, `capability` — vocabulaire technique normal |
| Interface, emails, notifications, documents | français | lexique ci-dessus, strictement |

Il est parfaitement normal qu'une table s'appelle `employee_definition` pendant que
l'interface parle de « la fiche de Carter ». Ce qui ne l'est pas : qu'un mot technique
traverse la frontière.

---

## Contrôle automatique

Les textes visibles vivent dans **un seul endroit** (fichier de libellés), et une vérification
d'intégration continue rejette les mots interdits.

C'est gratuit à mettre en place, et c'est le seul moyen d'éviter la dérive : sous pression,
« l'IA a analysé votre demande » finit toujours par apparaître dans un message d'erreur écrit
à la va-vite.

---

## Cas particuliers

- **Pages légales** : la loi peut imposer d'expliquer qu'un traitement automatisé est en jeu.
  Dans ce cas, la clarté juridique prime sur le lexique. Ce sont les seules pages où « décision
  automatisée » et « traitement algorithmique » sont non seulement autorisés mais nécessaires.
- **Messages d'erreur** : ils comptent comme texte client. « Votre employé n'a pas pu terminer
  sa mission, il reprendra demain » — pas « erreur de quota du fournisseur ».
