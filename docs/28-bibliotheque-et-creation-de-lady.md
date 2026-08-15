# 28 — La bibliothèque de capacités, et comment Lady est créée

> À lire si tu travailles sur : **les capacités, le diagnostic, la configuration, le runtime**.
>
> Décision fondatrice : [`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md), qui remplace
> [`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md).
>
> ⚠️ Règle de non-régression. Toute proposition faite à partir d'ici s'évalue contre une seule
> question : **renforce-t-elle un noyau généraliste configuré dynamiquement, ou ramène-t-elle vers
> des agents spécialisés par métier ?** Si c'est la seconde, elle ne s'implémente pas.

---

## 1. Le piège d'échelle

L'objectif « couvrir plusieurs métiers » a une lecture naïve et une lecture juste.

La naïve écrit les capacités du commercial, puis celles du RH, puis celles du comptable. Elle
échoue mécaniquement : le coût croît avec le nombre de métiers, chaque métier réintroduit des
quasi-doublons, et au troisième la bibliothèque **est** redevenue un catalogue d'agents
spécialisés — simplement déguisé en capacités.

La juste part d'un constat : les métiers ne diffèrent pas par leurs **actes**, mais par les
**objets** sur lesquels ces actes portent et par l'**ordre** dans lequel on les enchaîne. Relancer
un prospect sans réponse, relancer un candidat sans réponse et relancer une facture impayée sont le
même acte — *revenir vers une partie prenante restée silencieuse, en espaçant* — appliqué à trois
objets.

---

## 2. Les trois axes

La couverture ne vient pas d'une liste de capacités, mais du produit de trois axes indépendants,
chacun extensible sans toucher aux deux autres.

| Axe | Ce que c'est | Volume cible | Où il vit |
|---|---|---|---|
| **Acte** | Un verbe générique, sans métier ni objet dans son nom. La brique testée, versionnée, dotée d'un contrat et d'une classe d'effet. | ~30 | `capability`, table globale |
| **Objet** | L'entité métier de l'entreprise sur laquelle l'acte s'applique. | ~15 | par entreprise, porté par le tenant |
| **Moteur** | L'implémentation et le connecteur externe. Remplaçable sans toucher à un employé ([`adr/0006`](adr/0006-capacite-vs-outil.md)). | ouvert | `capability_binding` |

```text
   ACTES (≈30, génériques, versionnés)      OBJETS (≈15, par entreprise)
     relancer ─┐                             ┌─ prospect
   qualifier ──┤                             ├─ candidat
     rédiger ──┼──────►  ×  ◄───────────────┼─ facture
     classer ──┤                             ├─ demande entrante
    planifier ─┘                             └─ échéance
                        │
                        ▼
            CAPACITÉ RÉSOLUE À L'EXÉCUTION  « relancer(facture) »
                        │
                        ▼
            MOTEUR LIÉ PAR FORMULE  (capability_binding)
                        │
                        ▼
            CLASSE D'EFFET  →  Policy Engine  →  accord requis ?
```

Conséquence : **une trentaine d'actes croisés avec une quinzaine d'objets couvre le travail
quotidien de la plupart des fonctions support d'une PME**, sans qu'aucun métier n'existe nulle part.
Ajouter un métier ne coûte plus une bibliothèque : quelques objets et un connecteur.

---

## 3. La taxonomie : huit domaines, pas huit métiers

Un domaine est une famille de gestes, jamais un poste. Les cinq capacités existantes y sont
replacées.

| Domaine | Actes | Classe d'effet dominante | État |
|---|---|---|---|
| Recherche & sélection | `rechercher` `selectionner` `dedupliquer` `enrichir` | lecture | 1 sur 4 |
| Évaluation | `qualifier` `scorer` `trier` `detecter_anomalie` | écriture interne | 1 sur 4 |
| Communication sortante | `rediger` `envoyer` `relancer` `notifier` | externe irréversible | 2 sur 4 |
| Communication entrante | `accuser_reception` `router` `repondre` `escalader` | externe irréversible | à créer |
| Données & fiches | `mettre_a_jour` `rapprocher` `consolider` `archiver` | écriture interne | 1 sur 4 |
| Documents | `produire_document` `extraire` `classer` `verifier_completude` | écriture interne | à créer |
| Temps & échéances | `planifier` `rappeler` `replanifier` `surveiller_echeance` | externe réversible | à créer |
| Analyse & restitution | `synthetiser` `comparer` `rapporter` `alerter` | lecture | à créer |

### Comment les métiers en tombent

Aucune ligne du système ne connaît le mot « comptable ». Un métier n'est qu'un **motif de
composition**, lu après coup :

| Ce qu'un humain appellerait… | …est cette composition |
|---|---|
| Assistant commercial | `rechercher` + `qualifier` + `rediger` + `relancer` sur *prospect* |
| Assistant RH | `trier` + `accuser_reception` + `planifier` + `relancer` sur *candidature* |
| Assistant comptable | `extraire` + `classer` + `rapprocher` + `relancer` sur *facture* |
| Assistant support | `router` + `repondre` + `escalader` + `rapporter` sur *demande* |

`relancer` apparaît trois fois : écrit une fois, testé une fois, il sert trois métiers. C'est
l'économie recherchée.

### Limite qui appartient au Core, pas à une configuration

« Assistant comptable » n'est pas « expert-comptable ». La tenue de comptabilité est une profession
réglementée : Lady prépare, classe, rapproche et relance, elle ne certifie ni ne déclare. Cette
limite vit dans le **Lady Core** — aucun diagnostic ne peut la lever. Même chose pour le conseil
juridique, l'acte médical et le conseil financier personnalisé.

---

## 4. Ce qui garde la bibliothèque saine en grandissant

Quatre règles. Trois sont déjà mécaniques dans le dépôt et se conservent intégralement.

1. **Aucune capacité sans moteur pour une formule vendable.** Le bloc `do $$` de
   [`capability_binding`](../supabase/migrations/20260729120010_capability_binding.sql) fait déjà
   échouer le déploiement. C'est ce qui empêche de vendre une Lady qui ne peut pas travailler.
2. **Aucune capacité sans classe d'effet.** Elle vit dans `contract` et alimente le Policy Engine.
   Aucune valeur par défaut, aucune exception.
3. **Le verrou de capacité reste mécanique.**
   [`employee_capability`](../supabase/migrations/20260729120012_employee_capability.sql) garantit
   déjà qu'un employé ne peut appeler qu'une capacité qui lui est ouverte. La phrase de la migration
   — *« un commercial n'a physiquement pas d'accès à une capacité comptable »* — reste vraie ;
   simplement, ce n'est plus le métier qui décide de la liste, c'est la configuration.
4. **Aucune capacité n'entre dans le contexte du modèle si elle n'est pas activée.** Règle nouvelle,
   et c'est celle qui protège la qualité : 120 capacités injectées en entier détruiraient le
   raisonnement. `assembleContext` ne voit que les capacités de la configuration active.

---

## 5. Comment Lady est créée

Le principe est déjà écrit en base, en tête de
[`recommendation`](../supabase/migrations/20260729120027_recommendation.sql) : *« le modèle ne
choisit jamais le métier ; le métier sort d'un moteur de règles déterministe ; le modèle ne fait que
rédiger la justification. »* L'architecture généralise cette règle du métier à la configuration.

| # | Étape | Responsabilité | État |
|---|---|---|---|
| 1 | **Collecte** | Conversation avec le dirigeant → profil structuré : activité, taille, outils, processus, contraintes. | existe (`diagnostic_session`) |
| 2 | **Audit** | Profil → constats typés et indépendants : force, faiblesse, goulot, risque, opportunité. Chaque constat porte sa source et sa confiance. | à créer |
| 3 | **Diagnostic** | Constats → besoins priorisés : impact × faisabilité × couverture par la bibliothèque. Produit un classement, pas une phrase. | à créer |
| 4 | **Composition** | Moteur **déterministe**. Sélectionne missions et capacités selon les besoins classés. N'invente rien. | à créer |
| 5 | **Configuration** | Version figée : capacités activées, missions, priorités, autonomie, limites. Rattachée au diagnostic qui l'a produite. | à créer |
| 6 | **Justification** | Le modèle rédige l'explication au dirigeant, à partir d'une configuration *déjà décidée*. | existe |
| 7 | **Instanciation** | `employee` figé sur une version du Core + `employee_capability` dérivé de la configuration. | existe |

### La boucle, une fois Lady au travail

```text
  Configuration vN
        │
        ├──► missions ──► tasks ──► exécution ──► outcomes
        │                                            │
        │                                            ▼
        │                                      observation
        │                        (résultat vs objectif du dirigeant)
        │                                            │
        │                                            ▼
        │                                   nouveau diagnostic
        │                                            │
        │                                            ▼
        │                                 proposition de configuration
        │                                            │
        │                                            ▼
        │                                      Policy Engine
        │                              (selon le niveau d'autonomie)
        │                                            │
        └────────────────────────────────────  Configuration vN+1
                                          + trigger, raison, diagnostic,
                                            config précédente, accord
```

---

## 6. Deux ruptures réelles dans la chaîne actuelle

Ce ne sont pas des hypothèses : elles se lisent dans le schéma, et elles expliquent le symptôme
déjà connu — *le runtime réveille ce qui existe mais ne crée pas le travail*.

| Constat | Preuve | Conséquence |
|---|---|---|
| **`task` n'a aucun lien vers un objectif** | Colonnes : `tenant_id`, `employee_id`, `state`, dates. Rien d'autre. | Une tâche ne peut être ni justifiée ni rattachée à un résultat. Le risque « des tâches sans objectif » est déjà réalisé. |
| **`objective` n'a aucun lien vers un employé ni une mission** | Colonnes : `tenant_id`, `metric`, `target_value`, `horizon`. | Rien ne peut dériver du travail depuis un objectif. C'est la cause structurelle du symptôme. |

La couche **mission** referme les deux : elle appartient à la configuration, se rattache à un
objectif, et produit des tâches selon un déclencheur et une condition de fin. Sans elle, il n'y a
rien entre « le dirigeant veut +5 000 €/mois » et « une ligne dans `task` ».
[`adr/0027`](adr/0027-approvisionnement-du-travail.md) avait posé l'approvisionnement quotidien ;
il lui manquait la source, c'est-à-dire la mission.

---

## 7. La configuration ne dépasse jamais le noyau

Trois verrous superposés — la configuration ne peut que **retrancher** :

1. **Le Core** définit les capacités concevables et les interdits absolus (professions réglementées,
   classes d'effet jamais autonomes).
2. **La formule** restreint aux capacités dotées d'un moteur pour ce plan — déjà appliqué par
   `capability_binding`.
3. **La configuration** restreint encore, et écrit le résultat dans `employee_capability`.
   L'intersection est calculée en base, jamais au bord.

À l'exécution, le Policy Engine ajoute la dernière borne : classe d'effet, niveau d'autonomie porté
par l'employé, et accord permanent limité à *une* capacité nommée avec échéance
([`adr/0026`](adr/0026-cadence-et-borne-de-pas.md), migration `autonomie_et_accords`). Cette partie
est solide et n'a pas besoin d'être retouchée.

---

## 8. Lots d'implémentation

Chaque lot est livrable et testable seul ; aucun ne dépend d'un lot ultérieur.

| Lot | Contenu | Nature |
|---|---|---|
| **A** | Séparer acte et objet dans `capability`. Renommer les cinq clés existantes, introduire l'objet métier. Aucun comportement ne change. | migration |
| **B** | Table `mission` : composition ordonnée d'actes, déclencheur, condition de fin, métrique. Chaîne `task → mission → objective`. | migration |
| **C** | Tables `lady_configuration` et `configuration_version` : capacités activées, missions, priorités, autonomie, limites, déclencheur, raison, config précédente. | migration |
| **D** | `recommendation` pointe vers une configuration au lieu d'un métier. `employee_definition` perd le métier comme axe d'identité et devient le Lady Core versionné. | migration |
| **E** | Table `audit_finding` et moteur de composition déterministe. Tests d'abord : un jeu de constats donné produit toujours la même configuration. | migration + code |
| **F** | `assembleContext` n'injecte que les capacités activées. Le runtime dérive les tâches des missions au lieu de réveiller l'existant. | code seul |
| **G** | Extension de la bibliothèque, un domaine par lot. Chaque acte : contrat, classe d'effet, moteur lié, test. Sans jamais rouvrir le noyau. | itératif |

**L'ordre n'est pas négociable sur un point : E vient après C.** Écrire le moteur de diagnostic
avant que la configuration existe produirait des recommandations qui ne peuvent se matérialiser
nulle part — le chemin le plus court vers un moteur qui rédige du texte au lieu de décider.

---

## 9. Décisions produit encore ouvertes

À trancher, puis à retirer d'ici et à écrire en ADR
([`15-decisions-ouvertes.md`](15-decisions-ouvertes.md)).

1. **Le métier survit-il comme mot destiné au client ?** Le système ne le connaît plus, mais le
   dirigeant a besoin d'un mot. « Lady s'occupe de votre suivi client » est une étiquette de
   restitution — à valider comme telle, et à interdire en entrée.
2. **Une Lady peut-elle porter plusieurs domaines à la fois ?** Prospection + relance de factures est
   techniquement naturel. C'est un choix de cadrage et de tarif, pas un choix technique.
3. **Quel plancher de couverture déclenche `hors_perimetre` ?** Le mécanisme d'honnêteté existe déjà
   et se conserve. Reste le seuil : en dessous de quelle proportion de besoins couverts refuse-t-on
   la vente.
4. **Un changement de configuration se déploie-t-il sans accord du dirigeant ?** Question d'autonomie,
   pas de technique — et elle conditionne la boucle de réévaluation entière.
