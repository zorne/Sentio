# 25 — Conformité légale : ce que la loi impose, et où ça se joue dans Sentio

> À lire si tu travailles sur : le diagnostic, l'envoi de messages, les pages légales, la
> facturation, une suppression de données, ou avant toute mise en ligne.
>
> Établi le **2026-07-29**. Les échéances de ce document bougent — la ligne « vérifié le » de
> chaque section dit quand elle a été confrontée aux textes pour la dernière fois.

**Ce document n'est pas un avis juridique.** Il est écrit pour qu'un développeur — humain ou IA —
sache *ce qu'il doit construire* et *ce qu'il ne doit pas construire*. Les points marqués
**⚖️ conseil** doivent être confirmés par un professionnel avant le premier client réel : ils ne
se tranchent pas en lisant des articles.

---

## 1. Qui est quoi — la question à trancher avant toutes les autres

Le RGPD n'impose pas les mêmes obligations selon qu'on décide du traitement ou qu'on l'exécute
pour autrui. Sentio est **les deux**, selon le traitement. S'en rendre compte après coup, c'est
signer les mauvais contrats et écrire la mauvaise politique de confidentialité.

| Traitement | Sentio est | Le client est |
|---|---|---|
| Diagnostic d'un visiteur sur la vitrine | **responsable** | — *(il n'existe pas encore)* |
| Compte, abonnement, facturation | **responsable** | personne concernée |
| Journal technique, sauvegardes, surveillance | **responsable** | — |
| Mémoire d'entreprise, objectifs, résultats du client | **sous-traitant** | responsable |
| **Prospection : données des prospects du client** | **sous-traitant** | **responsable** |

La dernière ligne est la plus lourde de conséquences. **Le client est responsable des données de
ses prospects** : c'est lui qui doit avoir une base légale, c'est lui qui doit pouvoir répondre à
une demande d'accès, c'est son domaine et sa réputation qui sont engagés. Sentio exécute sur
instruction — et doit donc lui fournir les moyens de tenir ses propres obligations, ce qui est le
sens de l'article 28.

Conséquence directe, absente du backlog jusqu'ici : **Sentio doit fournir un contrat de
sous-traitance à ses clients**, avec la liste de ses propres sous-traitants ultérieurs
(hébergeur, base, fournisseur d'inférence, service d'envoi, paiement) et un engagement
d'information en cas de changement. Sans ce document, un client un peu sérieux ne peut pas
acheter, et un client mal informé se retrouve en faute par notre faute.
→ tâche à créer dans le lot 8, **bloque le premier client**.

---

## 2. RGPD — obligation par obligation

*Vérifié le 2026-07-29. Règlement (UE) 2016/679.*

### 2.1 Bases légales (art. 6)

| Traitement | Base retenue | Pourquoi celle-là |
|---|---|---|
| Diagnostic du visiteur | intérêt légitime *(mesure et amélioration du produit)*, exécution précontractuelle pour la partie recommandation | le visiteur demande lui-même une recommandation |
| Compte, abonnement | exécution du contrat | — |
| Facturation, comptabilité | obligation légale | conservation imposée, elle prime sur l'effacement |
| Journal, sécurité, sauvegardes | intérêt légitime | preuve, continuité, sécurité |
| Prospection pour le compte du client | **c'est le client qui la choisit** — en pratique : intérêt légitime en B2B | Sentio n'est pas responsable de ce traitement |

### 2.2 Information des personnes (art. 12 à 14)

Deux cas, et le second est celui qu'on oublie :

- **Collecte directe (art. 13)** — le visiteur du diagnostic donne ses données lui-même :
  information au moment de la collecte, avant la première question.
- **Collecte indirecte (art. 14)** — ⚠️ **le prospect n'a jamais parlé à Sentio ni à son client.**
  L'information doit lui parvenir **au plus tard lors de la première communication**. Autrement
  dit : **le premier message de prospection porte lui-même l'information**, et pas seulement un
  lien de désinscription.

Ce que cela impose au produit, et qui va au-delà de `METIER-10` tel qu'il est écrit aujourd'hui :
tout message sortant contient l'identité du responsable (**l'entreprise cliente**, nommée), la
finalité, la base légale, **l'origine des données**, les droits de la personne et le moyen de les
exercer — plus le moyen d'opposition. **La capacité d'envoi ne doit pas pouvoir émettre un
message qui n'en porte pas.** C'est un garde-fou technique, pas une consigne de rédaction.

### 2.3 Droits des personnes (art. 15 à 22)

| Droit | Comment Sentio le sert | État |
|---|---|---|
| Accès, copie | export des données d'une entreprise | ☐ lot 8 |
| Rectification | le client corrige sa mémoire lui-même | ✅ lot 0 |
| **Effacement (art. 17)** | `erase_tenant()` : données supprimées, journal **anonymisé** et non détruit, compte-rendu remis en preuve | ✅ lot 0 *(migration 0036)* |
| Opposition à la prospection | désinscription immédiate et définitive + exclusions préventives | ☐ lot 2 (`METIER-11`, `16`, `17`) |
| Portabilité | export dans un format lisible | ☐ lot 8 |
| **Décision automatisée (art. 22)** | intervention humaine : le Policy Engine *est* ce droit — il reste à le **documenter** comme tel | ☐ lot 1 puis 8 |

L'effacement mérite une note, parce qu'il est contre-intuitif : **on n'efface pas le journal, on
le dépouille.** Détruire la piste d'audit pour honorer un droit à l'effacement reviendrait à
violer l'obligation de rendre des comptes (art. 5.2) en croyant respecter l'article 17. La
procédure retire le contenu et les clés d'action, conserve la date et la nature de chaque
événement, et écrit sa propre trace. Elle rend un compte-rendu ligne par ligne : c'est la preuve
à remettre à la personne, et à l'autorité si elle demande.

> ⚠️ **Une exception au « aucun transfert hors UE », depuis le 2026-07-29** : le service
> d'expédition retenu ([`adr/0018`](adr/0018-service-expedition-resend.md)) expédie depuis
> l'Irlande mais **stocke ses journaux aux États-Unis**. Ces journaux contiennent les adresses des
> prospects du client. Le mécanisme de transfert doit être vérifié et documenté **avant le premier
> envoi réel**, et l'entrée du registre le dit.

### 2.4 Sous-traitance (art. 28) — dans les deux sens

- **En aval** — un contrat avec chaque prestataire qui touche des données : hébergeur, base,
  fournisseur d'inférence, service d'envoi, paiement. ☐ *avant le premier client réel.*
- **En amont** — un contrat que **Sentio fournit à ses clients**, où il se déclare sous-traitant,
  liste ses sous-traitants ultérieurs et s'engage à signaler tout changement. ☐ *voir §1.*

### 2.5 Registre (art. 30)

Obligatoire par écrit, y compris pour une petite structure dès lors que le traitement n'est pas
occasionnel — ce qui est le cas ici. Deux registres, un par rôle.
→ [`26-registre-traitements.md`](26-registre-traitements.md), à tenir à jour à chaque nouveau
traitement, pas une fois par an.

### 2.6 Sécurité (art. 32)

Déjà en place et prouvé par les tests : isolation par entreprise à quatre couches
([`13-verification.md`](13-verification.md)), aucun secret dans le dépôt, hébergement en UE,
comptes de production séparés, journal en ajout seul. Restent à documenter : chiffrement au repos
(fourni par l'hébergeur, à vérifier par écrit), sauvegardes restaurables **testées**, et
surveillance ([`11-exploitation.md`](11-exploitation.md)).

### 2.7 Violation de données (art. 33 et 34) — **absent du projet jusqu'ici**

**72 heures** pour notifier l'autorité de contrôle après avoir eu connaissance d'une violation ;
information des personnes concernées si le risque est élevé. Cela suppose trois choses qui
n'existent pas encore : savoir qu'une violation a eu lieu (surveillance), savoir qui prévenir
(procédure écrite, coordonnées prêtes), et savoir **qui est touché** (le journal le permet).
→ ☐ tâche à créer dans le lot 8. Une procédure écrite après l'incident n'existe pas.

### 2.8 Analyse d'impact (art. 35)

Trois facteurs se cumulent ici : évaluation systématique d'aspects personnels (profil de
prospects), traitement à grande échelle par un moyen automatisé, et décisions produisant des
effets sur des personnes. **Une AIPD est très probablement obligatoire** avant le premier envoi
réel — et c'est **le client** qui en est responsable pour sa prospection, Sentio devant lui
fournir la matière. ⚖️ **conseil** — le périmètre exact et le porteur se confirment.

### 2.9 Conservation

Pas de « pour toujours par défaut » : chaque table porte une durée.

| Donnée | Durée | Fondement |
|---|---|---|
| Journal d'exécution | 30 jours | [`adr/0012`](adr/0012-retention-journal-30-jours.md), purge automatique en place |
| Mémoire d'entreprise, résultats | durée du contrat + effacement à la demande | contrat |
| Facturation et comptabilité | 10 ans | obligation légale — **prime sur l'effacement** |
| Diagnostic sans suite | ☐ à fixer (proposition : 12 mois) | intérêt légitime, à borner |
| Sauvegardes | ☐ à fixer, et à rendre cohérent avec l'effacement | — |

⚠️ **Piège connu :** une donnée effacée en base revient par une sauvegarde. La procédure
d'effacement doit dire ce qu'on fait des sauvegardes — la réponse admise est de ne pas les
rouvrir pour un effacement unitaire, mais de garantir leur péremption dans un délai annoncé.

---

## 3. Prospection électronique — le régime français

*Vérifié le 2026-07-29. Directive ePrivacy transposée à l'art. L. 34-5 CPCE, doctrine CNIL.*

**En B2B, le consentement préalable n'est pas requis** — un régime d'opposition suffit, **à trois
conditions cumulatives** :

1. l'objet du message est **en rapport avec la profession** de la personne démarchée ;
2. la personne a été **informée, au moment de la collecte de son adresse**, de cet usage ;
3. elle peut s'y opposer **simplement et gratuitement**, dans chaque message.

La condition 2 est celle que Sentio ne maîtrise pas : elle dépend de **l'origine des données**,
donc de la décision **D5**. Une liste achetée sans information des personnes rend la prospection
irrégulière quelle que soit la qualité du message — et c'est le client qui est en faute, avec
notre outil. D'où trois exigences produit :

- **tracer l'origine de chaque prospect** (`METIER-22` couvre le motif de sélection ; il faut
  aussi la **source**) ;
- **refuser d'envoyer** à un prospect dont l'origine n'est pas renseignée — plutôt que d'envoyer
  et d'espérer ;
- **porter l'information de l'article 14 dans le premier message** (voir §2.2), ce qui répare
  partiellement la condition 2 lorsque la collecte est indirecte. ⚖️ **conseil.**

Deux précisions utiles : le **droit d'opposition est absolu** — aucune justification n'est
demandée, et il s'applique immédiatement et définitivement ; les adresses **génériques**
(`contact@`, `info@`) ne sont pas des données personnelles, mais tout le reste du régime
(loyauté, identité de l'émetteur, opposition) continue de s'appliquer.

Enfin, **masquer l'identité de l'émetteur est interdit** (art. L. 34-5 CPCE). Le message doit
nommer l'entreprise cliente et porter des coordonnées valables. Le prénom de l'employé numérique
est un nom d'affichage ; il ne doit jamais servir à affirmer qu'une personne physique existe.
→ [`adr/0015`](adr/0015-transparence-ai-act.md).

---

## 4. Règlement européen sur l'IA

*Vérifié le 2026-07-29. Règlement (UE) 2024/1689, tel que modifié par le « digital omnibus »
adopté par le Parlement le 16 juin 2026 et validé par le Conseil le 29 juin 2026.*

| Obligation | Date | Concerne Sentio |
|---|---|---|
| **Art. 4** — compétence en matière d'IA | applicable | oui — à documenter |
| **Art. 50** — transparence, marquage des contenus générés | **2 août 2026** | **oui, les deux surfaces** |
| Sanctions (jusqu'à 35 M€ / 7 %) | applicable | oui |
| Annexe III — haut risque | reporté au 2 décembre 2027 | non — hors périmètre |
| Annexe I — haut risque | reporté au 2 août 2028 | non |

**Ce que l'omnibus a repoussé n'est pas ce qui nous concerne.** Décision, formulation et
compromis : [`adr/0015`](adr/0015-transparence-ai-act.md). Un sursis existe jusqu'au 2 décembre
2026 sur le marquage technique lisible par machine, mais **uniquement pour les systèmes déjà
commercialisés avant le 2 août 2026** : Sentio n'en bénéficie pas.

---

## 5. Droit commercial, consommation, facturation

| Obligation | Ce qu'elle impose | État |
|---|---|---|
| **Mentions légales** (LCEN) | identité, immatriculation, adresse, contact, hébergeur | ☐ bloqué par l'immatriculation |
| **CGU / CGV** | objet, prix, durée, résiliation, responsabilité, données | ☐ lot 8 |
| **Politique de confidentialité** | cohérente avec le registre — pas un texte générique | ☐ lot 8 |
| **Facturation** | mentions obligatoires, numérotation continue, conservation 10 ans | ☐ lot 8 |
| **Pratiques commerciales trompeuses** | ne pas laisser croire qu'un humain écrit, ni qu'un résultat est mesuré quand il est estimé | ✅ *déjà tenu par la conception* : démonstration scriptée annoncée, aucun chiffre sans ligne en base |
| **Facturation électronique** | calendrier français en cours de déploiement | ⚖️ **conseil** — à cadrer avec un comptable au moment de l'immatriculation |

Le droit de rétractation des consommateurs ne s'applique pas à une vente entre professionnels,
mais **les CGV doivent prévoir résiliation et sort des données** : c'est ce que regarde un client
sérieux, et c'est ce qui rend l'effacement exigible en pratique.

---

## 6. Ce qui bloque quoi

| À faire | Bloque | Qui |
|---|---|---|
| Immatriculation | mentions légales définitives, premier encaissement | le fondateur |
| Opt-out d'entraînement du fournisseur, prouvé et daté | **toute donnée réelle envoyée à un modèle** | le fondateur |
| Registre des traitements tenu | rien techniquement, tout juridiquement | le fondateur |
| Contrat de sous-traitance **fourni aux clients** | le premier client sérieux | ⚖️ conseil |
| Contrats avec les prestataires | le premier client réel | le fondateur |
| Procédure de violation de données (72 h) | la mise en ligne | le fondateur |
| AIPD prospection | le premier envoi réel | ⚖️ conseil |
| Information art. 14 dans chaque message | le premier envoi réel | code (lot 2) |
| Marquage lisible par machine des contenus | le premier envoi réel | code (lot 2) |
| Information de transparence du diagnostic | la mise en ligne de la vitrine | code (lot 4) |

---

## 7. Les quatre points à faire trancher par un conseil

Ils ne se règlent pas en lisant des textes, et se règlent mal après coup.

1. **L'étiquetage visible des messages de prospection.** L'analyse retenue est qu'il n'est pas
   obligatoire (ni hypertrucage, ni texte d'intérêt public). Défendable, pas certain.
2. **L'identité d'affichage d'un employé numérique.** Signer d'un prénom qui ne correspond à
   aucune personne, dans un message commercial, où est exactement la limite de la loyauté ?
3. **L'AIPD** : périmètre, porteur, et modèle à fournir aux clients.
4. **Le contrat de sous-traitance fourni aux clients**, et la clause sur les sous-traitants
   ultérieurs.

---

## 8. Ce que ce document ne dit pas

Il ne traite ni du droit du travail, ni de la propriété intellectuelle des contenus produits, ni
de la responsabilité contractuelle en cas de dommage causé à un client par un employé numérique.
Ces trois sujets existent, aucun ne bloque le développement, tous méritent d'être ouverts avant
de vendre à une entreprise plus grosse que la sienne.
