# 22 — Niche et verticalisation

> À lire si tu travailles sur : l'ADN du métier, le diagnostic, les capacités, ou le choix de la
> cible commerciale.
>
> **Vérifié le 2026-07-28.** Document **interne**. Les chiffres de marché sont périssables.

Ce fichier répond à une question simple : **faut-il un employé générique ou un employé de niche ?**
Les données ne sont pas ambiguës, et elles remettent en cause une décision déjà actée.

---

## Le vertical écrase l'horizontal

| Mesure | Vertical (niche) | Horizontal (générique) |
|---|---|---|
| Rétention | **3 à 5× supérieure** | référence |
| Revenu net à l'échéance | 110-130 % | 90-95 % |
| Produit encore utile à 6 mois | **71 %** | 32 % |
| Retour sur investissement moyen | **2,3×** | référence |
| Croissance du segment | 36,5 %/an | 18,9 %/an |

Ces écarts ne sont pas des marges d'erreur, ce sont des ordres de grandeur. Un produit horizontal
perd son client dans l'année ; un produit vertical le garde et lui vend davantage.

**La raison est structurelle :** l'avantage défendable se forme à la **couche donnée métier**, pas à
la couche modèle. Le vocabulaire d'un secteur, ses cycles, ses objections, ses interlocuteurs, ses
obligations — tout cela se réplique lentement. Un modèle se remplace en une ligne de configuration.

**Et le segment est libre :** les éditeurs financés vendent tous vers le haut et laissent les TPE et
les indépendants ouverts. Des produits verticaux sur des métiers étroits atteignent 10 K$ de revenu
mensuel **sans équipe commerciale**, par la distribution via les fédérations professionnelles. C'est
exactement le profil accessible à un fondateur seul sans budget.

---

## La décision prise : la niche est celle du client

Deux façons de capter cet avantage. **Sentio a retenu la seconde**
([`adr/0011`](adr/0011-generaliste-profils-sectoriels.md)) :

| Approche | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **Sentio se restreint à une niche** | avantage vertical plein, canal de distribution évident (fédération, salon, liste) | renonce à tous les autres secteurs, pari sur une niche unique |
| **Sentio reste généraliste, la niche est celle du client** *(retenu)* | vision d'origine préservée, aucun client refusé, avantage sectoriel construit progressivement | avantage vertical partiel au départ, **et aucun canal de distribution évident** |

La spécialisation se fait donc **par client, au calibrage** : le diagnostic identifie le secteur, le
moteur déterministe sélectionne le profil sectoriel correspondant, et celui-ci est injecté au
recrutement.

**Le mécanisme qui rend cela possible.** L'apprentissage inter-entreprises est une ligne rouge
([`08-evolution-apprentissage.md`](08-evolution-apprentissage.md)) : sans mécanisme, le dixième client
d'un secteur repartirait de zéro comme le premier, et la connaissance sectorielle ne s'accumulerait
jamais. La table `sector_profile` résout ça : une connaissance sectorielle **rédigée par Sentio**, à
partir de sources publiques et de son propre travail de terrain — **jamais dérivée des données d'un
client pour en servir un autre**. La ligne rouge tient.

**Ce que ça implique en pratique :** Sentio est moyen partout avant d'être bon quelque part.
Chaque profil sectoriel écrit améliore le produit pour tous les futurs clients de ce secteur. Mieux
vaut trois profils solides que douze approximatifs, et **quand aucun profil ne correspond, il faut le
dire au client** plutôt que d'improviser — un profil sectoriel bâclé fait parler l'employé avec
assurance dans un vocabulaire qu'il maîtrise mal, ce qui est une panne silencieuse.

> **Le coût réel de ce choix est commercial, pas technique.** Une niche unique donne un canal de
> distribution. Un produit généraliste n'en a pas, et la phase 10 du plan d'action en devient plus
> difficile — c'est là qu'il faudra compenser.

---

## Où sont les niches, au 2026-07

**Déjà encombrées par des acteurs financés** — à éviter pour un fondateur seul : juridique, santé,
support client, assurance, et la voix pour les métiers techniques du bâtiment. Ces segments ont vu
émerger des acteurs à plusieurs centaines de millions de revenu annuel et des valorisations en
milliards. On n'y entre pas sans capital.

**Encore ouvertes** — première place encore prenable : gestion de cabinets vétérinaires, conformité
des sous-traitants du bâtiment, analyse d'investissement immobilier, pompes funèbres, experts
d'assurance indépendants.

**La règle qui structure le choix :** *rester plus étroit que ce que les acteurs financés acceptent
d'être.* Un marché de 5 à 50 K$ de revenu mensuel est invisible pour un éditeur levé — et
parfaitement viable pour une personne seule.

### Dans quel ordre écrire les profils sectoriels

Sentio n'a pas à choisir **un** secteur, mais il doit choisir **par lequel commencer** — la charge
éditoriale est réelle et une personne seule ne couvre pas douze secteurs. Grille de priorité :

| Critère | Pourquoi il compte |
|---|---|
| **Tu peux y atteindre des clients** | le premier profil doit servir une vente réelle, pas un exercice |
| Le blocage y est commercial | Sentio vend un commercial : ailleurs, le produit ne sert à rien |
| Les prospects y sont listables | sinon la capacité « trouver des prospects » n'a rien à traiter |
| Ils peuvent payer un abonnement | une marge trop faible rend le prix impossible |
| Le vocabulaire y est spécifique | c'est ce qui rend le profil utile plutôt que décoratif |
| Aucun acteur financé n'y est déjà | inutile d'écrire un profil pour un terrain perdu d'avance |

> **Écrire un profil sectoriel n'engage à rien.** C'est un document versionné, pas une orientation
> d'entreprise : si le secteur ne donne rien, le profil dort en base sans coût. C'est ce qui rend
> cette approche moins risquée qu'un pari sur une niche unique — et c'est son principal mérite.

---

## Ce que le client peut réellement demander

Le diagnostic doit rester une vraie conversation qui interroge la situation du client, mais il faut
être précis sur ce qu'il produit — sinon on promet ce que l'employé ne tiendra pas.

| Couche | Adaptable au client ? | Contenu |
|---|---|---|
| **ADN** (`employee_definition`) | ❌ **jamais** | le métier, ses limites, ses règles, sa manière de raisonner. Commun à tous les clients de la niche, versionné, immuable |
| **Contexte entreprise** (`company_profile`) | ✅ **oui, largement** | objectifs, produits, processus, préférences, cible, ton, arguments, exclusions |
| **Capacités actives** (`employee_capability`) | ✅ oui, dans les limites de l'ADN | ce que cet employé fait réellement pour ce client |
| **Faits appris** (`learned_fact`) | ✅ oui, par l'usage | ce qui fonctionne sur ce marché précis |

« Le produit s'adapte au client » signifie donc : **la couche contexte entreprise est riche, et le
diagnostic la remplit sérieusement.** Cela ne signifie jamais un ADN modifiable — l'invariant 1 tient,
et c'est lui qui permet d'améliorer l'employé pour tous les clients d'un coup.

**La dette à surveiller :** chaque attente exprimée pendant le diagnostic est une promesse. Plus le
diagnostic laisse le client formuler de demandes, plus l'employé doit tenir. Les demandes hors
périmètre doivent être dites comme telles au moment où elles sont formulées, pas découvertes après la
vente.

---

## Conséquence sur le diagnostic

Le diagnostic ne recommande plus un métier — il **calibre** l'employé. Voir
[`adr/0010`](adr/0010-diagnostic-calibrage.md), qui remplace le compromis C7 par une décision réelle.
