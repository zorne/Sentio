# ADR-0027 — D'où vient le travail : une mission par sujet, approvisionnée chaque jour, bornée par la base

**Date :** 2026-08-07
**Statut :** accepté
**Prolonge :** [`0004`](0004-run-machine-a-etats.md), [`0026`](0026-cadence-et-borne-de-pas.md)
**Réalisée par :** `EXEC-17`

## Contexte

Le runtime savait exécuter une mission, la reporter, la terminer (`EXEC-02` à `EXEC-08`).
**Rien ne créait de mission.** `insert into task` n'existait que dans des fixtures de test : un
employé recruté n'aurait jamais rien eu à faire, et un employé dont la dernière mission se termine
ne se serait jamais réveillé.

Le schéma, lui, disait déjà quelle était la bonne granularité — sans qu'aucun document ne
l'énonce. `outcome.task_id` rattache une réponse, un rendez-vous ou une vente à **une** tâche ;
`approval` n'admet qu'une question en attente par tâche ; `learned_fact.source_task_id` rattache
un fait appris à **un** fil de travail ; et `plan_quota.tasks_per_period` vaut **300 par mois**
pour la formule Start, soit une dizaine par jour. Ces quatre indices excluent aussi bien « une
tâche = un pas » (trop fin) que « une tâche = la vie de l'employé » (le quota n'aurait aucun sens).

## Décision

**1. Une mission porte un sujet.** `task` gagne `(subject_kind, subject_id)` et un index unique
`(tenant_id, employee_id, subject_kind, subject_id)`. Une mission = un sujet durable : pour le
métier Commercial, un prospect, de la qualification jusqu'au résultat.

`subject_kind` est un **texte libre**. Rien dans le domaine ne met cette valeur en correspondance
avec une table : c'est une étiquette, pas un pointeur. Un métier futur nommera d'autres sujets
sans migration ni refonte.

**2. L'approvisionnement n'ouvre que du neuf.** Les missions déjà ouvertes se réveillent seules —
`run_reporte` leur repose une échéance à la cadence (ADR-0026). L'approvisionnement n'a donc qu'un
seul travail, et c'est ce qui le rend petit.

**3. Il est déterministe. Aucun modèle n'y intervient.** Décider *combien* de travail créer est
une décision de cadencement bornée par des quotas payants, pas un jugement métier. Le modèle
décide *comment* traiter une mission, à l'intérieur du run ; jamais qu'il y en ait une de plus.

**4. Dix nouvelles missions par jour et par employé**, en configuration
(`ReglagesRuntime.missionsMaxParJour`). Un **plafond**, jamais une cible : trois sujets éligibles
donnent trois missions.

**5. Les garde-fous sont dans la base, jamais dans un `if`.** Trois, et chacun protège *tous* les
chemins — y compris une insertion à la main, un script de reprise, ou le rôle de service qui
ignore RLS :

| Garde-fou | Forme | Ce qu'il empêche |
|---|---|---|
| anti-doublon | index unique sur le sujet | écrire deux fois au même prospect |
| idempotence du jour | clé primaire `(tenant_id, employee_id, jour)` | un battement rejoué ou doublé |
| quota de la formule | déclencheur `before insert` + verrou consultatif par entreprise | sur-servir un client payant |

**6. L'objectif dit quand s'arrêter, jamais combien ouvrir.** `objective` gagne
`state ∈ (actif, atteint, retire)`. Sans objectif actif, aucune mission neuve n'est ouverte —
**et aucune mission engagée n'est abandonnée.**

**7. Sentio ne décide jamais seul qu'un objectif est atteint.** `metric` et `horizon` sont du
texte libre rédigé par le modèle pendant le diagnostic (« € de chiffre d'affaires », « mois ») :
les interpréter reviendrait à inventer un vocabulaire de mesure que personne n'a arrêté. Cet état
est **posé** par le client ou par la mesure du lot 6 (`DASH-05`, `DASH-07`), et l'approvisionnement
ne fait que le lire.

## Pourquoi

**Le sujet sur la mission** : sans lui, deux missions du même employé étaient *strictement
indiscernables*. Aucune requête ne pouvait dire « ce travail existe déjà », quel que soit le soin
mis dans le code appelant. C'est le manque qui rendait tout anti-doublon impossible.

**La base plutôt que le code** : ouvrir une mission de trop n'écrit pas une ligne en trop — ça
écrit à un **vrai prospect** au nom d'un **vrai client**. Un contrôle applicatif protège le chemin
qu'on a prévu ; un déclencheur protège ceux qu'on n'a pas encore écrits.

**Le verrou consultatif** n'est pas une précaution de style. Vérifié en le retirant : huit
insertions concurrentes sur un plafond de trois en font passer **cinq**. Les deux transactions
lisent « plafond − 1 » et passent toutes les deux. Le test correspondant redevient rouge dès qu'on
retire le verrou.

**Le déterminisme** : une hallucination ou une consigne injectée qui déciderait du volume ouvrirait
mille missions, c'est-à-dire mille messages réels. C'est la même frontière que partout ailleurs —
le modèle propose, le domaine décide.

## Compromis assumé

- **Un employé approvisionné le matin ne l'est plus de la journée.** Le lot est journalier ; des
  prospects importés à midi attendent le lendemain. C'est cohérent avec une cadence quotidienne,
  et c'est réparable (compléter le lot en cours) le jour où ça gêne.
- **Un refus métier règle la journée.** Un client qui souscrit à midi, après un refus
  `pas_d_abonnement_actif` le matin, verra son employé démarrer le lendemain. Les **anomalies**,
  elles (employé introuvable, verdict inconnu, métier sans gisement), ne règlent rien : les
  inscrire les tairait pendant 24 h, c'est-à-dire exactement le temps qu'il faut pour ne pas les
  voir.
- **Le déclencheur de quota laisse passer sans abonnement actif.** Le refus est alors porté par
  `peut_ouvrir_une_mission()`. Le rendre strict exigerait un abonnement dans chaque fixture, pour
  un gain nul sur le seul cas qui compte — un client payant sur-servi.
- **L'index unique porte sur tous les états, y compris `done`.** Ne pas réécrire à une entreprise
  déjà démarchée est une promesse produit. Le jour où une relance à distance devra rouvrir une
  mission close, il faudra changer cet index — et ça se verra.
- **Le plafond est par employé, le quota par entreprise.** Aucune règle de répartition n'est
  nécessaire tant que `plafond × employés autorisés × 30 ≤ tasks_per_period` — vrai pour les trois
  formules (300/300, 900/1500, 3000/6000). Ce n'est pas une note d'espoir : un test compare les
  deux et devient rouge avant qu'un client ne le découvre.
- **Personne ne consomme encore la file.** C'est `EXEC-12`. L'approvisionnement ouvre donc du
  travail que rien ne prend, et le rapport du battement le dit.

## Quand revisiter

- Un métier non-Commercial entre au catalogue → vérifier que seul un `GisementDeMissions` a dû
  être écrit. Si autre chose a bougé, la généralité de `subject_kind` était une illusion.
- Le lot 6 sait mesurer un objectif → l'état `atteint` cesse d'être posé à la main, et le
  vocabulaire `metric`/`horizon` doit être tranché à ce moment-là, pas avant.
- Une formule vend « plus de travail par jour » → `missionsMaxParJour` passe en données sur `plan`,
  comme `job_priority`, et le test de cohérence des plafonds change avec elle.
