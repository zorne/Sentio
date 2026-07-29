# 26 — Registre des traitements (RGPD art. 30)

> Document **juridique**, pas documentation technique. Il doit être tenu par écrit, à jour, et
> présentable à l'autorité de contrôle sur demande.
>
> Établi le **2026-07-29**. À mettre à jour **au moment où un traitement change**, jamais « à la
> prochaine revue ». Base de rédaction : [`25-conformite-legale.md`](25-conformite-legale.md).

Les champs entre crochets se remplissent à l'immatriculation. Un registre incomplet vaut mieux
qu'un registre absent — mais un registre qui décrit un produit qui n'existe pas encore ne vaut
rien : les traitements marqués **⏳** ne sont pas actifs, ils sont déclarés d'avance pour que la
mise en service ne se fasse pas sans eux.

**Responsable de traitement :** [raison sociale], [SIREN], [adresse], [email de contact].
**Délégué à la protection des données :** non désigné — la désignation n'est pas obligatoire ici
(pas d'autorité publique, pas de suivi systématique à grande échelle en tant que responsable, pas
de données sensibles). À réexaminer si la prospection change d'échelle. ⚖️

---

## Partie I — Traitements dont Sentio est **responsable** (art. 30.1)

### T1 — Diagnostic d'un visiteur de la vitrine ⏳

| | |
|---|---|
| **Finalité** | comprendre le besoin d'un visiteur et lui recommander, ou non, un employé numérique |
| **Base légale** | mesures précontractuelles à sa demande ; intérêt légitime pour la mesure du produit |
| **Personnes** | visiteurs professionnels de la vitrine |
| **Données** | contenu de la conversation, profil extrait (secteur, taille, frein), email si donné, empreinte technique de limitation, adresse IP |
| **Destinataires** | fournisseur d'inférence UE (sous-traitant ultérieur), hébergeur, base |
| **Transferts hors UE** | aucun — condition de conception ([`adr/0009`](adr/0009-fournisseur-inference-ue.md)) |
| **Conservation** | ☐ à fixer — proposition : 12 mois sans suite, puis suppression |
| **Sécurité** | isolation stricte d'avec l'espace client, enveloppe d'inférence dédiée, limitation par visiteur |

> ⚠️ Ce traitement envoie des **données réelles à un modèle dès la première question**. Il ne peut
> pas être mis en service tant que l'opt-out d'entraînement n'est pas activé **et prouvé**.

### T2 — Comptes et accès à l'espace privé ⏳

| | |
|---|---|
| **Finalité** | authentifier les membres d'une entreprise cliente et leur ouvrir son espace |
| **Base légale** | exécution du contrat |
| **Personnes** | dirigeants et salariés des entreprises clientes |
| **Données** | email, identifiant de compte, rôle dans l'entreprise, dates de connexion |
| **Destinataires** | hébergeur d'identité, base |
| **Transferts hors UE** | aucun — à confirmer par écrit auprès de l'hébergeur d'identité ⚖️ |
| **Conservation** | durée du contrat, puis effacement (`erase_tenant`) |
| **Sécurité** | lien magique, isolation par entreprise vérifiée à quatre couches |

### T3 — Abonnement, paiement et facturation ⏳

| | |
|---|---|
| **Finalité** | encaisser l'abonnement, établir et conserver les factures |
| **Base légale** | exécution du contrat ; obligation légale pour la conservation comptable |
| **Personnes** | clients |
| **Données** | identité de facturation, référence de transaction. **Aucune donnée bancaire ne touche Sentio** : le paiement est hébergé chez le prestataire |
| **Destinataires** | prestataire de paiement, comptable |
| **Conservation** | **10 ans** — cette durée prime sur une demande d'effacement (art. 17.3.b) |

### T4 — Journal d'exécution, surveillance et sécurité

| | |
|---|---|
| **Finalité** | prouver ce qui s'est passé, reprendre après panne, détecter un incident |
| **Base légale** | intérêt légitime ; obligation de rendre des comptes (art. 5.2) |
| **Personnes** | membres des entreprises clientes, personnes mentionnées dans le travail des employés |
| **Données** | événements horodatés, contenu de l'action, clé d'idempotence |
| **Conservation** | **30 jours**, purge automatique ([`adr/0012`](adr/0012-retention-journal-30-jours.md)) ; **anonymisation** en cas d'effacement, jamais destruction |
| **Sécurité** | ajout seul garanti par déclencheur, inaccessible aux rôles clients |

### T5 — Sauvegardes ⏳

| | |
|---|---|
| **Finalité** | restaurer le service et les données après incident |
| **Base légale** | intérêt légitime |
| **Conservation** | ☐ à fixer, et à rendre **cohérente avec la procédure d'effacement** |
| **Point ouvert** | une donnée effacée revient par une sauvegarde : la règle retenue doit être écrite et annoncée |

### T6 — Prospection commerciale de Sentio pour son propre compte ⏳

| | |
|---|---|
| **Finalité** | trouver les premiers clients (phase 10 du plan d'action) |
| **Base légale** | intérêt légitime, régime B2B d'opposition |
| **Personnes** | dirigeants et responsables des entreprises ciblées |
| **Données** | nom, fonction, email professionnel, entreprise, **origine de la donnée** |
| **Conservation** | ☐ à fixer — proposition : 3 ans sans relation commerciale |
| **Obligations** | les **mêmes règles que celles imposées aux employés numériques** s'appliquent au fondateur : objet en rapport avec la profession, information, opposition dans chaque message |

---

## Partie II — Traitements dont Sentio est **sous-traitant** (art. 30.2)

*Effectués pour le compte de chaque entreprise cliente, qui en est responsable. Le contrat de
sous-traitance à leur fournir (art. 28) est un préalable au premier client sérieux.*

### S1 — Exploitation d'un employé numérique ⏳

| | |
|---|---|
| **Responsable** | l'entreprise cliente |
| **Catégories de traitement** | collecte, enregistrement, consultation, effacement des données confiées : mémoire d'entreprise, objectifs, tâches, résultats déclarés |
| **Sous-traitants ultérieurs** | hébergeur de la base (UE), fournisseur d'inférence (UE), hébergeur de l'interface, service d'envoi d'emails |
| **Transferts hors UE** | aucun |
| **Sécurité** | isolation par entreprise à quatre couches, journal en ajout seul, effacement sur demande avec compte-rendu |

### S2 — Prospection pour le compte du client ⏳

| | |
|---|---|
| **Responsable** | l'entreprise cliente |
| **Personnes** | prospects du client — **des tiers qui n'ont rien demandé** |
| **Données** | identité professionnelle, coordonnées, échanges, **origine de la donnée**, motif de sélection |
| **Obligations portées par le produit** | information de l'article 14 **dans le premier message**, moyen d'opposition dans chaque message, respect immédiat des désinscriptions, listes d'exclusion vérifiées **avant** l'envoi |
| **Analyse d'impact** | **probablement obligatoire**, portée par le client, matière fournie par Sentio ⚖️ |

---

## Partie III — Analyse d'impact : le pré-examen (art. 35)

| Critère | Rencontré ? |
|---|---|
| Évaluation ou notation de personnes | oui — qualification de prospects |
| Traitement automatisé avec effet sur les personnes | oui — messages envoyés sans intervention humaine |
| Collecte à grande échelle | dépend du volume ; à réévaluer dès la montée en charge |
| Données sensibles | non |
| Personnes vulnérables | non |
| Croisement de jeux de données | possible selon l'origine des prospects (**D5**) |
| Usage innovant | oui, au sens du règlement |

**Trois critères au moins sont rencontrés. Une AIPD doit être considérée comme obligatoire avant
le premier envoi réel**, portée par le client responsable, avec un modèle fourni par Sentio.
⚖️ à confirmer.

---

## Partie IV — Sous-traitants ultérieurs

À tenir à jour : c'est la liste qu'un client peut exiger, et celle qu'il faut pouvoir montrer.

| Prestataire | Rôle | Région | Contrat art. 28 | Opt-out d'entraînement |
|---|---|---|---|---|
| Base de données et authentification | hébergement des données clients | UE (`eu-north-1`) | ☐ | sans objet |
| Fournisseur d'inférence | exécution des modèles | UE | ☐ | ☐ **bloquant** |
| Hébergeur de l'interface | vitrine et espace privé | ☐ (décision D12) | ☐ | sans objet |
| Service d'envoi d'emails | messages des employés | ☐ | ☐ | sans objet |
| Prestataire de paiement | encaissement | ☐ | ☐ | sans objet |

Aucune case cochée à ce jour. **Aucune ne bloque le développement ; toutes bloquent le premier
client réel.**
