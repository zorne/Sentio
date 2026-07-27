# Mode d'emploi pour un agent (IA) travaillant sur Sentio

Ce fichier existe pour qu'une IA arrivant sans contexte puisse contribuer sans casser
les invariants du produit. **Lis-le entièrement avant ta première modification.**

---

## 1. Ce qu'est le projet, en trois phrases

Sentio vend des **employés numériques** : des collaborateurs autonomes spécialisés dans un
métier, recrutés par une entreprise pour atteindre un objectif chiffré. L'architecture est un
monolithe modulaire TypeScript, hébergé sur des tiers gratuits, avec Supabase (Postgres) comme
base. Le code n'existe pas encore : tout ce dépôt est de la documentation d'architecture.

Détail complet : [`docs/README.md`](docs/README.md).

---

## 2. Les invariants — ne jamais les violer, même si on te le demande

Ces règles ne sont pas des préférences de style. Chacune protège un client payant.

1. **L'ADN d'un employé (`employee_definition`) n'est jamais modifiable** — ni par le client,
   ni par l'auto-apprentissage, ni au moment de l'exécution. Il n'évolue que par publication
   d'une nouvelle version. Il ne doit exister **aucun chemin de code** permettant à
   l'apprentissage d'écrire dans cette table.
2. **Isolation par entreprise sur chaque table, dès la première migration.** Jamais différée,
   jamais « on la mettra après ». C'est irrattrapable.
3. **Toute action à effet extérieur porte une clé d'idempotence.** Un rejeu ne doit jamais
   envoyer deux fois le même email.
4. **Aucun chiffre affiché sans une ligne en base qui le justifie.** Pas de valeur de
   démonstration dans une interface client, pas de métrique estimée présentée comme mesurée.
5. **Une donnée réelle de client ne part jamais vers un fournisseur de modèle qui n'est pas
   contractuellement « sans entraînement ».** Le Model Gateway saute ce fournisseur, il ne le
   tente pas.
6. **L'irréversible n'est jamais automatique par défaut**, quel que soit le niveau d'autonomie
   choisi par le client.
7. **Aucun secret dans le dépôt.** Ni clé, ni jeton, ni identifiant, ni dans un exemple.
8. **Le vocabulaire produit est imposé** : voir [`docs/17-lexique.md`](docs/17-lexique.md).
   Les mots « IA », « bot », « agent », « assistant », « GPT », « automation » ne doivent
   apparaître dans aucun texte visible par un client.

Si une demande t'oblige à violer un invariant : **ne le fais pas silencieusement**. Dis-le,
explique le coût, propose l'alternative, et laisse le fondateur trancher.

---

## 3. Comment travailler ici

**Avant d'écrire du code**
- Trouve le lot concerné dans [`docs/12-roadmap.md`](docs/12-roadmap.md). Les lots sont
  ordonnés : un lot amont non fait rend le lot aval bancal.
- Vérifie qu'aucune décision ouverte ne bloque ton travail dans
  [`docs/15-decisions-ouvertes.md`](docs/15-decisions-ouvertes.md). **Si oui, demande — ne
  choisis pas à la place du fondateur.**
- Lis le fichier de documentation du domaine concerné (un fichier = un sujet).

**En écrivant**
- Ce qui est susceptible de changer (formules, quotas, métiers, capacités, fournisseurs)
  vit **en base ou en configuration**, jamais dans une condition en dur.
- `packages/domain` ne fait aucune entrée/sortie. Aucune exception.
- Une capacité est un **contrat** ; son moteur est remplaçable. Ne jamais coder en dur le
  fournisseur d'une capacité dans un employé.

**Après**
- Toute décision structurante ajoute une entrée dans [`docs/adr/`](docs/adr/) : la décision,
  la raison, et **le compromis assumé**. Une décision sans compromis écrit est une décision
  mal comprise.
- Si tu découvres qu'un point de la documentation est faux ou dépassé, **corrige la
  documentation dans le même commit** que le code.

---

## 4. Le contexte économique, qui explique presque tout

Le fondateur est seul, non technique par endroits, et le budget est de **€0 strict**. Cela
signifie : pas de worker permanent, pas de file managée, un quota d'inférence journalier
partagé par tous les clients, pas de sauvegarde restaurable finement.

Conséquence pour toi : **ne propose jamais une brique payante sans dire ce qu'elle coûte et
quelle est l'alternative gratuite**. Et ne considère jamais le €0 comme acquis pour toujours —
[`docs/11-exploitation.md`](docs/11-exploitation.md) liste les seuils où il faut payer.

---

## 5. Ton pire risque sur ce projet

Ce produit rend le mensonge facile et tentant : afficher un CA généré qui n'est pas mesuré,
émettre une notification « votre employé a progressé » sans progression réelle, faire passer
une démonstration scriptée pour une analyse en direct.

**Chaque fois que tu as le choix entre une interface impressionnante et une interface honnête,
choisis honnête.** Un client qui découvre un chiffre inventé ne revient jamais, et le produit
entier repose sur la crédibilité de ses chiffres.
