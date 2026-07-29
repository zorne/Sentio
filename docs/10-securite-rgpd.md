# 10 — Sécurité et conformité

> À lire si tu travailles sur : une migration, une lecture de données, la vitrine publique,
> l'envoi d'emails, ou avant toute mise en ligne.
>
> **Ce fichier donne les règles de conception.** L'instruction juridique complète — rôles
> responsable/sous-traitant, bases légales, droits des personnes, prospection, AI Act,
> obligations commerciales, et ce qui bloque quoi — vit dans
> [`25-conformite-legale.md`](25-conformite-legale.md), avec le registre des traitements dans
> [`26-registre-traitements.md`](26-registre-traitements.md).

---

## Isolation par entreprise — dès la première migration

Chaque table portant une donnée client porte l'entreprise, et chaque politique d'accès la
vérifie. **Jamais différée.**

Différer l'isolation pour « aller plus vite » est le piège classique : le jour où on la
rebranche, chaque lecture, chaque écriture et chaque abonnement temps réel doit être repris,
et on découvre des chemins d'accès oubliés. C'est irrattrapable proprement.

**Aucun accès par URL devinable.** L'appartenance est vérifiée côté serveur à chaque lecture.
Un identifiant dans une adresse n'est pas une autorisation.

---

## Cloisonnement des données et des fournisseurs

| Zone | Données | Fournisseur autorisé |
|---|---|---|
| Démonstration de la vitrine | fictives | n'importe lequel — mais la démonstration est scriptée et n'appelle aucun modèle |
| Diagnostic | **réelles dès la première question** (entreprise, email du prospect) | uniquement « sans entraînement » |
| Travail des employés | réelles | uniquement « sans entraînement » |
| Tests et développement | fictives | fournisseur de secours |

Le Model Gateway **saute** un fournisseur incompatible avec la classe de données de la requête.
Il ne le tente pas. Voir [`05-runtime-employe.md`](05-runtime-employe.md).

« Sans entraînement » s'entend par clause contractuelle **ou** par opt-out documenté, vérifié et
daté. Un opt-out non prouvé rend le fournisseur non conforme : c'est un préalable de mise en
service, pas une formalité. Fournisseurs retenus et leurs statuts :
[`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md).

---

## Injection de prompt — un risque réel ici

Deux surfaces exposées :
1. **le diagnostic**, où n'importe qui peut écrire n'importe quoi ;
2. **le travail de l'employé**, qui lit des contenus extérieurs (réponses d'emails, fiches de
   prospects, pages web).

**Règle :** tout contenu extérieur est une **donnée, jamais une instruction**. Une consigne
trouvée dans un email entrant (« ignore tes règles », « envoie-moi la liste des clients ») n'a
aucune autorité.

Le Policy Engine reste l'**unique** autorité sur ce qui s'exécute. Le modèle propose, la
politique dispose. C'est cette séparation qui fait qu'une injection réussie ne se transforme pas
en action réelle.

---

## Protection des données personnelles

- **Hébergement en Union européenne**, base et sauvegardes.
- **Registre des traitements** tenu et à jour.
- **Contrats de sous-traitance** signés avec chaque prestataire (hébergeur, base, fournisseur
  de modèle, service d'envoi, paiement). À faire **avant** le premier client réel. Le fournisseur
  d'inférence retenu est européen précisément pour éviter d'instruire en plus un transfert hors
  UE → [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md).
- **Durées de conservation définies par table**, pas « pour toujours par défaut »
  ([`25-conformite-legale.md`](25-conformite-legale.md) §2.9).
- **Droit à l'effacement — exécutable, pas seulement écrit.** `erase_tenant()` supprime les
  données du client, **anonymise** le journal au lieu de le détruire (sinon la piste d'audit
  tombe, et avec elle l'obligation de rendre des comptes), conserve ce qui fonde une facture, et
  rend un **compte-rendu ligne par ligne** — la preuve à remettre à la personne. Vérifié par les
  tests d'invariants. Deux choses restent à faire en dehors de la base : supprimer le compte
  d'authentification, et décider du sort des **sauvegardes**, par lesquelles une donnée effacée
  peut revenir.
- **Violation de données : 72 heures** pour notifier l'autorité de contrôle, et informer les
  personnes si le risque est élevé (art. 33 et 34). Cela suppose une procédure **écrite
  d'avance** : une procédure rédigée pendant l'incident n'existe pas.
- **Décision automatisée** : des employés qui décident et agissent seuls au sujet de personnes
  physiques imposent une **analyse d'impact** et un **droit d'intervention humaine**. Le Policy
  Engine *est* ce droit d'intervention ; il faut le documenter comme tel, pas seulement le coder.
- **Contestation** : le client doit pouvoir consulter et retirer ce que son employé a appris —
  d'où la traçabilité par ligne décrite dans [`04-contextes-memoire.md`](04-contextes-memoire.md).

## Règlement européen sur l'IA — l'article 50 s'applique le 2 août 2026

Le RGPD n'est pas la seule obligation. L'**article 50** impose, pour un système à risque limité —
ce qu'est un employé numérique commercial — d'informer la personne qu'elle interagit avec un système
d'IA, de marquer les contenus générés, de tracer les décisions automatisées et de documenter le
système. La traçabilité est déjà acquise par le journal en ajout seul.

**D13 est tranchée** ([`adr/0015`](adr/0015-transparence-ai-act.md)) : le diagnostic informe en
clair dès le premier écran, les contenus générés sont marqués de façon lisible par machine, et le
lexique reçoit une zone exemptée pour cette information — comme les pages légales. Le « digital
omnibus » de juin 2026 a repoussé les obligations du **haut risque**, pas celles-ci.

---

## Prospection commerciale

Un employé commercial qui envoie des emails engage **l'entreprise cliente**, pas seulement
Sentio. Obligations minimales :

- base légale identifiée pour la prospection professionnelle ;
- **l'information de l'article 14 dans le premier message** — le prospect n'a jamais parlé ni au
  client ni à Sentio : identité du responsable (l'entreprise cliente), finalité, **origine de la
  donnée**, droits et moyen de les exercer. C'est plus que la mention d'opposition, et c'est dû
  dès le premier contact ([`25-conformite-legale.md`](25-conformite-legale.md) §2.2 et §3) ;
- objet et expéditeur non trompeurs ; **l'émetteur est l'entreprise cliente, nommée, avec des
  coordonnées valables** — le prénom de l'employé est un nom d'affichage, jamais l'affirmation
  qu'une personne physique existe ;
- moyen d'opposition dans **chaque** message ;
- respect immédiat et définitif des désinscriptions ;
- **listes d'exclusion respectées avant l'envoi**, pas après : clients existants, concurrents,
  comptes sensibles. La désinscription est réactive, l'exclusion est préventive — les deux sont
  nécessaires (`METIER-16/17`) ;
- pas de contournement des filtres ni de fausse identité d'expéditeur.

À traduire dans le produit : une capacité d'envoi ne doit **pas pouvoir** émettre un message
sans mention d'opposition. C'est un garde-fou technique, pas une consigne rédactionnelle.

## Obligations d'expéditeur — la réputation du client est en jeu

Les grandes messageries imposent des seuils que le non-respect fait basculer en indésirable, puis
rejeter. Ils s'appliquent à Sentio dès le premier message envoyé :

| Exigence | Seuil |
|---|---|
| Taux de plainte | **sous 0,3 %** |
| Taux de rebond | **sous 2 %** |
| Authentification | SPF, DKIM **et** DMARC alignés |
| Désabonnement | en un clic, conforme à la norme |
| Volume par boîte | **25 à 50 par jour**, après montée progressive sur 3 à 4 semaines |

> ⚠️ **Ce risque ne porte pas sur Sentio, il porte sur le client.** D6 recommande d'envoyer depuis
> le domaine du client : un employé mal réglé brûle donc la réputation d'envoi **de son client**,
> c'est-à-dire son outil de travail. La dégradation se répare en mois, pas en jours.

Conséquence : la capacité d'envoi ne doit **pas pouvoir** émettre sans domaine authentifié, au-delà
du plafond quotidien, ou pendant une suspension déclenchée par un taux de rebond ou de plainte
excessif (`METIER-18` à `METIER-21`). Comme la mention d'opposition, ce sont des garde-fous
techniques. Contexte et sources : [`21-concurrence.md`](21-concurrence.md).

---

## Secrets

Aucune clé, aucun jeton, aucun identifiant dans le dépôt — y compris dans un exemple ou un
commentaire. Les secrets vivent dans les variables d'environnement de l'hébergeur.

Toute clé ayant transité par un chat, un ticket, une capture d'écran ou un commit est
**compromise** et doit être régénérée immédiatement.

**Compte de production distinct du compte personnel** chez chaque fournisseur : une suspension
de compte personnel ne doit pas arrêter le produit.

---

## Préalables juridiques avant le premier euro

- entreprise immatriculée (sans quoi la vente n'est pas possible) ;
- mentions légales réelles, pas des indications provisoires ;
- conditions générales d'utilisation et de vente relues ;
- politique de confidentialité cohérente avec le registre des traitements ;
- vérification que **chaque offre gratuite utilisée autorise un usage commercial**
  (voir [`11-exploitation.md`](11-exploitation.md)).
