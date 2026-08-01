# Mode d'emploi pour un agent (IA) travaillant sur Sentio

Ce fichier existe pour qu'une IA arrivant sans contexte puisse contribuer sans casser
les invariants du produit. **Lis-le entièrement avant ta première modification.**

---

## 1. Ce qu'est le projet, en trois phrases

Sentio vend des **employés numériques** : des collaborateurs autonomes spécialisés dans un
métier, recrutés par une entreprise pour atteindre un objectif chiffré. L'architecture est un
monolithe modulaire TypeScript, hébergé sur des tiers gratuits, avec Supabase (Postgres) comme
base. Les lots 0 à 2 sont écrits — schéma, noyau, métier commercial.

**L'interface vit dans `apps/vitrine`** (Next.js 15), fusionnée depuis un dépôt antérieur et
déployée sur Vercel, avec son propre noyau dans `packages/vitrine-core`. Elle ne partage encore
rien avec `packages/core`, `domain`, `capabilities` ni `db` : ce sont deux ensembles cohérents
côte à côte, et leur rapprochement est un chantier en soi, pas un effet de bord à provoquer au
détour d'une tâche.

⚠️ Conséquence à connaître avant d'écrire du texte visible : `apps/vitrine` **n'a pas de contrôle
automatique de lexique**. L'ancienne vitrine SvelteKit tenait tout son texte dans un `labels.ts`
que l'intégration continue relisait ; ce fichier a disparu avec elle. Le lexique de
[`docs/17-lexique.md`](docs/17-lexique.md) s'applique toujours — il n'est simplement plus défendu
par une machine. Écris-le juste du premier coup.

Détail complet : [`docs/README.md`](docs/README.md).

---

## 1 bis. Les six priorités — l'ordre qui tranche les arbitrages

**Sentio est un logiciel destiné à des entreprises exigeantes, pas un produit minimum viable.**
Quand deux exigences s'opposent, celle qui est le plus haut dans cette liste gagne — et les cinq
premières gagnent **toujours** contre le délai. Décision du fondateur :
[`docs/adr/0019`](docs/adr/0019-priorites-ingenierie.md), à lire avant tout arbitrage
d'architecture.

1. **Sécurité** — moindre privilège, validation de **toutes** les entrées, aucune donnée sensible
   dans les journaux, chiffrement du sensible, secrets uniquement en variables d'environnement.
   Aucune décision ne la sacrifie pour gagner du temps.
2. **Confidentialité** — privacy by design réel : isolation stricte entre entreprises, RGPD,
   **collecte minimale**, effacement possible, journalisation des accès sensibles. On ne collecte
   pas « au cas où ».
3. **Architecture** — propre, modulaire, découplée. **Tout service externe reste derrière une
   interface** et n'est nommé que dans son adaptateur.
4. **Fiabilité** — rendre les bugs critiques improbables, pas seulement rares. **Un correctif sans
   test qui échoue avant lui n'est pas un correctif.** Idempotence et transactions sur les
   traitements critiques.
5. **Observabilité** — journaux structurés, métriques, identifiant de corrélation, audit des
   actions sensibles : un incident doit se comprendre vite.
6. **Qualité avant rapidité** — repousser une fonctionnalité plutôt qu'introduire de la dette.

Signaler au fondateur toute **découverte d'architecture** — un manque structurel révélé en
écrivant, comme l'identifiant de message absent qui empêchait de rattacher un rebond. Ce sont ces
points-là qui renforcent le produit, et ils se perdent s'ils ne sont pas dits.

---

## 1 ter. Ce qui peut être vérifié automatiquement doit l'être

Décision du fondateur, [`docs/adr/0024`](docs/adr/0024-verification-automatique.md) : **une règle
défendue par la mémoire du développeur est une règle déjà perdue.** Cinq principes, dans cet ordre,
qui prolongent les six priorités :

1. sécurité avant fonctionnalités ;
2. confidentialité avant simplicité ;
3. architecture avant vitesse ;
4. **automatisation avant vérification manuelle** ;
5. **tests avant fusion**.

Conséquences pour toi, sans exception :

- **Une commande définit « vérifié » : `pnpm run verify`.** Lint, frontières d'architecture, types,
  tests, construction, et les fonctions sous Deno. Elle tourne aussi avant chaque envoi
  ([`.githooks/pre-push`](.githooks/pre-push)) et dans l'intégration continue.
- **N'écris jamais « à vérifier à la revue » ou « penser à ».** Si c'est mécaniquement décidable,
  ajoute le contrôle dans [`scripts/verifier-frontieres.mjs`](scripts/verifier-frontieres.mjs) ou un
  test. Si ça ne l'est pas — un geste de console, une preuve datée —, écris-le à l'endroit prévu
  ([`docs/20-plan-action.md`](docs/20-plan-action.md)) et rappelle-le au moment utile.
- **Un contrôle bruyant s'ajuste, il ne se contourne pas.** Une exception silencieuse vaut
  suppression du contrôle.
- **Toute décision qui remettrait en cause l'un de ces cinq principes se soumet au fondateur
  *avant* d'être implémentée.**

---

## 2. Les invariants — ne jamais les violer, même si on te le demande

Ces règles ne sont pas des préférences de style. Chacune protège un client payant.

1. **L'ADN d'un employé (`employee_definition`) n'est jamais modifiable** — ni par le client,
   ni par l'auto-apprentissage, ni au moment de l'exécution. Il n'évolue que par publication
   d'une nouvelle version. Il ne doit exister **aucun chemin de code** permettant à
   l'apprentissage d'écrire dans cette table.
2. **Isolation par entreprise sur chaque table, dès la première migration.** Jamais différée,
   jamais « on la mettra après ». C'est irrattrapable. Elle ne se limite pas à filtrer les
   lectures : **une ligne ne change jamais d'entreprise**, et **une clé étrangère entre deux
   tables client porte toujours `tenant_id`**, sans quoi un lien peut relier deux entreprises.
   Ces deux règles sont tenues par la base (migrations `0033` et `0034`), donc valables aussi
   pour le rôle de service, qui ignore RLS.
   **Et ce n'est pas qu'une règle technique : aucune donnée d'une entreprise n'atteint jamais une
   autre entreprise — jamais partagée, jamais agrégée, jamais dérivée, même à la demande d'un
   client, même anonymisée.** Décision du fondateur, non négociable :
   [`docs/adr/0014`](docs/adr/0014-etancheite-entre-entreprises.md). Une fonctionnalité qui la
   viole se refuse, elle ne se code pas — y compris un repère comparatif, une liste d'exclusion
   mutualisée ou un apprentissage transversal.
3. **Toute action à effet extérieur porte une clé d'idempotence.** Un rejeu ne doit jamais
   envoyer deux fois le même email.
4. **Aucun chiffre affiché sans une ligne en base qui le justifie.** Pas de valeur de
   démonstration dans une interface client, pas de métrique estimée présentée comme mesurée.
5. **Une donnée réelle de client ne part jamais vers un fournisseur de modèle qui n'est pas
   « sans entraînement »** — par clause contractuelle, ou par opt-out documenté, vérifié et daté.
   Le Model Gateway saute ce fournisseur, il ne le tente pas. Tant que l'opt-out n'est pas prouvé,
   le fournisseur est **non conforme**. Voir [`docs/adr/0009`](docs/adr/0009-fournisseur-inference-ue.md),
   qui assouplit cet invariant et en explique le coût.
6. **L'irréversible n'est jamais automatique par défaut**, quel que soit le niveau d'autonomie
   choisi par le client.
7. **Aucun secret dans le dépôt.** Ni clé, ni jeton, ni identifiant, ni dans un exemple.
8. **Le vocabulaire produit est imposé.** [`docs/17-lexique.md`](docs/17-lexique.md) est la
   **source unique** de la liste des mots interdits dans un texte visible par un client — « IA »,
   « bot », « agent », « assistant », « GPT », « automation » et d'autres. Ne pas recopier la
   liste ailleurs : trois copies divergentes valent zéro règle.

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
