# ADR-0015 — Transparence AI Act : Sentio le dit, sobrement, là où la loi l'exige (D13 tranchée)

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

**L'article 50 du règlement européen sur l'IA s'applique le 2 août 2026 — dans quatre jours.**

Le « digital omnibus », adopté par le Parlement européen le 16 juin 2026 et validé par le Conseil
le 29 juin 2026, a repoussé les obligations des systèmes à **haut risque** (annexe III au
2 décembre 2027, annexe I au 2 août 2028). Il **n'a pas touché** à l'article 50, ni à l'article 4
(compétence en matière d'IA), ni au régime de sanctions — jusqu'à **35 M€ ou 7 % du chiffre
d'affaires mondial**. Ce qui a bougé n'est pas ce qui nous concerne. Sources vérifiées le
2026-07-29, à revérifier avant la mise en ligne : le calendrier de ce texte a déjà bougé deux
fois.

Un employé numérique commercial n'est pas un système à haut risque : il ne figure ni à l'annexe I
ni à l'annexe III (il ne trie pas des candidatures, n'évalue pas la solvabilité, ne décide pas
d'un accès à un service essentiel). Il relève du **risque limité**, dont les obligations tiennent
en trois gestes : informer, marquer, documenter.

Deux surfaces de Sentio sont concernées :

1. **le diagnostic de la vitrine** — un visiteur, personne physique, converse réellement avec un
   système d'IA ;
2. **les messages écrits par les employés** — du texte synthétique envoyé à des tiers, signé du
   prénom d'une identité qui n'existe pas.

Et cela heurte de front la promesse fondatrice — *« le client ne doit jamais avoir l'impression
d'utiliser une IA »* — ainsi que le lexique, qui interdit le mot dans tout texte visible
([`../17-lexique.md`](../17-lexique.md)).

## Décision

**La loi gagne sur la promesse, à l'endroit précis où elle l'exige, et nulle part ailleurs.**

1. **Le diagnostic informe, en clair, dès le premier écran.** Une phrase, sobre, avant la
   première question — pas une bannière, pas une pop-up, pas un texte grisé en pied de page.
   **Aucune périphrase** : l'article 50 exige une information *claire et distinguable*. Une
   formule qui laisse le visiteur dans le doute n'est pas une information, c'est une infraction
   habillée. Le lexique reçoit donc une **zone exemptée** de plus, à côté des pages légales :
   *l'information de transparence*. C'est le seul endroit de la vitrine où le mot interdit est
   autorisé — et il y est obligatoire.

2. **Les contenus générés sont marqués de façon lisible par machine** (art. 50 § 2) : en-tête
   technique sur les messages envoyés, métadonnée sur tout contenu produit. Le sursis obtenu par
   l'omnibus jusqu'au 2 décembre 2026 sur le marquage technique **ne s'applique pas à Sentio** :
   il ne couvre que les systèmes déjà commercialisés avant le 2 août 2026. Sentio ne l'est pas.
   Il naît donc marqué.

3. **L'émetteur d'un message est l'entreprise cliente, nommée, avec des coordonnées valables.**
   Le prénom de l'employé est un nom d'affichage, jamais une affirmation qu'une personne physique
   existe. Masquer l'identité de l'émetteur est déjà interdit en prospection électronique
   (art. L. 34-5 du code des postes et des communications électroniques), indépendamment de
   l'AI Act. Un étiquetage visible « écrit par une IA » n'est en revanche **pas** exigé sur un
   message commercial : l'obligation d'étiquetage visible vise les hypertrucages et les textes
   d'intérêt public, ce qu'un message de prospection n'est pas. **Point à faire confirmer par un
   conseil avant le premier envoi réel** ([`../25-conformite-legale.md`](../25-conformite-legale.md)).

4. **La documentation du système et la traçabilité des décisions** sont tenues. La seconde est
   déjà acquise par le journal en ajout seul ; la première est un document à écrire, pas une
   fonctionnalité à coder.

5. **Article 4 — compétence en matière d'IA.** Obligation souvent oubliée parce qu'elle ne se
   code pas : les personnes qui exploitent le système doivent en comprendre les limites. À une
   personne, cela se réduit à écrire ce qu'on sait et ce qu'on ignore, et à le dater.

## Pourquoi

Parce que l'alternative n'existe pas. Une sanction au titre de l'article 50 peut atteindre
35 M€ ou 7 % du chiffre d'affaires mondial : pour une entreprise d'une personne, l'échelle exacte
importe peu, c'est la fin du projet. Aucune promesse produit ne vaut ce risque.

Et parce que la promesse survit mieux qu'il n'y paraît. Ce que Sentio vend n'est pas l'illusion
qu'aucune machine n'est impliquée — c'est qu'**on ne choisit rien, on ne configure rien, on ne
voit jamais la mécanique**. Un visiteur informé une fois, sobrement, au début d'une conversation,
retrouve dès la phrase suivante l'expérience promise. Ce qui la détruirait, c'est le vocabulaire
technique partout, et ce n'est pas ce qui est décidé ici : le lexique reste intégralement en
vigueur dans le reste du produit.

Enfin, l'honnêteté était déjà un choix du produit avant d'être une obligation : la démonstration
est présentée comme scriptée, et le diagnostic dit quand le besoin sort du périmètre. Informer
n'est pas un renoncement, c'est la suite de la même ligne.

## Compromis assumé

**1. La promesse fondatrice est amendée, et à l'endroit le plus sensible :** la première phrase
que lit un visiteur. C'est le moment de la conversion. Il faut l'écrire, l'assumer, et mesurer
son effet plutôt que de le supposer.

**2. Un concurrent non conforme paraîtra plus fluide.** Il le paiera peut-être un jour, ou
jamais. Ce n'est pas un argument : on ne construit pas une entreprise sur le pari qu'un
régulateur regardera ailleurs.

**3. Le marquage technique coûte du travail dès le premier envoi**, avant tout client, pour une
obligation dont la vérification est improbable à cette échelle. On le fait quand même : le
rattraper après coup supposerait de retrouver et de marquer ce qui est déjà parti.

**4. Une part d'incertitude demeure sur les messages de prospection.** L'analyse retenue — pas
d'étiquetage visible obligatoire — est défendable, pas certaine. Elle est donc écrite comme
telle, et soumise à un conseil avant le premier envoi réel, pas après.

## Quand revisiter

- **Avant la mise en ligne** — revérifier le calendrier et les lignes directrices de la
  Commission : ce texte a déjà été modifié deux fois en dix-huit mois.
- **Si le diagnostic cesse d'appeler un modèle** (moteur de règles seul) — l'obligation
  d'informer sur l'interaction tomberait, celle de marquer les contenus resterait.
- **Au premier envoi réel de messages** — après la confirmation du conseil sur le point 3.
- **Si un métier futur touche l'annexe III** (tri de candidatures, notation de personnes) — on
  changerait de régime, et ce serait une décision d'une tout autre ampleur.
