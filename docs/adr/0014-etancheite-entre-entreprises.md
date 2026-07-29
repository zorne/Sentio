# ADR-0014 — Étanchéité entre entreprises : aucune donnée d'un client n'atteint jamais un autre

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Le lot 0 a rendu l'isolation **techniquement** vraie : droits explicites, RLS sur chaque table,
portée d'entreprise obligatoire à l'accès ([`0013`](0013-acces-donnees-portee-entreprise.md)),
clés étrangères qui portent l'entreprise, et verrou empêchant une ligne de changer de
propriétaire. Les deux parcours — entreprise individuelle et entreprise à plusieurs membres —
sont joués à chaque exécution de la suite ([`../13-verification.md`](../13-verification.md)).

Ce que le lot 0 ne dit pas, c'est **ce qu'on a le droit de construire demain**. Une isolation
posée dans le schéma ne protège de rien contre une fonctionnalité qui, un jour, fera
délibérément circuler une donnée d'un client vers un autre — et ces fonctionnalités-là sont
précisément celles qui se vendent bien :

- des repères comparatifs (« les entreprises de votre secteur obtiennent 18 % de réponses ») ;
- une liste d'exclusion ou un réservoir de prospects mutualisés entre clients ;
- un apprentissage transversal : ce que l'employé du client A découvre profite à celui du B ;
- un employé numérique servant deux entreprises à la fois.

Chacune est défendable commercialement. Chacune troue l'étanchéité, et aucune ne serait
rattrapable après coup : une donnée qui a circulé a circulé.

Le fondateur tranche donc la question **maintenant**, avant que la tentation se présente sous
la forme d'une demande client concrète.

## Décision

**Les données d'une entreprise ne sont jamais accessibles, ni partagées, ni dérivées, ni
agrégées vers une autre entreprise. Aucune exception, aucune option, aucun réglage.**

Concrètement, et pour lever toute ambiguïté au moment où une fonctionnalité sera proposée :

1. **Aucune fonctionnalité de partage entre entreprises.** Ni volontaire, ni « sur invitation »,
   ni « anonymisée ». Ce qui appartient à un client reste à ce client.
2. **Aucun chiffre présenté à un client ne provient des données d'un autre** — y compris agrégé,
   moyenné, ou dépersonnalisé. Un repère sectoriel affiché ne peut venir que d'une source
   publique ou d'un travail rédigé par Sentio, jamais du parc client.
3. **L'apprentissage est strictement par entreprise.** Un `learned_fact` né chez un client ne
   nourrit jamais l'employé d'un autre. Les profils sectoriels restent ce que
   [`0011`](0011-generaliste-profils-sectoriels.md) a défini : rédigés par Sentio, **jamais
   dérivés des données d'un client**.
4. **Un employé numérique sert une entreprise et une seule.** Son identité est réservée
   atomiquement et n'est jamais réutilisée ; sa mémoire d'entreprise n'a qu'un propriétaire.
5. **Aucune donnée client ne sert à améliorer le produit pour les autres** : ni jeu
   d'entraînement, ni jeu de test, ni exemple dans une démonstration ou une capture. La
   démonstration de la vitrine est scriptée pour cette raison aussi.
6. **Cette règle survit à la demande d'un client.** Si un dirigeant demande lui-même à comparer
   ses résultats à ceux des autres, la réponse est non — le consentement de l'un n'engage pas
   les données des autres.

### Ce que la règle ne dit pas

- **Un même utilisateur peut appartenir à deux entreprises** (un consultant chez deux clients).
  Il voit alors les deux, séparément, parce qu'il est membre des deux. Les entreprises, elles,
  ne se voient toujours pas, et une ligne ne peut pas passer de l'une à l'autre — c'est vérifié
  par le parcours « groupe ».
- **Les données de Sentio ne sont pas concernées** : formules, ADN des métiers, capacités,
  profils sectoriels, réservoir d'identités. Elles sont communes par construction et ne
  contiennent aucune donnée client.
- **Le partage à l'intérieur d'une entreprise est normal et voulu** : tous les membres d'une
  même entreprise voient les mêmes employés, les mêmes résultats, la même mémoire. La frontière
  est l'entreprise, pas l'utilisateur.
- **L'exploitation reste possible** : sauvegardes, journaux techniques et dépannage par le
  fondateur ne sont pas un partage entre clients. Ils relèvent du lot 8 et de
  [`../10-securite-rgpd.md`](../10-securite-rgpd.md), avec leurs propres règles.

## Pourquoi

Sentio vend un collaborateur à qui l'on confie ce qu'on ne dit pas à l'extérieur : ses clients,
ses prix, ses arguments, ses échecs. La valeur du produit repose entièrement sur ce que le
dirigeant accepte de lui donner. Une seule fuite, ou une seule fonctionnalité perçue comme une
fuite, détruit cette confiance — et sur un marché qui résilie déjà à 50-70 % par an
([`../20-plan-action.md`](../20-plan-action.md)), elle ne se reconstruit pas.

Poser la règle comme **invariant produit** et non comme paramètre technique a un effet précis :
elle devient une raison de refuser une fonctionnalité, pas seulement une consigne
d'implémentation. C'est la même logique que le reste du projet — l'ADN n'est pas « à ne pas
modifier », il est immuable ; le journal n'est pas « à ne pas réécrire », il refuse l'écriture.

## Compromis assumé

**1. On renonce à l'effet de réseau.** Les repères comparatifs, les listes d'exclusion
mutualisées et l'apprentissage transversal sont de vrais arguments de vente, et des concurrents
les auront. Sentio n'aura pas de fonctionnalité qui s'améliore avec le nombre de clients.

**2. Chaque client repart de zéro.** Aucun démarrage à chaud à partir de ce qui a marché
ailleurs : le premier mois d'un nouveau client ne bénéficie de rien. Le calibrage par le
diagnostic et les profils sectoriels rédigés par Sentio doivent compenser, et ils compensent
moins bien qu'une donnée réelle.

**3. Certaines mesures produit deviennent plus lourdes.** Comprendre ce qui marche impose de
travailler sur des mesures agrégées côté Sentio, sans jamais les redescendre dans l'interface
d'un client — donc plus d'outillage, pour moins d'affichage.

**4. La règle est plus large que ce que la loi exige.** Un agrégat correctement anonymisé serait
probablement licite. On s'interdit quand même : la frontière entre « anonymisé » et
« ré-identifiable » est étroite, et la tenir demanderait une vigilance permanente que ce projet,
mené seul, ne peut pas garantir.

## Quand revisiter

- **Jamais pour un partage de données client entre entreprises.** C'est le sens de cette entrée.
- **Si une fonctionnalité de comparaison est jugée indispensable à la vente** : la seule voie
  ouverte est une source **externe** au parc client (étude publique, données de marché
  achetées), et elle doit être écrite ici avant d'être construite.
- **Si un client exige contractuellement l'accès aux données d'une filiale** : il ne s'agit pas
  d'un partage entre entreprises mais d'un rattachement de plusieurs établissements à une même
  entreprise, ou d'un utilisateur membre des deux. Vérifier lequel des deux avant de toucher au
  modèle — le modèle ne bouge pas pour ça aujourd'hui.
