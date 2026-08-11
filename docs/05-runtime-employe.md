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

### D'où vient le travail

Trois niveaux, et ne pas les confondre est ce qui rend le reste lisible
([`adr/0027`](adr/0027-approvisionnement-du-travail.md)) :

| | Ce que c'est | Durée |
|---|---|---|
| **mission** (`task`) | un sujet durable — un prospect pour le Commercial | des jours, des semaines |
| **cycle** | une session de travail quotidienne sur cette mission | une journée |
| **pas** | une action individuelle | quelques secondes |

**Les missions déjà ouvertes se réveillent toutes seules** : `run_reporte` leur repose une
échéance à la cadence. L'approvisionnement n'a donc qu'un seul travail — **ouvrir du neuf** —, au
plus dix par jour et par employé, et il est **déterministe** : aucun modèle ne décide du volume de
travail à créer.

Les trois garde-fous sont dans la base, jamais dans un `if` : un index unique sur le sujet
(jamais deux missions sur le même prospect), une clé primaire par employé et par jour (un
battement rejoué n'ouvre rien), et un déclencheur qui refuse toute mission au-delà du quota de la
formule — y compris insérée à la main.

L'objectif du client dit **quand cesser d'ouvrir**, jamais combien ouvrir. Un objectif atteint
arrête l'ouverture de missions neuves ; il n'abandonne aucune mission engagée.

### Deux hôtes, un seul runtime

L'exécution vit dans `@sentio/runtime`, qui ne connaît **aucun runtime**. Deux hôtes le montent :

| | `apps/worker` (Node) | `supabase/functions/battement` (Deno) |
|---|---|---|
| pilote | `pg` | pilote Deno, pool paresseux |
| serveur | `node:http` | `Deno.serve` |
| environnement | `process.env` | `Deno.env` |
| travaux par battement | 25 | **1** |

Le « 1 » n'est pas une limite de Deno : c'est la conséquence du **lissage de débit** du fournisseur
d'inférence — 30 secondes entre deux appels de modèle. Un battement qui enchaînerait dix pas
dormirait 4 min 30, sur n'importe quel hébergeur
([`adr/0028`](adr/0028-executant-en-fonction-serveur.md)).

Un test de parité vérifie que les deux hôtes se comportent pareil sur ce qui compte : battement
signé accepté, signature invalide refusée **avant toute écriture**, secret absent qui refuse tout,
`GET` sans effet, et aucun secret dans un message d'erreur.

### La file : un travail à la fois, verrouillé, jamais deux fois

Le battement prend les travaux dus **un par un**, avec `for update skip locked` : l'exécutant qui
arrive second passe à la ligne suivante au lieu d'attendre. Le verrou Postgres n'est tenu que le
temps de la prise ; pendant le pas, c'est un **bail** (`locked_at`) qui protège — sans quoi un
exécutant qui meurt rendrait un travail invisible pour toujours.

Une mission reprise trop souvent après interruption n'est plus rejouée : elle est confiée à une
personne. Une mission qui fait tomber l'exécutant à chaque tentative le fera tomber la fois
suivante aussi.

**Le journal fait foi, y compris contre la file.** S'il dit qu'un run est terminé, refusé ou en
attente alors que la file le croyait dû, c'est la file qu'on remet d'accord — jamais l'inverse.
C'est ce qui rend réparable l'interruption entre l'écriture du journal et celle de la file.

### Le rythme : un cycle par jour, dix pas par cycle

Décision produit, [`adr/0026`](adr/0026-cadence-et-borne-de-pas.md) : **un employé travaille
chaque jour**, et un cycle de travail vaut au plus **dix pas**. Les deux valeurs vivent en
configuration (`@sentio/config`, `ReglagesRuntime`), pas dans le code d'exécution.

Au dixième pas, le run **ne tombe pas en panne** : il se referme proprement (`run_reporte` au
journal) et reprend au cycle suivant, budget neuf, sans rien perdre. Un pas est compté quand son
contexte est assemblé, pas quand une action aboutit — un pas qui finit sur un refus a coûté un
appel de modèle comme les autres.

Le dernier maillon de la boucle a donc quatre issues, et pas une de plus :

| Issue | Ce que fait le système | Journal |
|---|---|---|
| **poursuivre** | le pas suivant est dû tout de suite, le verrou est rendu | — |
| **reporter** | le travail garde sa place dans la file, avec une échéance | `run_reporte` / `pas_reporte` |
| **terminer** | le travail quitte la file | `run_termine` / `run_echoue` |
| **attendre un humain** | le travail quitte la file **sans échéance** | `politique_suspend` / `attention_requise` |

⚠️ La quatrième ligne est la seule dont on ne sort pas tout seul, et c'est délibéré : donner une
échéance de repli à un run qui attend un accord le ferait repartir sans réponse du client.

### Quand le client est prévenu — et quand il ne l'est pas

**Jamais après un run réussi.** Un fil qu'on reçoit tous les jours est un fil qu'on cesse de lire.
Le client est prévenu quand son employé est **bloqué** : une demande d'accord (`politique_suspend`)
ou un constat que personne ne peut faire à sa place (`attention_requise`).

La vue `intervention_requise` rend cet état interrogeable. Elle est **dérivée du journal** — le
dernier événement de chaque tâche —, jamais tenue à jour à la main : un accord ou une reprise fait
sortir la ligne par construction. C'est la seule source des notifications de blocage (`EXEC-14`).

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
   La chaîne ne franchit jamais la frontière de classe de données : sur une requête portant de
   la donnée réelle, si le fournisseur conforme est épuisé, **la tâche est reportée, jamais
   routée vers le secours**. L'ordre des fournisseurs est en configuration, pas dans le code
   → [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md).
3. **Comptage.** Chaque appel incrémente le compteur de l'entreprise et le compteur global du
   fournisseur. C'est ce comptage qui rend les quotas de formule réels et non décoratifs.
4. **Plafond dur** par entreprise et par jour. Au-delà, la tâche est **reportée avec un message
   clair**, jamais dégradée en silence. Le plafond porte aussi sur le **débit par minute**, qui
   est le facteur limitant réel : le Gateway lisse les appels dans le temps au lieu de les
   grouper.

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
