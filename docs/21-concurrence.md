# 21 — Concurrence : leurs échecs, nos corrections

> À lire si tu travailles sur : le métier Commercial, le discours commercial, le dashboard, ou
> avant de décider quoi construire en priorité.
>
> **Vérifié le 2026-07-28.** Document **interne** : il emploie du vocabulaire interdit côté client
> ([`17-lexique.md`](17-lexique.md)) et compare Sentio à ses concurrents. Rien de ce fichier ne doit
> apparaître dans un texte visible par un client.

Ce marché est encombré et **il échoue massivement** : la résiliation y atteint le double de celle
d'un commercial humain. Chaque cause d'échec documentée ici est soit déjà neutralisée par une règle
du dépôt, soit un trou qu'il faut combler. Les deux listes sont ci-dessous, sans complaisance.

---

## Qui vend presque la même chose

Quatre familles, par ordre de proximité avec Sentio.

| Famille | Promesse | Distance avec Sentio |
|---|---|---|
| **Employés commerciaux autonomes** | un « collaborateur » qui prospecte seul, avec un prénom et un visage | **la plus proche** — même promesse, même vocabulaire |
| **Plateformes de séquences** | tu construis les campagnes, l'outil les envoie | le client fait le travail ; Sentio le fait à sa place |
| **Enrichissement et données** | trouver et qualifier les contacts | brique amont, pas un employé |
| **Suites commerciales généralistes** | un module d'agent greffé sur un CRM existant | suppose un CRM déjà installé et peuplé |

La famille 1 est celle dont il faut apprendre : elle a essayé exactement ce que Sentio veut faire, et
elle a largement échoué.

---

## Les dix échecs documentés

**1. Une rétention catastrophique.** Le cas le plus documenté du secteur affiche 70 à 80 % de
résiliation : sur 14 M$ de revenu annuel annoncé, environ 3 M$ survivent à la clause de rupture des
90 premiers jours. Un autre acteur majeur est estimé sous 60 % de rétention brute, avec des avis
publics en dégradation continue. Moyenne du marché : **50 à 70 % par an**.

**2. Un marketing mensonger.** Le même acteur a affiché comme clients des entreprises qui ont
publiquement démenti l'être, et gonflé son revenu annoncé en comptant des essais courts comme des
contrats annuels. Un concurrent a fait campagne sur « arrêtez d'embaucher des humains ».

**3. Une personnalisation factice.** Les messages répètent le titre et le nom de l'entreprise du
destinataire sans rien dire de spécifique ni de vrai. Les acheteurs identifient ce style comme
machine-écrit **en quelques secondes**. Avis récurrents : fade, manifestement automatique, répétitif.

**4. Le volume détruit la valeur.** Le volume par commercial est passé de 1 150 à 7 400 messages par
mois pendant que le taux de réponse tombait de 4,7 % à 2,9 %. La comparaison décisive : une
configuration entièrement automatique a produit **847 rendez-vous convertissant à 11 %**, une
configuration mixte **312 rendez-vous convertissant à 38 %** — et la seconde a généré **2,3 fois plus
de revenu**. Plus de rendez-vous, moins d'argent.

**5. La délivrabilité.** Si le message tombe en indésirable, ni la liste, ni le texte, ni l'offre ne
comptent. Les outils sont loin d'être aussi « prêts à l'emploi » qu'annoncé.

**6. Aucune visibilité, aucun contrôle.** Plainte littérale d'acheteurs : *aucune visibilité sur la
logique de ciblage*. Impossible de savoir pourquoi tel prospect a été retenu, impossible d'exclure
ses propres clients, ses concurrents ou un compte sensible.

**7. Des pièges contractuels.** Engagement annuel avec reconduction automatique déclenchée 30 à
60 jours avant l'échéance, frais d'installation de 500 à 2 000 $, crédits et dépassements
imprévisibles. **38 %** des équipes ayant signé un contrat annuel déclarent qu'elles auraient voulu
tester 60 à 90 jours d'abord.

**8. Une installation trop complexe.** Plainte dominante des dirigeants de petites structures :
*« j'ai l'outil, mais je ne comprends pas ce que ces réglages veulent dire »*.

**9. Aucune preuve de résultat.** D'où la bascule en cours du marché vers le paiement au résultat
plutôt qu'à l'abonnement.

**10. Des données sales traitées à grande échelle.** Première cause d'arrêt des déploiements : une
liste de mauvaise qualité transformée en mauvais messages, plus vite et plus massivement qu'un humain
n'aurait pu le faire.

---

## Ce que Sentio neutralise déjà

C'est la thèse du produit, et elle tient. Rien à construire ici — seulement à ne pas relâcher.

| Échec | Ce qui l'empêche | Où c'est écrit |
|---|---|---|
| Marketing mensonger (2) | invariant « aucun chiffre affiché sans une ligne en base », garde-fou anti-mensonge, démonstration scriptée présentée comme telle | [`AGENTS.md`](../AGENTS.md), C6 et C9 de [`16-compromis.md`](16-compromis.md) |
| Aucune preuve (9) | modèle d'attribution : vente déclarée par le client, rattachée à un prospect touché, fenêtre annoncée | [`09-metriques-roi.md`](09-metriques-roi.md) |
| Installation complexe (8) | le client ne configure rien, ne choisit rien, ne voit aucun réglage | [`07-parcours-produit.md`](07-parcours-produit.md) |
| Absence de contrôle (6) | Policy Engine, quatre niveaux d'autonomie, `confirmer une fois` par défaut, validation humaine | [`05-runtime-employe.md`](05-runtime-employe.md), D7 |
| Pièges de prix (7) | tarif fixe, indépendant des modèles et des outils, aucun supplément par employé | [`00-vision.md`](00-vision.md) |
| Volume destructeur (4) | le quota d'inférence à €0 rend le volume massif matériellement impossible | C1 de [`16-compromis.md`](16-compromis.md) |

**Le point 4 mérite d'être retourné en argument.** La contrainte €0 impose exactement la stratégie que
les données valident : peu de volume, bien qualifié, rapporte davantage que beaucoup de volume mal
qualifié. Ce qui ressemblait à une limite subie est un alignement — à condition de l'assumer comme un
choix et de ne jamais chercher à « rattraper » le volume quand le budget le permettra.

---

## Ce qui manque à Sentio

Vérifié par recherche sur tout le dépôt. Ces points ne sont couverts nulle part.

### A. La délivrabilité — le trou le plus grave

Aucune mention, dans aucun fichier, de l'authentification d'expéditeur, de la montée en charge
progressive, du taux de rebond, du taux de plainte ou d'un plafond d'envoi. C'est la première cause
d'échec opérationnel du marché, et elle est absente d'un produit dont le cœur est l'envoi d'emails.

Les exigences ne sont pas négociables — les grandes messageries les appliquent :

| Exigence | Seuil |
|---|---|
| Taux de plainte | **sous 0,3 %** |
| Taux de rebond | **sous 2 %** |
| Authentification | SPF, DKIM **et** DMARC alignés |
| Désabonnement | en un clic, conforme à la norme |
| Volume par boîte | **25 à 50 par jour**, après montée sur 3 à 4 semaines |

> ⚠️ **Ce risque porte sur le client, pas sur Sentio.** D6 recommande d'envoyer depuis le domaine du
> client. Un employé mal réglé ne brûle donc pas la réputation de Sentio : **il brûle celle de son
> client**, c'est-à-dire son outil de travail le plus précieux. C'est irréversible à l'échelle de
> plusieurs mois. Aucune ligne de la capacité d'envoi ne doit être écrite avant que ces garde-fous
> existent.

### B. Les listes d'exclusion

Le dépôt ne couvre que la **désinscription** — qui est réactive, et n'intervient qu'après le message
de trop. Rien ne permet d'exclure d'avance ses propres clients, ses concurrents, ou un compte
sensible. Les acheteurs le réclament explicitement, et c'est un motif d'arrêt cité.

### C. Le plafond de volume par employé

Rien ne borne ce qu'un employé peut envoyer par jour. C'est pourtant ce qui protège la délivrabilité,
et c'est cohérent avec le débit d'inférence bas.

### D. Les repères de performance honnêtes

[`09-metriques-roi.md`](09-metriques-roi.md) interdit les chiffres inventés mais ne donne aucun
repère. **Un client qui ignore que 3 à 5 % de réponse est normal lira son dashboard comme un échec et
résiliera au troisième mois** — exactement le mode d'échec du marché. Cacher l'ordre de grandeur ne
protège pas le client, ça le fait partir.

### E. Rien n'interdit les pièges contractuels

Aucune règle n'empêche Sentio de reproduire ce que le marché reproche aux autres : engagement annuel,
reconduction automatique, frais d'installation.

---

## Les repères à afficher plutôt qu'à cacher

Vérifiés au 2026-07-28. À réviser avant d'en faire une promesse commerciale.

| Indicateur | Repère réaliste |
|---|---|
| Taux de réponse à froid | **3 à 5 %** — au-delà de 5 % c'est bon, 8 % excellent |
| Prospects convertis en rendez-vous | 2 à 5 % |
| Rendez-vous qualifiés par mois | 12 à 20 pour un commercial rodé |

Ce qui compte n'est pas le nombre de rendez-vous mais le revenu par rendez-vous — c'est précisément
ce que mesure le modèle d'attribution de Sentio, et c'est là que se gagne la rétention.

---

## Les demandes réelles des acheteurs

| Ce qu'ils demandent | Sentio y répond ? |
|---|---|
| Valider avant l'envoi | ✅ `confirmer une fois`, niveaux d'autonomie |
| Comprendre **pourquoi** ce prospect, ce message | ❌ **non** — voir D14 |
| Exclure des comptes d'avance | ❌ **non** — trou B |
| Garde-fous sur les situations sensibles | ⚠️ partiel — le Policy Engine peut le porter |
| Des résultats, pas un outil de plus | ✅ c'est la définition du produit |
| Aucune installation complexe | ✅ le client ne configure rien |
| Essayer avant de s'engager | ❓ dépend de D3 |

---

## La tension à trancher : opacité contre visibilité

Sentio interdit d'exposer la mécanique au client — jamais les modèles, jamais les outils, jamais les
workflows. Les acheteurs, eux, citent l'absence de visibilité comme **motif d'arrêt**.

La contradiction n'est qu'apparente, et la distinction est la clé :
**montrer le raisonnement métier, jamais la mécanique technique.**

- *« Carter a contacté cette entreprise parce qu'elle recrute dans votre secteur »* — raisonnement
  métier, compréhensible par un dirigeant, et conforme au lexique.
- *« modèle X, appel d'outil Y, workflow Z »* — mécanique, interdite.

Sentio peut donc satisfaire la demande sans casser sa promesse, et en faire un différenciateur là où
les autres sont opaques. C'est un arbitrage du fondateur : **décision D14**.

---

## Ce que Sentio a de défendable

Sans triomphalisme, trois choses, et elles sont réelles :

1. **Le client ne fait rien.** Sur un marché dont la première cause d'échec est la mise en œuvre,
   supprimer l'installation est un angle solide.
2. **La valeur est prouvée, pas affirmée.** Le modèle d'attribution répond directement à la cause
   n°1 de résiliation. C'est l'arme de rétention du produit.
3. **Le volume bas est un choix, pas un défaut.** Les données montrent que la qualification bat le
   volume sur le revenu réel.

Et une faiblesse structurelle à ne pas se cacher : **un fondateur seul, à budget nul, face à des
acteurs financés.** La seule réponse tenable est l'étroitesse — une cible précise, servie mieux que
par quiconque, plutôt qu'un marché large servi moyennement.
