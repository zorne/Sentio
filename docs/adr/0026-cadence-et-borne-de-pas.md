# ADR-0026 — Le rythme d'un employé : cadence quotidienne, dix pas par cycle, on ne dérange que si on est bloqué

**Date :** 2026-08-07
**Statut :** accepté
**Prolonge :** [`0004`](0004-run-machine-a-etats.md), [`0019`](0019-priorites-ingenierie.md), [`0024`](0024-verification-automatique.md)
**Réalisée par :** `EXEC-08`

## Contexte

Le runtime savait décider, exécuter et journaliser un pas (`EXEC-02` à `EXEC-07`). Il ne savait
pas **s'arrêter**. Quatre questions restaient ouvertes, et aucune n'est tranchable par le code :
à quel rythme un employé travaille-t-il, jusqu'où va-t-il en une fois, quel niveau d'autonomie
lui vend-on, et quand dérange-t-on son client ?

Ce sont des décisions **produit**. Les laisser au code aurait signifié qu'un choix commercial se
trouverait un jour dans une constante que personne n'a relue.

## Décision

**1. Un employé travaille chaque jour.** Un cycle de travail par jour, automatiquement. C'est le
rythme d'un collaborateur, et c'est ce qu'on dit au client — pas une limite technique dont on
s'excuse. Valeur en configuration : `cadenceEntreRunsHeures = 24`.

**2. Un cycle vaut au plus dix pas.** Au-delà, le run ne tombe pas en panne : il se referme
proprement (`run_reporte` au journal) et reprend au cycle suivant, avec un budget neuf et sans
rien perdre — l'état se relit intégralement dans le journal. Valeur en configuration :
`pasMaximumParRun = 10`, **reçue** par `deciderLaSuite` et non lue par elle.

Un pas est compté quand son **contexte est assemblé**, pas quand une action aboutit : un pas qui
finit sur un refus ou une réponse illisible a coûté un appel de modèle comme les autres.

**3. Le mode vendu est « confirmer une fois » (`confirm_once`).** Le client autorise une capacité
une première fois, puis son employé continue de l'utiliser dans le périmètre autorisé. L'accord
porte sur **une capacité nommée**, peut porter une **échéance**, et se **révoque** avec effet
immédiat (migration `20260806120002`). L'irréversible n'est jamais automatique par défaut.

Le défaut de la colonne `employee.autonomy` reste `confirm`, **plus strict** que le mode vendu :
`confirm_once` se pose explicitement au recrutement (`RECRUT-04`).

**4. On ne notifie qu'un employé bloqué.** Aucune notification après un run réussi. Deux natures
au journal disent qu'une personne doit intervenir — `politique_suspend` (une demande d'accord à
laquelle on répond) et `attention_requise` (un constat que personne ne peut faire à la place du
client) — et la vue `intervention_requise` les rend interrogeables (`EXEC-14`).

## Pourquoi

**La cadence** : « votre employé peut travailler jusqu'à N fois par jour selon la charge » décrit
une machine, pas un collaborateur, et ne se vérifie pas.

**La borne** : elle protège le quota d'inférence partagé, la facture, et la capacité à regarder ce
qu'un employé fait avant qu'il n'en fasse trop. Un run sans borne se découvre le jour où le
fournisseur coupe.

**L'autonomie** : c'est l'expérience d'un vrai collaborateur — on valide une fois, on ne re-valide
pas chaque geste. Mais un accord qui déborderait de la capacité nommée ferait croire au client
qu'il autorise un envoi alors qu'il autorise un genre entier d'actions. Et un **défaut**
permissif ferait de l'oubli de réglage une autorisation : la sécurité ne se décide pas par
omission.

**La notification** : un fil qu'on reçoit tous les jours est un fil qu'on cesse de lire, et le
jour où il compte vraiment, il passe inaperçu. L'état de blocage est **dérivé du journal**, jamais
tenu à jour à la main : une colonne « bloqué oui/non » se désynchroniserait le premier jour d'un
incident, c'est-à-dire précisément le jour où elle sert.

## Compromis assumé

- **Un travail long prend plusieurs jours.** Dix pas par jour, c'est le choix. Si un client a
  besoin de plus, on relève la valeur en configuration — on ne contourne pas la borne au cas par
  cas.
- **Un employé bloqué ne repart pas tout seul.** Aucune échéance de repli n'est posée sur un run
  qui attend une personne : lui en donner une le ferait agir sans réponse. Le prix est qu'un
  client qui ne lit pas sa notification laisse son employé à l'arrêt — d'où
  `APPROVAL_PENDING_ALERT_HOURS` (48 h).
- **La borne est globale, pas par formule.** Le jour où une formule supérieure vendra « plus de
  travail par jour », la valeur devra se lire dans `plan`, en données, comme `plan.job_priority`.
  Ce n'est pas fait, et c'est écrit dans `packages/config/src/runtime.ts`.
- **`confirm_once` est le mode vendu, `confirm` le défaut de la base.** Deux valeurs pour un même
  réglage est une incohérence apparente qu'il faut expliquer à chaque relecture. On la paie
  volontiers : l'inverse — aligner le défaut sur le mode vendu — ferait qu'un employé créé par un
  chemin oublié serait plus permissif que ce que son client a demandé. Une règle de
  [`scripts/verifier-frontieres.mjs`](../../scripts/verifier-frontieres.mjs) refuse toute
  insertion d'employé qui ne nomme pas `autonomy`, pour que l'écart soit impossible plutôt
  qu'improbable.
- **La vue `intervention_requise` parcourt le journal.** Un `distinct on` par tâche, indexé, mais
  qui grandira avec le nombre de tâches. Acceptable tant que le journal est borné à 30 jours
  ([`0012`](0012-retention-journal-30-jours.md)) ; à revoir si la lecture devient chaude.

## Quand revisiter

- Un client demande explicitement plus d'un cycle par jour, ou plus de dix pas par cycle → la
  valeur passe en données sur `plan`, et cette entrée est remplacée.
- Le premier client réel laisse un employé bloqué plus de 48 h → le canal de notification est en
  cause, pas la règle ; mais c'est le signal qu'il faut la rouvrir.
- Le journal cesse d'être borné à 30 jours → la vue doit être remplacée par une projection
  entretenue, avec le coût de synchronisation que cette entrée a précisément refusé.
