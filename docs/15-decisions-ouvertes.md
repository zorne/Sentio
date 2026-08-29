# 15 — Décisions non tranchées

> À lire **avant de commencer un lot**. Si une décision de cette liste bloque ton travail :
> **demande au fondateur, ne choisis pas à sa place.**
>
> Quand une décision est tranchée : la retirer d'ici et créer une entrée dans [`adr/`](adr/).
>
> Le **choix du fournisseur d'inférence**, qui manquait à cette liste alors qu'il bloquait le
> lot 0, est tranché par [`adr/0009`](adr/0009-fournisseur-inference-ue.md).

---

## ✅ D1 — Périmètre métier de la V1 — TRANCHÉE, puis **rouverte et re-tranchée le 2026-08-15**

**Décision en vigueur : il n'y a pas de périmètre métier, parce qu'il n'y a pas de métier.**
Le noyau Lady est généraliste ; sa configuration sort du diagnostic
([`adr/0029`](adr/0029-noyau-lady-configure-dynamiquement.md),
[`28-bibliotheque-et-creation-de-lady.md`](28-bibliotheque-et-creation-de-lady.md)).
Ce qui borne la couverture réelle n'est plus une liste de métiers mais **le nombre d'actes écrits
dans la bibliothèque**.

*Historique :* un seul métier au lancement — Commercial ([`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md)),
après un revirement bref vers deux métiers acté puis annulé le même jour
([`adr/0007`](adr/0007-perimetre-v1-commercial-support.md)).

**Quatre décisions produit sont ouvertes par cette bascule** — voir
[`28`](28-bibliotheque-et-creation-de-lady.md) §9 : le mot « métier » côté client, le cumul de
domaines par une même Lady, le plancher de couverture qui déclenche `hors_perimetre`, et
l'autonomie sur un changement de configuration.

---

## D2 — Prix de Sentio Start

Nécessaire pour calculer le ROI affiché au client et pour connaître le seuil au-delà duquel
l'inférence coûte plus que l'abonnement ne rapporte.
**Bloque :** lots 5 et 6.

---

## D3 — Objectif de conversion : achat immédiat, ou audit/essai gratuit

**Recommandation :** un premier client servi à la main vaut plus qu'un tunnel entièrement
automatisé. **Bloque :** lot 5.

---

## D4 — Périodicité réelle du travail des employés

Continu, quotidien, hebdomadaire ?
**Recommandation :** quotidien en V1 — compatible €0, lisible pour le client, suffisant en
prospection. Détermine aussi le discours (« Carter travaille chaque jour »).
**Bloque :** lot 3.

---

## ✅ D5 — Source des prospects — TRANCHÉE

**Décision : le client fournit sa liste en V1 ; Sentio en trouvera en V2, une fois la
qualification éprouvée.** L'origine de chaque prospect devient obligatoire **en base** : un
prospect sans origine ne peut pas exister, donc ne peut pas être contacté.
→ [`adr/0016`](adr/0016-source-des-prospects.md)

---

## ✅ D6 — Domaine d'envoi — TRANCHÉE

**Décision : depuis le domaine du client, sous une contrainte qui commande tout le lot 2 —
*ne jamais délivrer un message qui pourrait brûler la réputation du client*.** Traduite en
conception : la capacité d'envoi ne doit pas **pouvoir** émettre quand une seule des sept
conditions manque (domaine authentifié, montée en charge, plafond du jour, aucune suspension,
destinataire hors exclusions, prospect qualifié et sourcé, mention d'opposition).
`METIER-18` à `METIER-21` ne sont donc pas des tâches du lot 2 : ce sont ses préalables.
→ [`adr/0017`](adr/0017-domaine-du-client-et-reputation.md)

---

## D7 — Niveau d'autonomie par défaut à la vente

**Recommandation :** `confirmer une fois` sur l'irréversible. **Bloque :** lot 3.

---

## D8 — Quand l'auto-apprentissage modifie le **profil entreprise**, s'applique-t-il seul ?

| Option | Conséquence |
|---|---|
| **Auto + notification** *(recommandé)* | conforme à « l'employé évolue seul », le dirigeant garde la possibilité de corriger |
| Proposition validée par le dirigeant | plus sûr, mais transforme l'employé en formulaire à valider |
| Auto silencieux | le client découvre un jour que son employé « croit » quelque chose de faux |

Dans tous les cas, le client conserve le droit d'écriture et de retrait sur **l'intégralité**
des deux tables de mémoire. Ne concerne **jamais** l'ADN.
**Bloque :** lot 7.

---

## ✅ D9 — Rétention du journal d'exécution — TRANCHÉE

**Décision finale : 30 jours en stockage principal**, archivage différé pour plus tard (non
tranché ici). → [`adr/0012`](adr/0012-retention-journal-30-jours.md)

---

## D10 — Le fondateur code-t-il seul l'ensemble ?

Détermine l'ordre des lots : automatisation complète d'abord, ou vendable d'abord avec un
premier client servi à la main. Voir [`12-roadmap.md`](12-roadmap.md).
**Bloque :** l'ordonnancement, pas un lot précis.

---

## ✅ D15 — Niche de Sentio — TRANCHÉE

**Décision finale : Sentio n'a pas de niche.** Il accepte tous les secteurs ; la spécialisation se
fait **par client**, au calibrage, via des profils sectoriels rédigés par Sentio.
→ [`adr/0011`](adr/0011-generaliste-profils-sectoriels.md)

---

## D14 — Montrer au client pourquoi ce prospect, pourquoi ce message

Sentio interdit d'exposer la mécanique au client — jamais les modèles, jamais les outils, jamais les
workflows ([`07-parcours-produit.md`](07-parcours-produit.md)). Or les acheteurs de ce marché citent
**l'absence de visibilité sur la logique de ciblage comme motif d'arrêt**
([`21-concurrence.md`](21-concurrence.md)).

La contradiction n'est qu'apparente : *« Carter a contacté cette entreprise parce qu'elle recrute
dans votre secteur »* est un **raisonnement métier**, compréhensible par un dirigeant et conforme au
lexique ; nommer un modèle ou un outil est de la **mécanique**, interdite.

| Option | Conséquence |
|---|---|
| **Montrer le raisonnement métier, jamais la mécanique** *(recommandé)* | répond à la demande sans casser la promesse ; devient un différenciateur là où les concurrents sont opaques |
| Ne rien montrer | conforme à la lettre du parcours produit, mais reproduit le motif d'arrêt n°1 des concurrents |

Le motif est de toute façon journalisé (`METIER-22`) : la décision porte sur son **affichage**
(`DASH-19`), pas sur sa production. **Bloque :** lot 6, et le contenu de l'ADN commercial au lot 2.

---

## ✅ D13 — Transparence exigée par l'AI Act — TRANCHÉE

**Décision : Sentio informe, sobrement, là où la loi l'exige — et nulle part ailleurs.**
L'article 50 s'applique le **2 août 2026** ; le « digital omnibus » de juin 2026 a repoussé le
haut risque, pas lui. Le diagnostic annonce en clair, dès le premier écran, qu'on échange avec un
système d'IA ; les contenus générés sont marqués de façon lisible par machine ; le lexique reçoit
une zone exemptée pour cette information, comme les pages légales.
→ [`adr/0015`](adr/0015-transparence-ai-act.md), et
[`25-conformite-legale.md`](25-conformite-legale.md) pour le reste des obligations.

---

## ✅ D12 — Hébergement de l'interface — TRANCHÉE

**Décision : le code serveur qui touche une donnée personnelle s'exécute dans les fonctions
Supabase, en région UE ; la vitrine est prérendue et ne porte aucune donnée.** Le critère dominant
n'était pas l'offre gratuite mais **où le code s'exécute** : le diagnostic manipule du réel dès la
première question, et un runtime « edge » mondial le traiterait hors d'UE.
Cadre applicatif : **SvelteKit**, sortie statique aujourd'hui, sortie Node le jour de la migration.
→ [`adr/0021`](adr/0021-execution-serveur-en-ue.md) et [`adr/0022`](adr/0022-interface-sveltekit.md)

---

## D11 — Marque unique ou coexistence avec un produit antérieur

**Recommandation :** un seul nom. Deux marques pour un fondateur seul divisent l'attention
pour zéro bénéfice.

---

## ✅ D16 — Où s'exécute le worker — TRANCHÉE (sous condition levée)

**Décision du fondateur, 2026-08-07 : les fonctions Supabase, sous Deno**, à la condition —
qu'il avait posée lui-même — de **mesurer d'abord la durée réelle d'un battement**. La mesure a
été faite, la condition est levée. → [`adr/0028`](adr/0028-executant-en-fonction-serveur.md)

**La mesure, sur Postgres local, données de test réelles :**

| | |
|---|---|
| battement à vide (rien de dû) | **28 ms** |
| approvisionnement de 10 missions | **33 ms** |
| 10 pas complets, modèle instantané | **79 ms** (≈ 8 ms par pas) |
| connexion Postgres depuis Deno | **2 à 13 ms** |
| prise de travail (`for update skip locked`) depuis Deno | **1 à 17 ms** |

**Ce que la mesure a réellement montré, et qui n'était pas la question posée :** notre code ne
coûte rien. Ce qui remplit un battement, c'est le **lissage de débit que le Gateway s'impose
lui-même** pour ne pas dépasser le quota du fournisseur — 2 requêtes par minute, donc **30
secondes entre deux appels de modèle**. Dix pas dans un même battement, ce sont **4 min 30 d'attente
pure**, et aucune optimisation de notre code ne l'enlèvera.

**Conséquence, et c'est elle qui rend la voie viable :** la contrainte ne porte pas sur
l'hébergement, elle porte sur le **nombre d'appels de modèle par invocation**. Un battement borné
à un appel tient largement dans n'importe quelle limite de fonction serveur ; un battement qui en
enchaîne dix ne tiendrait dans aucune, Node ou Deno. C'est un réglage
(`travauxMaxParBattement`), pas une architecture — et le runtime était déjà construit pour ça :
« un pas borné de quelques secondes, puis on rend la main » ([`adr/0004`](adr/0004-run-machine-a-etats.md)).

**Prototype vérifié** (`supabase/functions/battement/`, non déployé) : un en-tête signé côté Node
se vérifie sous Deno sans recopie de code, le port `SqlClient` s'implémente sous Deno, et la
requête de prise de travail s'exécute **au mot près**. La frontière de sécurité est tenue sous
Deno comme sous Node — vérifié en la neutralisant : deux tests passent au rouge.

---

## D17 — Une défense en base sous les fonctions que seul le service peut appeler

Constat d'audit du 2026-08-28, **non corrigé volontairement** : la décision revient au fondateur.

L'espace du dirigeant lit et écrit par deux chemins. Les lectures « cœur » passent par le client à
session, donc RLS les borne. Mais les quinze fonctions `security definer` de l'espace sont
**révoquées à `authenticated`** et ne s'atteignent que par le pool de service, dont le rôle porte
`rolbypassrls`. La chaîne est donc :

```text
pool de service (postgres, RLS contournée)
        ↓
fonction security definer
        ↓
tenantId reçu en paramètre — la fonction lui fait confiance
        ↓
garde applicative : isAuthorizedForTenant()
```

**La garde applicative est le seul obstacle**, et c'est vérifié plutôt que supposé : gardes
retirées, un appel direct à `regler_l_autonomie()` sur l'entreprise voisine **réussit** et rend un
identifiant de configuration. Or c'est le geste qui peut porter l'autonomie à `auto`.

Toutes les fonctions ne sont pas logées à la même enseigne : `accorder_definitivement()` vérifie,
elle, que l'employé appartient bien à l'entreprise passée. L'asymétrie n'est pas raisonnée — elle
est historique.

| Option | Conséquence |
|---|---|
| **Laisser la garde applicative seule, défendue par la règle 9 des frontières** *(en vigueur)* | un seul filet, mais mécaniquement vérifié à chaque `pnpm run verify` ; aucun coût |
| Ajouter dans chaque fonction un contrôle d'appartenance de l'employé à l'entreprise | défense en profondeur, sur le modèle d'`accorder_definitivement` ; ne protège pas contre un `tenantId` dont l'appelant n'est pas membre — la base ignore qui est connecté quand le service l'appelle |
| Faire porter la session jusqu'à la base (`set local request.jwt.claim.sub`) et vérifier `is_tenant_member` dans les fonctions | vraie défense en profondeur, seule option qui ferme le cas complet ; touche les quinze fonctions et le pool, donc un chantier |

⚠️ **Ce que la deuxième option ne fait pas** doit être dit, sinon elle rassurerait à tort : vérifier
que l'employé appartient à l'entreprise n'empêche pas de lire une entreprise entière dont on n'est
pas membre — il faut nommer un employé de CETTE entreprise, ce qu'un identifiant deviné donne
aussi. Seule la troisième referme le cas.

**Ne bloque aucun lot.** La règle 9 empêche la récidive du défaut réellement observé
(`filDeLaConversation`) ; cette entrée porte sur la profondeur, pas sur l'existence, de la défense.

---

## Comment trancher

Pour chaque décision : écrire **ce qu'on gagne, ce qu'on perd, et à quelle condition on
reviendrait dessus**. Puis créer l'entrée dans [`adr/`](adr/). Une décision non écrite est une
décision qui sera reprise à l'envers dans six mois.
