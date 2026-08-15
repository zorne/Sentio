# ADR-0029 — Un noyau Lady généraliste, configuré par le diagnostic

**Date :** 2026-08-15
**Statut :** acceptée — remplace [ADR-0008](0008-perimetre-v1-commercial-seul.md)
**Prolonge :** [`0010`](0010-diagnostic-calibrage.md), [`0011`](0011-generaliste-profils-sectoriels.md),
[`0025`](0025-un-seul-sentio.md)
**Architecture détaillée :** [`docs/28-bibliotheque-et-creation-de-lady.md`](../28-bibliotheque-et-creation-de-lady.md)

## Contexte

Trois décisions convergeaient déjà vers un produit généraliste. [ADR-0010](0010-diagnostic-calibrage.md)
a fait du diagnostic un calibreur plutôt qu'un sélecteur de catalogue. [ADR-0011](0011-generaliste-profils-sectoriels.md)
a tranché que le secteur est du contexte, jamais un rôle. [ADR-0025](0025-un-seul-sentio.md) a imposé un
cerveau unique.

Une décision les contredisait : [ADR-0008](0008-perimetre-v1-commercial-seul.md) fixait la V1 à
**un seul métier réel, Commercial**, et le schéma l'a suivie. `employee_definition` porte
`unique (profession, version)` : le métier est aujourd'hui l'**axe d'identité** du noyau.
`recommendation` pointe vers un métier. Les cinq capacités existantes nomment leur objet dans leur
clé — `relancer_un_prospect`, `qualifier_un_prospect`.

Le résultat est un produit dont le noyau est un métier. Ce n'est pas ce que Sentio vend.

## Décision

**Il n'existe qu'un noyau, Lady. Le métier n'est jamais une entrée du système : c'est une sortie
du diagnostic, matérialisée par une configuration versionnée.**

Quatre conséquences, toutes contraignantes.

**1. Le métier disparaît de l'identité du noyau.** `employee_definition` devient le *Lady Core* :
capacités concevables, limites fondamentales, règles, version. Son immuabilité par trigger et le
figeage de chaque employé sur une version sont conservés tels quels — ils réalisent déjà exactement
ce que ce modèle exige.

**2. Une capacité nomme un acte, jamais un objet ni un métier.** `relancer_un_prospect` devient
`relancer` appliqué à un objet. Un acte écrit une fois sert plusieurs métiers ; c'est la seule
façon d'élargir la bibliothèque sans que son coût croisse avec le nombre de métiers.

**3. La configuration est une entité de premier ordre, versionnée et justifiée.** Chaque version
porte son déclencheur, sa raison, le diagnostic qui l'a produite, la configuration précédente et
l'accord qui l'a autorisée. On ne modifie jamais un rôle en place.

**4. Le moteur de composition est déterministe.** Il *choisit et pondère* des briques écrites,
testées et versionnées par Sentio ; il n'en rédige aucune. Le modèle ne reçoit la parole qu'après,
pour justifier une décision déjà prise — c'est la règle que
[`recommendation`](../../supabase/migrations/20260729120027_recommendation.sql) impose déjà au
choix du métier, étendue à la configuration entière.

## Pourquoi

Sur le produit : si le client choisit son agent dans un catalogue, c'est lui qui pose le
diagnostic. Or il se trompe — il demande de la prospection quand le trou réel est le traitement des
demandes entrantes. Un catalogue vend la solution que le client croit vouloir, et Sentio n'a plus
de valeur ajoutée.

Sur l'ingénierie : une configuration **générée** en texte libre par un modèle serait invérifiable.
On ne peut pas tester une configuration que personne n'a jamais vue tourner, et
[ADR-0024](0024-verification-automatique.md) deviendrait inapplicable. Composer à partir d'un
vocabulaire fermé garde chaque brique testable, tout en produisant une configuration réellement
propre à l'entreprise par sa combinaison et ses pondérations.

C'est aussi la forme déjà retenue pour les secteurs par [ADR-0011](0011-generaliste-profils-sectoriels.md) :
des profils écrits par Sentio, jamais appris des clients. Le refus simultané du vertical figé et de
l'apprentissage sauvage. Appliquer un mécanisme différent aux configurations aurait créé une
incohérence entre deux moitiés du même produit.

## Compromis assumé

**Le lancement est plus lent.** ADR-0008 permettait de vendre un commercial avec cinq capacités.
Ce modèle demande la couche mission, la configuration versionnée et le moteur de composition avant
la première vente. C'est un report réel, accepté au titre de la priorité 6
([`0019`](0019-priorites-ingenierie.md)) : la dette évitée ici est structurelle, pas cosmétique.

**Lady ne saura pas tout faire.** Le nombre d'actes écrits borne la couverture réelle. Une demande
hors bibliothèque doit rester un `hors_perimetre` honnête et une liste d'attente, jamais la vente
d'une Lady incapable de travailler.

**Le déterminisme coûte de l'expressivité.** Un moteur qui compose à partir d'un vocabulaire fermé
produira parfois une configuration moins fine qu'un modèle libre. On échange cette finesse contre
la vérifiabilité, la reproductibilité et la possibilité de comparer deux configurations.

**Le mot « métier » devient ambigu.** Il ne désigne plus rien dans le système, alors qu'il reste
utile pour parler au dirigeant. Le risque de le voir revenir en entrée par la porte du vocabulaire
est réel et permanent.

## Quand revisiter

Trois signaux, chacun suffisant.

- Le moteur de composition produit la même configuration pour des entreprises manifestement
  différentes : le vocabulaire est trop pauvre, ou les pondérations sont mortes.
- Une capacité ne peut pas être exprimée comme acte × objet sans se dénaturer : l'axiome de
  séparation a une exception, il faut l'écrire plutôt que la contourner.
- Un besoin fréquent tombe systématiquement en `hors_perimetre` : la bibliothèque doit s'étendre,
  et l'ordre d'extension doit alors être piloté par ce compteur, pas par l'intuition.
