# 32 — Audit avant mise en vente : texte, sécurité, fuites de données

> **Fait le 2026-08-26, sur la branche `noyau-lady`.** Audit de lecture seule : rien n'a été
> modifié, rien n'a été poussé, aucune base distante n'a été touchée.
>
> Périmètre : le dépôt git, le schéma Supabase (cœur et vitrine), `apps/vitrine` (site public)
> et l'espace privé du client.
>
> Chaque constat porte son fichier et sa ligne. Aucun n'est une impression : tous ont été
> vérifiés dans le code.

---

## Ce qu'il faut retenir en dix lignes

Le **cœur** (schéma, domaine, worker, espace client) est d'un très bon niveau : isolation tenue
par la base, journal inaltérable, contraintes de preuve, invariants exécutés à chaque `verify`.
Ce n'est pas là qu'est le problème.

Le problème est que **le site public et le cœur sont deux produits différents qui ne se touchent
pas**. Le site vend une offre qui n'existe pas, encaisse par un chemin qui ne recrute personne,
et renvoie l'acheteur vers un tableau de bord de démonstration. L'espace client, qui est le vrai
produit, n'est relié à rien.

**Un client qui commande aujourd'hui paierait pour arriver sur les données d'une démo.**

---

# PARTIE A — Audit du texte et de la typographie

## A1. Les tirets visibles par le client

Demande du fondateur : aucun tiret dans un texte lu par un client. **49 occurrences** restent, dans
17 fichiers. L'espace privé est propre ; tout le reste ne l'est pas.

| Endroit | Occurrences | Nature |
|---|---|---|
| Titres d'onglet (`metadata.title`) | 8 | `Sentio — Récapitulatif de commande`, `Sentio — Paiement confirmé`, etc. |
| Pages légales | 22 | dont **12 tirets utilisés comme puces** de liste |
| Landing et `/plans` | 4 | `en trois choses — et aucune ne demande…` |
| Parcours d'achat | 3 | `accéder à votre employé — pas de mot de passe à retenir.` |
| Divers vitrine héritée | 12 | `Mode démo — sans connexion`, `Aucun prospect pour le moment — …` |

⚠️ **Le cas le plus voyant** : `legal/rgpd/page.tsx:20-25` et `legal/confidentialite/page.tsx:132-137`
écrivent six droits RGPD sous forme `— savoir quelles données…`, `— corriger une donnée…`. Un tiret
n'est pas une puce. C'est une liste `<ul><li>` qui s'écrit ici en texte, et ça se voit.

**Un tiret dans un titre d'onglet est le pire des six** : c'est le premier texte que le client lit,
il apparaît dans son historique de navigateur, dans ses favoris, et dans les résultats de recherche.

## A2. Le lexique n'est plus défendu par rien

`AGENTS.md` le dit déjà : l'ancienne vitrine tenait ses textes dans un `labels.ts` que
l'intégration continue relisait. Ce fichier a disparu avec elle.

**Constat vérifié :** `scripts/verifier-frontieres.mjs` contient deux règles (§2 « l'interface ne
touche jamais une donnée » et §3 « aucun texte visible hors du fichier de libellés ») qui scannent
`apps/web/src` — **un dossier qui n'existe plus**. Elles lisent zéro fichier et rendent « rien à
signaler » depuis la suppression de SvelteKit.

Deux des six frontières d'architecture sont donc **vertes parce qu'elles ne regardent nulle part**.
C'est exactement le défaut que l'étape 1 du plan avait corrigé pour les tests, et il s'est reformé
ailleurs.

Conséquence directe, mots interdits actuellement publiés :

| Mot | Où | Gravité |
|---|---|---|
| `Automatisations simples` | `lib/plans.ts:47` | vendu comme une ligne d'offre |
| `Aucun workflow complexe`, `Workflows multi-étapes`, `Création automatique de workflows` | `lib/plans.ts:56, 84, 122` | idem |
| `API complète`, `API Enterprise` | `lib/plans.ts:90, 125` | idem |
| `Réflexion après chaque tâche (Self Reflection)` | `lib/plans.ts:81` | anglais technique dans une grille de prix |
| `agents autonomes`, `ses agents` | `legal/cgu/page.tsx:42, 75` | contractuel, donc opposable |

Les pages légales ont droit au vocabulaire juridique exact ; elles n'ont pas droit à `agent`,
qui n'est pas un terme de droit mais du jargon interne.

## A3. Le texte qui n'apporte rien, et celui qui promet ce qui n'existe pas

C'est le point le plus grave de la partie A, et ce n'est plus de la typographie.

### A3.1 — `lib/plans.ts` vend 33 fonctionnalités dont presque aucune n'existe

Le fichier définit trois formules publiées sur la landing, `/plans` et `/checkout` :
**499 € / 1 999 € / 9 999 € par mois**. Extraits de ce qui est promis, mot pour mot :

> `SLA 99,9 %` · `Account Manager dédié` · `Support 24h/24 et 7j/7` · `Infrastructure dédiée` ·
> `Déploiement privé possible` · `SSO / SAML` · `RBAC avancé` · `API Enterprise` ·
> `Journal d'audit complet` · `Employés numériques illimités` · `Employé superviseur` ·
> `Coordination de plusieurs équipes` · `Auto-amélioration contrôlée` · `Apprentissage continu` ·
> `Connexion illimitée aux outils` · `Priorité de calcul` · `Capacités premium`

Aucune de ces lignes n'a de contrepartie dans le code ou le schéma. Trois méritent d'être nommées
séparément :

- **`SLA 99,9 %`** est un **engagement contractuel chiffré**, sur une infrastructure choisie pour
  coûter zéro euro (`AGENTS.md` §4 : « pas de worker permanent, pas de file managée, pas de
  sauvegarde restaurable finement »). C'est une obligation de résultat qu'on ne peut pas tenir.
- **`Support 24h/24 et 7j/7`** et **`Account Manager dédié`** sont promis par une entreprise d'une
  personne.
- **`Déploiement privé`** et **`SSO / SAML`** n'existent nulle part, même en projet.

⚠️ **La landing s'interdit elle-même ce que la grille tarifaire fait.** Le commentaire de
`app/page.tsx:47-55` explique qu'aucun pourcentage n'est avancé parce qu'« une allégation chiffrée
invérifiable est une pratique commerciale trompeuse (art. L121-2), et nous n'avons aucune donnée
client ». La rigueur est réelle sur les chiffres de la landing, et absente sur la page qui prend
l'argent.

### A3.2 — Deux formules sur trois sont vendues alors que la base les refuse

`supabase/migrations/20260729120031_seed_plans.sql` :

```
('start',  true,  100),
('growth', false, 200),
('scale',  false, 300)
```

**Seule `start` est commercialisable.** Le site vend `standard`, `professionnel` et `entreprise`.
Ni les noms, ni le nombre de formules, ni les quotas ne correspondent :

| Publié sur le site | En base |
|---|---|
| Standard, 499 €, **5 000 tâches / mois** | `start`, **300 tâches / mois**, 500 messages / mois |
| Professionnel, 1 999 €, 100 000 tâches | `growth`, non commercialisable |
| Entreprise, 9 999 €, tâches illimitées | `scale`, non commercialisable |

Un client qui paie « Professionnel » achète une formule que le produit refuse d'ouvrir.

Cette divergence n'est pas une découverte : `adr/0025` l'a tranchée le 2026-08-06 —
*« Une seule grille : celle du cœur. `plan` en base fait foi. `lib/plans.ts` disparaît. »*
La décision est prise, elle n'a jamais été appliquée.

### A3.3 — Six étapes annoncées après le recrutement, aucune n'est construite

`app/page.tsx:172-180`, en commentaire dans le fichier lui-même :

> *« Décrit le parcours voulu par le fondateur, pas ce que le produit fait aujourd'hui […]
> Rien ici n'est encore câblé. »*

Le bloc `APRES_RECRUTEMENT` promet publiquement : une conversation qui façonne l'employé, un choix
entre plusieurs profils, une construction visible à l'écran, une fiche de résultats avec chiffre
d'affaires généré et taux de conversion. Le commentaire ajoute que `/plans` décrit, lui, le
parcours **réel** — et que « les deux textes divergent volontairement ».

**Deux descriptions contradictoires du même produit sont publiées sur le même site.** Le visiteur
n'a aucun moyen de savoir laquelle est vraie. C'est le reproche numéro un fait aux concurrents dans
les avis publics : la démonstration ne ressemble pas au produit livré.

### A3.4 — Le seul chiffre présenté comme vérifiable est faux

La landing insiste (`app/page.tsx:74-80`) :

> « Un cycle toutes les 20 minutes. Ce n'est pas une façon de parler : **c'est la fréquence
> programmée**, nuit et week-end compris. »

Dans `.github/workflows/prospect-cron.yml`, la planification est **commentée** :

```
#   schedule:
#     - cron: "*/20 * * * *"
```

La page a raison de dire que ce n'est pas une façon de parler. C'est un fait, et il est faux.

### A3.5 — Texte à supprimer, sans perte

Relevé en lisant chaque page client :

- `checkout/page.tsx` affiche `plan.fullFeatures` en entier, soit **jusqu'à 20 lignes de
  fonctionnalités** sur l'écran de paiement. Un récapitulatif de commande sert à confirmer un
  montant et une échéance, pas à re-vendre. Les vingt lignes rallongent l'écran, repoussent le
  bouton et n'ajoutent rien à la décision, qui est déjà prise.
- `lib/plans.ts` porte trois champs de texte parallèles par formule (`tagline`, `unlock`,
  `highlights`) plus `fullFeatures`. `unlock` est de la prose éditoriale (« Vos employés ne se
  contentent plus d'exécuter : ils réfléchissent… ») qui dit la même chose que `highlights` en
  moins précis.
- `RETARD` sur la landing (`app/page.tsx:262-300`) est une section entière de conviction sans fait :
  trois cartes pour dire « ça deviendra la norme, l'écart se creuse, attendre coûte ». Le fichier
  reconnaît lui-même n'avoir aucune étude à citer. Trois cartes pour une opinion, juste avant la
  grille de prix, affaiblit tout ce qui précède, qui était factuel.
- `legal/confidentialite/page.tsx:22-28` publie un encart **« Document en cours de finalisation »**
  sur une page qui est une déclaration opposable. Un client qui lit ça sur la politique de
  confidentialité d'un outil auquel il confie ses prospects referme l'onglet.

---

# PARTIE B — Audit de sécurité

Sévérités : **critique** = exploitable ou déjà vrai en production · **élevé** = fuite ou perte
possible dès le premier vrai client · **moyen** = à corriger avant la mise en vente.

## B1. CRITIQUE — Le paiement ne crée rien

`checkout/success/page.tsx` vérifie la session Stripe côté serveur (correct : la clé secrète est
utilisée, pas un drapeau du navigateur), puis **envoie un lien magique, et s'arrête là**.

Aucune entreprise n'est créée, aucun abonnement, aucun employé, aucune configuration.

Le cœur possède pourtant exactement ce qu'il faut : `supabase/functions/recrutement/index.ts`, une
notification **signée**, idempotente, qui appelle `recruter()` et fait tout le recrutement en une
transaction. Elle attend une charge `{recommendation, entreprise, formule, reference, email}`
signée par `x-sentio-signature`.

**Stripe n'envoie pas ça, et rien dans le dépôt ne traduit l'un vers l'autre.** Recherche faite :
aucune route webhook Stripe n'existe (`apps/vitrine/src/app/api/` ne contient que `advisor` et
`cron/prospect`). La fonction `recrutement` n'est appelée par aucun code de production.

**Conséquence : un vrai paiement produit un email de connexion et rien d'autre.**

## B2. CRITIQUE — L'acheteur atterrit sur les données de la démonstration

Chaîne vérifiée, maillon par maillon :

1. `ConfirmLoginButton.tsx:25` — après le lien magique : `router.push("/dashboard")` ;
2. `dashboard/page.tsx:46` — sans `?tenant=` : `tenantId = tenant || DEMO_TENANT_ID` ;
3. `tenant-access.ts:31` — `if (tenantId === DEMO_TENANT_ID) return true` : **toute session
   authentifiée est autorisée sur le tenant de démonstration**.

Le client qui vient de payer voit donc le tableau de bord de la démo, ses prospects, ses tâches et
son journal, sous un bandeau « Mode démo ».

Et **`/espace`, le vrai produit, n'est référencé nulle part.** Recherche sur tout `apps/vitrine/src` :
zéro lien, zéro redirection. La page existe, elle est aboutie, elle est injoignable.

## B3. CRITIQUE — L'espace client interroge des tables qui n'existent pas dans la base connectée

`apps/vitrine/.env.local.example` fixe `NEXT_PUBLIC_SUPABASE_URL=https://rybeumdjclajiypglmuj.supabase.co`,
c'est-à-dire le projet **vitrine** (`docs/27` §1.1), celui qui est en pause.

| Ce que `/espace` lit | Présent dans le schéma vitrine ? |
|---|---|
| `employee`, `identity`, `learned_fact`, `objective` | **non** |
| `lady_configuration`, `lady_configuration_capability`, `tenant_variant_preference` | **non** |
| `recolte_du_client()`, `bilan_de_l_employe()`, `abonnement_du_client()`, `serie_quotidienne()`, `avant_le_rendez_vous()`, `ce_qui_attend_votre_accord()`, `ce_que_change_la_proposition()` | **non** |

Le schéma vitrine ne contient que : `agent_definition`, `agent_instance`, `agent_memory`,
`diagnostic_rate_limit`, `execution_event`, `lead`, `notification`, `provider_quota`,
`rgpd_request`, `standing_approval`, `task`, `tenant`, `tenant_ai_credential`, `tenant_member`.

**L'espace client ne peut pas fonctionner tel que l'application est câblée.** Ce n'est pas un
réglage à faire au déploiement : les deux générations ont chacune leur schéma, et l'application
n'a qu'une seule connexion.

## B4. ÉLEVÉ — Sans clé Stripe, « Procéder au paiement » livre le produit gratuitement

`CheckoutAction.tsx:96-99` : si aucun `STRIPE_LINK_*` n'est posé — l'état actuel —, le bouton
« Procéder au paiement » ouvre un formulaire dont le texte est :

> « Le paiement en ligne n'est pas encore activé sur cette formule […] laissez votre email pour
> **recevoir votre employé dès maintenant**. »

N'importe quel visiteur obtient donc un compte, sans payer, en cliquant sur le bouton de paiement.
L'intention est honnête (ne pas simuler un formulaire de carte), le résultat ne l'est pas : c'est
une porte d'entrée ouverte, sans limitation de débit, sur un site qui affiche 499 € par mois.

## B5. ÉLEVÉ — Les données réelles d'un visiteur partent aux États-Unis, étiquetées « test »

`packages/vitrine-core/src/diagnostic/index.ts:129-138` :

```ts
return [{ provider: "groq", dataPolicy: "free", apiKey: key }];
```

et `index.ts:154` : `dataClass: "test"`.

Or le diagnostic public est une conversation où un dirigeant décrit **son entreprise réelle** :
activité, cible, offre, ce qui le bloque, parfois des noms. C'est cette étiquette `"test"` qui lui
fait franchir le garde-fou du gateway et partir chez Groq (États-Unis, tier gratuit, **sans preuve
d'opt-out**).

Le cœur, lui, tient la règle en base : `provider_credential` porte la contrainte
`provider_no_train_needs_proof` (`data_policy <> 'no_train' or opt_out_proven_at is not null`).
La vitrine ne passe pas par cette table : elle fabrique sa réponse en dur dans le code.

C'est l'**invariant 5 d'`AGENTS.md`** — « une donnée réelle de client ne part jamais vers un
fournisseur qui n'est pas sans entraînement » — contourné non par une faille, mais par un mot mal
choisi dans un objet littéral.

⚠️ Et la politique de confidentialité publie l'inverse : *« Groq Inc. — uniquement données de
test / conseiller public »* (`legal/confidentialite/page.tsx:116`).

## B6. ÉLEVÉ — Le cron de prospection s'ouvre si son secret est absent

`api/cron/prospect/route.ts:22` :

```ts
if (auth !== `Bearer ${process.env.CRON_SECRET}`) return 401;
```

Si `CRON_SECRET` n'est pas défini, l'expression vaut la chaîne littérale `"Bearer undefined"` —
qu'un attaquant envoie comme n'importe quel autre en-tête. Le contrôle **échoue ouvert** au lieu
d'échouer fermé.

Ce que la route déclenche derrière : un cycle de prospection complet sur une entreprise réelle,
c'est-à-dire l'**envoi de vrais emails**. Et cet envoi ne passe pas par `peut_envoyer()`, la garde
de délivrabilité et d'opt-out du cœur (`docs/27` §1.2 le notait déjà).

La comparaison n'est pas non plus à temps constant — mineur à côté du reste, mais à corriger dans
le même geste.

## B7. ÉLEVÉ — Le sel de hachage des adresses IP a une valeur de repli publiée dans le dépôt

`lib/diagnostic-rate-limit.ts:62` :

```ts
const salt = process.env.SENTIO_IP_HASH_SALT ?? "sel-de-developpement-jamais-en-production";
```

Si la variable n'est pas posée en production, le repli s'applique **en silence**. Le sel étant
public — il est dans git —, un SHA-256 sur les 4 milliards d'adresses IPv4 se retourne en quelques
minutes sur une machine ordinaire. Les « adresses hachées » stockées dans `diagnostic_rate_limit`
redeviennent alors des **adresses IP en clair**, c'est-à-dire des données personnelles.

Le commentaire dit « jamais l'IP en clair au-delà de cette fonction ». C'est vrai du code, et faux
du résultat.

## B8. MOYEN — L'accueil appelle un modèle sans aucune limitation

`lib/onboarding-actions.ts` : `onboardingChat()` est une Server Action **publique**, sans session,
qui appelle directement `gateway.generate()`. Aucune limitation de débit, aucun plafond
d'enveloppe, aucun cookie visiteur.

Le diagnostic, lui, en a deux (par visiteur et par adresse, plus l'enveloppe globale). L'accueil
n'en a aucune. C'est une facture d'inférence ouverte à qui écrit une boucle, et la clé Groq est
partagée entre le conseiller, le diagnostic et l'accueil : l'épuiser d'un côté éteint les trois.

## B9. MOYEN — Les demandes RGPD tombent dans un tiroir que personne n'ouvre

`lib/rgpd-actions.ts:52` : `// TODO : notifier privacy@sentio.fr par email`.

Trois conséquences :

1. **Le délai de 30 jours de l'article 12.3 court dès la réception**, et rien n'avertit qui que ce
   soit. Une demande arrivée un vendredi peut dormir un mois.
2. **Aucune vérification d'identité du demandeur.** N'importe qui peut déposer une demande
   d'effacement au nom de l'adresse d'un tiers. Y donner suite détruirait les données de quelqu'un
   d'autre ; ne pas y donner suite est une infraction. Rien dans le code ne distingue les deux cas.
3. La table `rgpd_request` vit dans le projet Supabase **en pause**. Une demande déposée
   aujourd'hui n'a nulle part où s'écrire.

Le garde-fou anti-flood (`hits`, une `Map` en mémoire) est par ailleurs inopérant sur Vercel :
chaque instance a la sienne.

## B10. MOYEN — Le tenant de démonstration est un espace partagé entre inconnus

Trois faits qui, mis bout à bout, donnent une fuite entre visiteurs :

- `tenant-access.ts:31` : toute session authentifiée est autorisée sur la démo ;
- `agent-actions.ts:68` : `dataClass = tenantId === DEMO_TENANT_ID ? "test" : "real"` ;
- migration `0012` : la policy `demo_journal_authentifie` ouvre le journal de la démo à **toute
  session authentifiée**.

Donc : n'importe quel visiteur inscrit peut lancer un cycle réel sur la démo, et **lire tout ce
que les autres visiteurs y ont fait** — le journal contient les entrées et sorties d'outils, donc
les prospects consultés et les messages rédigés.

`docs/27` §8.1 écrivait que cette garantie « tient à une seule ligne de code ». C'est exact, et la
ligne ne tient que tant que personne ne se sert de la démo pour de vrai.

## B11. MOYEN — Les emails partent d'une adresse de bac à sable

`lib/notify.ts:37` : `from: "Sentio <onboarding@resend.dev>"`.

`resend.dev` est le domaine de test de Resend : il ne délivre qu'à l'adresse du titulaire du
compte. Un email de notification envoyé à un client ne lui arriverait pas — et si le domaine était
changé sans le reste, il tomberait en indésirable, faute de SPF/DKIM/DMARC sur un domaine propre.

Ce point rejoint les trois préparatifs déjà notés dans `docs/31` §8 (compte Resend séparé, domaine
en région UE, clé en variable d'environnement).

## B12. FAIBLE — La page de retour de connexion affiche un texte fourni par l'URL

`auth/callback/page.tsx:35` affiche `error_description` tel qu'il vient de la chaîne de requête.
React échappe le contenu, donc **il n'y a pas d'injection de script**. Il reste qu'un lien
fabriqué peut faire afficher la phrase de son choix sur une page qui porte le nom et le logo
Sentio : de quoi construire un message de phishing crédible.

## B13. FAIBLE — Secrets non documentés

Aucun secret n'est présent dans le dépôt, et `.gitignore` couvre correctement `.env` et `.env.*` :
**ce point est propre**, vérifié par recherche sur les fichiers suivis.

En revanche, cinq variables lues par le code ne figurent dans aucun `.env.example` :
`CRON_SECRET`, `SENTIO_IP_HASH_SALT`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY` (et les trois
`STRIPE_LINK_*`), `NEXT_PUBLIC_APP_URL`. Un secret non documenté est un secret qu'on oublie de
poser — et deux d'entre eux échouent ouvert quand ils manquent (B6, B7).

---

# PARTIE C — Ce qu'un client verrait fuiter, et ce que le RGPD exige

## C1. Ce que la politique de confidentialité promet, et ce que le code fait

| Promesse publiée | État réel |
|---|---|
| « Après résiliation : 30 jours puis suppression » | **rien ne l'exécute** |
| « Journal d'exécution : 13 mois » | `purge_execution_events()` existe, valeur par défaut **30 jours**, et **aucun appel** hors des tests |
| « Logs techniques : 90 jours maximum » | aucune purge |
| « Sauvegardes automatiques quotidiennes, restauration testée » | le script `pnpm run sauvegarde` fait vraiment les deux, et il est **excellent** — mais il est **manuel**. Aucune planification n'existe (`.github/workflows/` n'a que `ci.yml` et un cron désactivé) |
| « chaque sous-traitant soumis à un Data Processing Agreement » | contredit par l'encart de la même page : « DPA sous-traitants laissés en attente » |
| « Groq : uniquement données de test » | faux, voir **B5** |
| « région eu-north-1, Stockholm » | à revérifier contre la région réelle du projet avant publication : c'est une **déclaration opposable** |

**Une durée de conservation publiée est un engagement au titre de l'article 5.1.e.** Trois sont
publiées, aucune n'est tenue par une machine.

## C2. Deux traitements réels ne sont pas déclarés

1. **La conversation du diagnostic public.** Le §2 « Quelles données sont collectées » ne la
   mentionne pas. Or elle est envoyée à un sous-traitant américain (B5). C'est le traitement le
   plus sensible du site public, et il est absent du document qui doit le déclarer.
2. **Le cookie `sentio_diag_visitor`** (`diagnostic-rate-limit.ts:47`) est posé sur tout visiteur
   du diagnostic. La page Cookies ne liste que `sb-access-token` et `sb-refresh-token`. Le cookie
   est défendable comme strictement nécessaire — limitation d'abus —, mais il doit être **listé**.

## C3. Ce qui protège réellement, et qu'il faut garder

L'audit doit aussi dire ce qui est solide, sinon il ne sert à rien.

- **L'isolation entre entreprises est tenue par la base**, pas par le code : `verify_tenant_isolation`,
  `cle_etrangere_par_entreprise`, `ligne_ne_change_pas_entreprise`, et les invariants
  `AUDIT-01/02/03` qui tournent **après toutes les migrations**, à chaque `verify`. C'est
  au-dessus de ce que fait la majorité des produits de cette taille.
- **Le journal d'exécution est inaltérable** par déclencheur, pas par convention.
- **Les Server Actions qui touchent aux données d'une entreprise vérifient l'appartenance.**
  Vérifié une à une : `agent-actions`, `leads-actions`, `prospecting-actions` et
  `company-briefing-actions` appellent toutes `isAuthorizedForTenant()` avant d'écrire. Les cinq
  chemins sans vérification que `docs/27` §8.1 recense sont bien les cinq autres — publics ou
  internes par nature (accueil, RGPD, notification, plafond du diagnostic, cron) : le constat de
  `docs/27` reste exact, et sa réserve aussi, puisque **rien ne distingue mécaniquement** ces cinq
  chemins des autres.
- **L'espace client lit par session, donc sous RLS** : un dirigeant ne voit son entreprise que
  parce que la base l'impose. C'est le bon modèle, et c'est celui à généraliser.
- **La confirmation de paiement est vérifiée côté serveur**, jamais sur la redirection du
  navigateur.
- **`/api/advisor`** est bien tenue : forme validée, tailles bornées, erreurs génériques, clé
  jamais exposée. Seule réserve : la limitation par IP en mémoire est diluée par le nombre
  d'instances Vercel.
- **Le lien magique n'est pas consommé au préchargement** (`auth/callback`) : le piège des
  scanners d'emails a été vu et évité. Peu de produits y pensent.

---

# Ce qui a été corrigé le 2026-08-27

`pnpm run verify` est vert, et chaque correction est tenue par une machine, pas par une
relecture.

| Constat | État |
|---|---|
| **A1** les 49 tirets visibles | ✅ zéro tiret sur les dix pages publiques, **vérifié dans le rendu**, pas dans le code |
| **A2** le contrôle de lexique perdu avec `labels.ts` | ✅ remis, et les deux règles qui scannaient un dossier supprimé ont été remplacées |
| **A3.5** le texte qui n'apporte rien | ✅ la section « Le retard », les 20 lignes d'offre sur l'écran de paiement, les deux notes internes publiées au client, et un renvoi vers un écran qui n'existe pas |
| **B6** `CRON_SECRET` échouait ouvert | ✅ échoue fermé, et la comparaison est à temps constant |
| **B7** le sel de hachage des IP avait un repli publié dans git | ✅ plus de repli : sans le sel, la limitation refuse de fonctionner |
| **B8** l'accueil sans plafond | ✅ même plafond que le diagnostic, et **le même budget**, à dessein |
| **B13** les cinq secrets non documentés | ✅ documentés dans `.env.local.example` |
| **C1** la politique de confidentialité affirmait des choses fausses | ✅ les DPA, la ligne Groq, les durées de conservation et la sauvegarde disent maintenant ce qui est vrai |
| **C2** deux traitements non déclarés | ✅ la conversation du diagnostic et le cookie `sentio_diag_visitor` sont déclarés |

⚠️ **Ces textes légaux restent des brouillons à faire relire par un juriste.** Ils ne mentent
plus, ce qui n'est pas la même chose qu'être complets.

## Un défaut trouvé en corrigeant, sans rapport avec l'audit

`pnpm run verify` échouait **avant** toute modification, sur `apps/worker`. Ce n'était ni une
instabilité ni un test fragile : la garde « on ne relit les résultats qu'une fois par jour »
bornait sa fenêtre avec `($jour::date)::timestamptz`, où le jour est calculé par Node **en UTC**
et la fenêtre interprétée par Postgres **dans le fuseau de sa session**.

Sur un serveur en Europe/Paris, la fenêtre glisse de deux heures. **Entre minuit et 2 h du matin,
la garde ne voit plus rien** : la réévaluation et la progression se refont à chaque battement, le
journal se remplit, et le dirigeant peut recevoir la même proposition plusieurs fois dans la nuit.

Le défaut n'existe que deux heures par nuit, ce qui explique qu'il ait tenu si longtemps. Il a
fallu que la vérification tombe à 00 h 12.

Corrigé aux deux endroits (`reevaluation.ts`, `progression.ts`), et couvert par deux tests qui
forcent les fuseaux `Etc/GMT-14` et `Etc/GMT+12` : **ils échouent avant le correctif à n'importe
quelle heure**, et non plus seulement la nuit.

---

# Ce qui reste à faire, dans cet ordre

**Rien de ce qui suit n'a été fait.**

### Avant tout autre travail — les trois qui bloquent la vente

1. **Aligner l'offre publiée sur ce que le produit fait.** Appliquer `adr/0025` : supprimer
   `lib/plans.ts`, lire les formules depuis `plan` en base, ne publier que `start`, et retirer les
   33 lignes de fonctionnalités inexistantes, à commencer par le SLA. C'est une décision
   commerciale autant que technique : **elle t'appartient**, je ne la prends pas seul.
2. **Brancher le paiement sur le recrutement.** Une route webhook Stripe qui vérifie la signature
   Stripe, puis appelle `recruter()`. La fonction cible existe déjà et est idempotente.
3. **Faire de `/espace` la destination après connexion**, et régler la question de la base unique
   (B3) — c'est le chantier « rapprocher `apps/vitrine` du monorepo », et B3 en est devenu
   l'argument le plus concret.

### Fait le 2026-08-27 (points 4 à 7), voir le tableau plus haut

Reste de cette série, et c'est le seul :

8. **Planifier la purge du journal et la sauvegarde.** Les durées publiées sont désormais exactes,
   mais **aucune machine ne les applique** : `purge_execution_events()` n'est appelée que par les
   tests, et `pnpm run sauvegarde` est un geste manuel. Les planifier demande un déclencheur
   déployé, donc ton geste. Tant que ce n'est pas fait, une durée de conservation publiée reste
   une promesse tenue par la mémoire de quelqu'un.

### Ce qui te revient

L'immatriculation, la relecture juridique des CGU/CGV et de la politique de confidentialité, les
DPA des sous-traitants, la preuve d'opt-out d'entraînement, le compte Resend séparé avec son
domaine en région UE, et la décision commerciale du point 1.
