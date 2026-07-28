# 15 — Décisions non tranchées

> À lire **avant de commencer un lot**. Si une décision de cette liste bloque ton travail :
> **demande au fondateur, ne choisis pas à sa place.**
>
> Quand une décision est tranchée : la retirer d'ici et créer une entrée dans [`adr/`](adr/).
>
> Le **choix du fournisseur d'inférence**, qui manquait à cette liste alors qu'il bloquait le
> lot 0, est tranché par [`adr/0009`](adr/0009-fournisseur-inference-ue.md).

---

## ✅ D1 — Périmètre métier de la V1 — TRANCHÉE

**Décision finale : un seul métier réel au lancement — Commercial.**
(Un revirement bref vers deux métiers, Commercial + Support, a été acté puis annulé le même
jour — voir [`adr/0007`](adr/0007-perimetre-v1-commercial-support.md) et
[`adr/0008`](adr/0008-perimetre-v1-commercial-seul.md) pour l'historique complet.)

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

## D5 — Source des prospects pour le métier commercial

Donnée fournie par le client / enrichissement externe / mixte ?
**Recommandation :** démarrer sur la donnée fournie par le client — zéro coût, zéro
dépendance, zéro risque juridique. **Bloque :** lot 2.

---

## D6 — Envoi des emails : depuis le domaine du client ou depuis Sentio

**Recommandation :** depuis le domaine du client (délivrabilité et légitimité), mais cela
impose une configuration technique à l'onboarding — friction réelle à arbitrer.

> ⚠️ **Élément apparu depuis** ([`21-concurrence.md`](21-concurrence.md)) : envoyer depuis le domaine
> du client signifie qu'un employé mal réglé brûle **la réputation d'envoi du client**, pas celle de
> Sentio. C'est le risque le plus lourd de cette décision, il se répare en mois, et il pèse
> désormais autant que la délivrabilité dans l'arbitrage. Si ce domaine est retenu, les garde-fous
> `METIER-18` à `METIER-21` deviennent des préalables absolus.

**Bloque :** lot 2.

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

## D13 — Transparence exigée par l'AI Act vs « jamais l'impression d'utiliser une IA »

Depuis le **2 août 2026**, l'article 50 du règlement européen sur l'IA impose d'informer une personne
qu'elle interagit avec un système d'IA, de signaler les contenus générés, de tracer les décisions
automatisées et de documenter le système. Un employé numérique commercial relève du **risque limité** :
obligations légères, mais réelles, et sanctionnables.

Cela heurte de front la promesse fondatrice — « le client ne doit jamais avoir l'impression d'utiliser
une IA » — et le lexique qui interdit le mot dans tout texte visible
([`17-lexique.md`](17-lexique.md)). Deux surfaces sont concernées : le **diagnostic de la vitrine**, où
un visiteur converse réellement avec un système d'IA, et les **messages de prospection** signés d'une
identité fictive et envoyés à des tiers.

| Option | Conséquence |
|---|---|
| **Mention sobre, hors du lexique** *(à instruire en premier)* | les pages légales sont **déjà** exemptées du lexique ; informer n'oblige ni à employer le mot interdit dans l'interface, ni à casser l'ambiance |
| Mention explicite dans l'interface | conformité la plus sûre, mais abîme la promesse produit |
| Ne rien faire | non conforme depuis le 2 août 2026 |

Ne concerne **jamais** la question de savoir si le produit est honnête : la démonstration scriptée doit
déjà être présentée comme telle (C6), et le diagnostic hors périmètre doit déjà le dire (R14).
**Bloque :** la vitrine (lot 4) et l'ADN commercial (lot 2). → [`20-plan-action.md`](20-plan-action.md)

---

## D12 — Hébergeur de l'interface

Jamais tranché : [`02-architecture.md`](02-architecture.md) laisse le choix ouvert et impose
seulement de rester **indépendant de l'hébergeur** (aucune interface propriétaire). La décision
n'était pas suivie ici, alors qu'elle conditionne une migration probable dès le premier client
payant. Critère dominant, comme pour l'inférence : l'offre gratuite doit autoriser l'usage
commercial (C3). **Bloque :** la mise en ligne, pas un lot précis.

---

## D11 — Marque unique ou coexistence avec un produit antérieur

**Recommandation :** un seul nom. Deux marques pour un fondateur seul divisent l'attention
pour zéro bénéfice.

---

## Comment trancher

Pour chaque décision : écrire **ce qu'on gagne, ce qu'on perd, et à quelle condition on
reviendrait dessus**. Puis créer l'entrée dans [`adr/`](adr/). Une décision non écrite est une
décision qui sera reprise à l'envers dans six mois.
