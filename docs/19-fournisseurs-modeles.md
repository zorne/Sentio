# 19 — Fournisseurs d'inférence et modèles

> À lire si tu travailles sur : le Model Gateway, les quotas, une décision de coût, ou la
> conformité RGPD de l'inférence.
>
> **Vérifié le 2026-07-28.** Toute valeur de ce fichier est périssable — voir
> [Procédure de re-vérification](#procédure-de-re-vérification) en fin de document.

Ce fichier comble un trou : jusqu'ici l'architecture décrivait entièrement **comment** router
entre fournisseurs sans jamais dire **lesquels**. Décision tranchée dans
[`adr/0009-fournisseur-inference-ue.md`](adr/0009-fournisseur-inference-ue.md).

---

## Le constat de départ

**Aucun fournisseur ne satisfait simultanément les trois exigences de Sentio en juillet 2026.**
On en obtient deux sur trois. C'est le fait structurant : tout le reste en découle.

| Exigence | Pourquoi elle existe |
|---|---|
| **€0 récurrent** | [`01-contraintes.md`](01-contraintes.md) — pas de budget avant le premier client |
| **Sans entraînement** | invariant 5 d'[`AGENTS.md`](../AGENTS.md) — une donnée client ne nourrit jamais un modèle |
| **Hébergement UE** | [`10-securite-rgpd.md`](10-securite-rgpd.md) — sinon transfert international à instruire |

### Ce qu'offre le marché

| Fournisseur | €0 récurrent | Sans entraînement | UE | Limites du tier gratuit |
|---|---|---|---|---|
| **Mistral** (FR) | ✅ tier *Experiment* | ⚠️ entraîne **par défaut**, opt-out manuel | ✅ résidence UE | ~1 Md tokens/mois, ~2 req/min |
| **OVHcloud AI Endpoints** (FR) | ❌ crédit 200 $ / 1 mois | ✅ jamais d'entraînement, zéro rétention | ✅ Gravelines | anonyme : 2 req/min/IP, sans clé — authentifié : 400 req/min/modèle |
| **Scaleway** (FR) | ❌ 1 M tokens une fois | à vérifier | ✅ | puis facturé au token |
| **Groq** (US) | ✅ permanent, sans carte | ✅ **contractuel**, gratuit = payant | ❌ | 1 000 req/j par modèle 70B |
| **Google AI Studio** (US) | ✅ 1 500 req/j | ❌ **entraîne** sur le gratuit | ❌ | — |
| **Cerebras** (US) | ✅ 1 M tokens/j | ✅ | ❌ | **usage commercial interdit** sur le gratuit |

Deux exclusions sont définitives, pas des arbitrages :

- **Google AI Studio** entraîne sur les entrées du tier gratuit. Interdit par l'invariant 5 pour
  toute donnée réelle — et le diagnostic manipule de la donnée réelle **dès la première
  question** ([`10-securite-rgpd.md`](10-securite-rgpd.md)).
- **Cerebras** réserve son offre gratuite au développement et aux tests ; l'usage commercial
  passe par un contrat. Vendre depuis ce tier, c'est exactement le risque décrit en C3.

---

## Les fournisseurs retenus

### 1. Principal — Mistral, tier *Experiment*

Entité française, inférence en UE par défaut, modèles à poids ouverts, environ 1 milliard de
tokens par mois à €0.

**La limite de ~2 requêtes/minute n'est pas un problème pour Sentio**, et c'est le point qui rend
ce choix possible. Un run est une machine à états avancée par battements
([`05-runtime-employe.md`](05-runtime-employe.md)) : le travail est asynchrone par construction,
Sentio n'a jamais promis de temps réel (C5). 2 req/min ≈ 2 880 requêtes/jour, soit un ordre de
grandeur au-dessus du plafond de C1. **Le besoin de Sentio est du volume quotidien, pas de la
latence.** Le seul endroit où la latence compte est le diagnostic de la vitrine, qui est une
conversation en aller-retour — à surveiller, c'est le point de tension de ce choix.

> ⚠️ **Préalable de mise en service, non négociable.** Sur le tier gratuit, les entrées et
> sorties entrent **par défaut** dans les programmes d'entraînement de Mistral. L'opt-out se fait
> à la main dans la console d'administration (menu *Privacy*). Tant que cet opt-out n'est pas
> activé et prouvé, **aucune donnée réelle ne doit transiter** : le compte est à traiter comme un
> fournisseur non conforme. Preuve à archiver avec sa date dans le registre des traitements.

### 2. Secours — OVHcloud AI Endpoints, tier anonyme

Gravelines (France), zéro rétention, aucune donnée utilisée pour entraîner. Tier anonyme
permanent : 2 requêtes/minute par IP et par modèle, sans clé.

**Son usage réel est plus étroit qu'il n'y paraît, et il faut le dire.** La démonstration de la
vitrine est scriptée (C6) : elle ne consomme aucun appel de modèle. Le diagnostic manipule de la
donnée réelle. **Il ne reste donc que les tests internes et le développement.** Ce fournisseur
n'est pas un filet de sécurité pour la production — c'est exactement ce que dit C2, et le nommer
ne change rien à cette réalité.

### 3. Sortie payante — OVHcloud AI Endpoints, au token

Quand le €0 casse, c'est ici qu'on va, et cela ne change pas de juridiction : 0,05 à 1,01 $ par
million de tokens en entrée, 0,11 à 4,25 $ en sortie selon le modèle. Rester en UE évite
d'instruire un transfert international au moment précis où l'on signe les contrats de
sous-traitance. S'insère à la place n°1 de l'ordre de dépense de
[`11-exploitation.md`](11-exploitation.md). Scaleway est l'alternative équivalente.

### Le cas Groq — pourquoi il n'est pas retenu

C'est le seul fournisseur dont l'accord de service **interdit contractuellement** l'entraînement
sur les entrées et sorties, sans distinction entre gratuit et payant, avec zéro rétention par
défaut, gratuitement et sans carte bancaire. Sur le seul critère de l'invariant 5, c'est le
meilleur candidat du marché.

Il est écarté pour une raison unique : **il est américain**. L'utiliser impose un transfert hors
UE à documenter, des clauses contractuelles types, et une analyse d'impact — au moment où le
projet cherche justement à réduire sa charge de conformité. À reconsidérer si le principal
devient insuffisant : le compromis serait alors juridique, pas technique.

---

## Répartition des appels par classe de tâche

Les quotas sont **par modèle**, pas par compte. Répartir les classes de tâches sur des modèles
distincts multiplie le plafond quotidien **sans dépenser un euro**. C'est la seule voie
d'augmentation de capacité compatible avec le €0, et elle s'implémente entièrement dans le Model
Gateway — aucun employé n'en a connaissance.

| Classe de tâche | Besoin dominant | Taille de modèle | Enveloppe |
|---|---|---|---|
| Diagnostic conversationnel (vitrine) | latence, données réelles | moyen | Diagnostic public |
| Raisonnement de run (prochaine action) | qualité de décision | grand | Employés vendus |
| Rédaction (emails de prospection) | qualité de langue | moyen | Employés vendus |
| Classification, extraction de faits | volume, coût | petit | Employés vendus |
| Tests et développement | rien | petit | Interne / tests |

Les identifiants exacts de modèles ne sont pas figés ici : ils vivent en configuration
(`packages/config`), comme l'exige [`02-architecture.md`](02-architecture.md). Les lire dans la
console du fournisseur au moment de l'implémentation — les noms de version changent plus vite que
ce document.

---

## Le quota, en valeur absolue

Le seuil « 60-70 % du quota journalier » de [`11-exploitation.md`](11-exploitation.md) était
jusqu'ici inutilisable : c'était un pourcentage d'un nombre inconnu. Base de calcul :

- **Plafond mensuel :** ~1 milliard de tokens (tier *Experiment*).
- **Plafond instantané :** ~2 requêtes/minute, soit ~2 880 requêtes/jour en théorie.
- **Coût d'un run :** plusieurs appels de modèle (C1), ordre de grandeur 5 à 15 selon la
  complexité de la tâche — **à mesurer dès le lot 3, c'est une estimation, pas un fait.**

Le facteur limitant n'est donc plus le nombre de tokens mais le **débit par minute**. C'est un
renversement par rapport à C1, qui supposait un plafond en volume. La conséquence est
architecturale : la file doit lisser les appels dans le temps plutôt que les grouper, et un pic
de diagnostics sur la vitrine reste le vrai danger — d'où les trois enveloppes.

**Instrumenter le compteur en requêtes/minute glissantes, pas seulement en tokens/jour.**

---

## Modèles à poids ouverts — état de l'art

Au 2026-07, les meilleurs modèles à poids ouverts sont **GLM-5.2** (agentique et code),
**Kimi K3** (raisonnement et code), **MiniMax M3** et **DeepSeek V4**. Les classements varient
selon les sources et bougent tous les mois : ne rien construire qui dépende d'un modèle précis.

**Aucun de ces modèles n'est servi par le fournisseur retenu.** C'est le prix de la conformité :
Sentio tourne sur des modèles bons, pas sur les meilleurs. Ce compromis est réel et assumé — il
prolonge C2. Il se lève le jour où l'on passe au payant : OVHcloud et Scaleway servent Qwen,
DeepSeek, Llama et GLM.

Rien de tout cela ne doit fuiter côté client. [`00-vision.md`](00-vision.md) interdit d'exposer un
nom de modèle, et [`17-lexique.md`](17-lexique.md) interdit le vocabulaire associé.

---

## À faire avant le premier euro encaissé

Ces vérifications ne sont pas optionnelles, et aucune n'est faite à ce jour :

1. **Activer l'opt-out d'entraînement** chez le fournisseur principal, archiver la preuve datée.
2. **Vérifier que le tier gratuit autorise l'usage commercial** — c'est C3, et c'est la seule
   vérification qui peut faire disparaître le produit sans préavis.
3. **Signer le contrat de sous-traitance** avec le fournisseur retenu
   ([`10-securite-rgpd.md`](10-securite-rgpd.md)).
4. **Inscrire le fournisseur au registre des traitements**, avec la localisation de l'inférence.
5. **Créer un compte de production distinct du compte personnel**, comme pour tous les
   prestataires.

---

## Procédure de re-vérification

Les tiers gratuits changent sans préavis, et parfois sans annonce. OVHcloud indique par exemple
envisager d'introduire des plafonds de tokens qui n'existent pas aujourd'hui.

**Toute valeur de ce fichier non re-vérifiée depuis plus de trois mois est à considérer comme
fausse.** À chaque re-vérification : mettre à jour la date en tête, et si un fournisseur a changé
de politique de données, le traiter comme non conforme jusqu'à preuve du contraire — jamais
l'inverse.

Points à revérifier en priorité : la politique d'entraînement du tier gratuit, l'autorisation
d'usage commercial, les limites de débit, la localisation de l'inférence.
