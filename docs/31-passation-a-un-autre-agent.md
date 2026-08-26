# 31 — Passation : tout ce qu'un autre agent doit savoir pour ne pas être perdu

> **À lire en entier avant la première modification.** Ce fichier ne remplace pas
> [`AGENTS.md`](../AGENTS.md) ni [`docs/29`](29-plan-jusquau-premier-client.md) : il porte ce qui
> n'est écrit nulle part ailleurs — **le tacite**. Qui est le fondateur, comment il travaille, ce
> qu'il refuse, et les pièges qu'on ne découvre qu'en s'y cassant le nez.
>
> Ordre de lecture conseillé : ce fichier, puis `AGENTS.md`, puis `docs/29`.

---

## 0. Journal de passation — tenu à chaque livraison

> **Règle donnée par le fondateur le 2026-08-26 :** *« à chaque chose que tu fais, je veux que tu
> le précises dans le fichier mémoire pour l'autre Claude. »*
>
> **Donc : toute livraison s'inscrit ici, en une ligne ou deux, avec ce qu'elle a changé pour le
> client et ce qu'elle a coûté à trouver.** Ce journal est ce qu'un agent lit en premier pour
> savoir où en est réellement le produit — avant même `docs/29`, qui raconte le plan, pas l'état.

| Date | Ce qui a été livré | Ce qu'il faut en retenir |
|---|---|---|
| 2026-08-26 | **Le déclencheur** — les résultats mesurés deviennent une proposition de configuration | Elle **propose**, elle n'applique pas. Version inactive + notification `proposition`, jamais `evolution` |
| 2026-08-26 | **Lady agit vraiment** — l'attelage, et les deux premiers moteurs | Le modèle choisit le geste, **jamais la cible**. Défaut trouvé : deux moteurs nommés « base » s'écrasaient |
| 2026-08-26 | **L'employée progresse** — mémoire, registre de langage, ce qui marche chez ce client | Seuils de signal partout ; un cinquième des missions continue d'explorer |
| 2026-08-26 | **Les deux limites du dirigeant** — cliquet d'autonomie, bouton d'arrêt | L'arrêt verrouille **trois** endroits ; un seul laisserait passer ce que les deux autres retiennent |
| 2026-08-26 | **L'espace devient une scène** — présence, tiroirs, direction artistique de la landing | Au repos la page ne dit presque rien. Ce qui attend une personne a seul le droit d'appeler |
| 2026-08-26 | **Lui parler** — conversation avec l'employée | **Aucun modèle ne répond.** Liste fermée d'intentions + gabarit rempli avec des comptes lus en base |
| 2026-08-26 | **Ce que ça donne** — quatre chiffres et une courbe, sans cliquer | Aucun taux sous 30 envois ; pas de « taux de rétention », qui serait inventé |
| 2026-08-26 | **Audit complet** — parcours 19 étapes, fuites, RGPD | **Une vraie fuite fermée** (chiffre d'affaires d'autrui) ; l'effacement RGPD ne fonctionnait pas |
| 2026-08-26 | **Le garde-fou du silence** — 40 envois sans réponse ⇒ elle s'arrête | Réponse directe au reproche le plus documenté fait aux concurrents |
| 2026-08-26 | **La formule et les plafonds** — dans le tiroir « Vous » | Réponse au deuxième grief : l'opacité. Compté sur les **vraies lignes**, jamais `usage_counter` |
| 2026-08-26 | **Le carré et la saccade** — signalés par le fondateur en utilisant la scène | `backdrop-filter` + `transform` fait apparaître un **rectangle** ; et deux règles ne peuvent pas animer la même propriété |
| 2026-08-26 | **Les orbes s'allument au survol** — demandé par le fondateur | Trois degrés (point, contour, lueur) ; celle qui attend garde **sa** couleur |
| 2026-08-26 | **Aucune orbe allumée au repos** | Une lumière permanente cesse d'être un signal en deux jours — elle devient un décor |
| 2026-08-26 | **La barre devient des icônes** — boîte aux lettres à point rouge, progrès, récolte, objectif, vous | Le nom apparaît au survol ; cinq libellés alignés redeviennent un menu |
| 2026-08-26 | **La récolte** — ce qui a abouti, NOMMÉ selon le rôle | La base ne connaît aucun métier ; seul le vocabulaire change. C'est la frontière d'`adr/0029` |
| 2026-08-26 | **Julie en dit plus** — taux, panier moyen, reste à faire, les deux rythmes | Même seuil de taux que le tableau de bord ; jamais un verdict, toujours deux nombres |
| 2026-08-26 | **Avant vos rendez-vous** — un briefing par entreprise qui a donné un rendez-vous | ⚠️ **Le texte des réponses reçues n'est stocké nulle part.** Ce qui vient de l'échange, ce sont les **notes consignées** |
| 2026-08-26 | **Tableau et courbe repris** — indicateurs en colonnes, graduation, sol, bornes de dates | Une ligne seule montre une forme sans donner d'ordre de grandeur |
| 2026-08-26 | **Plus aucun tiret dans le texte visible** | Demande du fondateur. Les tirets cadratins restent dans les commentaires de code |
| 2026-08-26 | **Jamais un message flou** — l'accord dit QUELLE action, sur qui, avec quel texte | « Une action attend votre accord » faisait signer une page blanche |

---

## 1. À qui tu parles

Le fondateur s'appelle **Eelco**. Il travaille **seul** sur Sentio et prévoit de le maintenir seul
pendant des mois. Il écrit vite, en français, souvent sans accents ni ponctuation — ça n'a rien à
voir avec son niveau d'exigence, qui est très élevé.

**Ce qu'il attend, et qu'il a dit explicitement :**

| Ce qu'il a demandé | Comment l'appliquer |
|---|---|
| « ne parle pas chinois » | zéro jargon dans ce qui s'adresse à lui ou au client. « taux de réponse », pas « conversion funnel top » |
| « dis-moi ce que tu as fait, simplement, à chaque fois » | après chaque livraison, un résumé court, concret, en français courant |
| « j'ai besoin du meilleur de toi » | il préfère **repousser une fonctionnalité** plutôt qu'accepter de la dette |
| « signale les découvertes » | les manques structurels trouvés en codant sont ce qui renforce le produit — **les taire est la vraie faute** |

**Ce qui le fait décrocher :** un raccourci proposé « pour aller plus vite » (il refusera, et
l'avoir proposé fait perdre du temps aux deux), un correctif sans test qui échoue *avant* lui, une
phrase du type « à vérifier à la revue ».

**Six priorités ordonnées**, qui tranchent tout arbitrage — quand deux s'opposent, la plus haute
gagne, et les cinq premières gagnent **toujours** contre le délai :

> **1. sécurité · 2. confidentialité · 3. architecture découplée · 4. fiabilité ·
> 5. observabilité · 6. qualité avant rapidité**

Et cinq principes qu'**on ne remet pas en cause sans le lui soumettre AVANT** : sécurité avant
fonctionnalités · confidentialité avant simplicité · architecture avant vitesse · **automatisation
avant vérification manuelle** · **tests avant fusion**.

---

## 2. Ce que tu ne fais jamais

Ces limites ont été posées par lui, ou tiennent au fait qu'un agent ne doit pas les franchir seul.
Elles ne se négocient pas, et « il a dit oui la dernière fois » ne vaut pas pour la fois suivante.

- ⛔ **pousser un schéma sur le Supabase distant** (`supabase db push`) — il a interrompu un push
  une fois pour exiger d'abord une arborescence propre. Les migrations se vérifient sur la base
  **locale jetable** ;
- ⛔ **poser un secret**, lire ou manipuler une clé d'API. Jamais dans le dépôt, jamais dans un
  chat ;
- ⛔ **déployer**, engager une dépense, signer quoi que ce soit ;
- ⛔ **envoyer un email réel** — voir §8, les trois préparatifs Resend à lui rappeler ;
- ⛔ **écrire dans une base distante**, quelle qu'elle soit.

Toute la **Partie II** de [`docs/29`](29-plan-jusquau-premier-client.md) lui appartient :
immatriculation, légal, mise en ligne, répétition en réel, vente. Un agent **prépare, explique,
rédige des brouillons et vérifie après coup** ; il n'exécute rien de ces cinq étapes.

---

## 3. Le produit, en une page

Sentio vend **Lady** : un **noyau généraliste unique** dont le rôle est une **configuration
dérivée d'un diagnostic**, jamais un métier choisi dans un catalogue.

> ⚠️ **La question qui tranche toute proposition** — elle vient de lui, littéralement :
> *« est-ce que cette décision renforce le concept d'un noyau Lady généraliste configuré
> dynamiquement, ou est-ce qu'elle nous ramène vers des agents spécialisés par métier ? »*
> Si c'est la seconde : **ça ne s'implémente pas.**

Les trois idées structurantes, qu'il faut avoir comprises avant de toucher au code :

1. **Acte × Objet × Moteur.** Une capacité est un verbe appliqué à un objet métier, servi par un
   moteur remplaçable. La bibliothèque est un **produit d'axes**, pas une liste ;
2. **Composition déterministe.** `relever` → `diagnostiquer` → `composer`. Le modèle **n'écrit que
   les justifications**, jamais les décisions. Une force pèse *négativement*, ce qui permet au
   diagnostic de **contredire la demande du client** ;
3. **Les garanties vivent dans la base**, pas dans le code : déclencheurs, index uniques partiels,
   fonctions `security definer`, RLS. Une règle défendue par la vigilance tombe un soir de fatigue.

---

## 4. Où en est le produit — ce qui marche vraiment

**Vérifié en jouant le parcours complet** ([`supabase/tests/parcours-client.sql`](../supabase/tests/parcours-client.sql),
19 étapes, toutes vertes) :

diagnostic public → constats typés → recommandation → **paiement → recrutement en une transaction**
(rejeu du webhook inoffensif) → rattachement de l'acheteur par email → configuration appliquée →
missions ouvertes et rattachées à un objectif → travail réel → résultats déclarés par le client →
tableau de bord → cliquet d'autonomie → bouton d'arrêt → **effacement RGPD**.

**Ce qui agit vraiment aujourd'hui :** `qualifier.prospect` et `mettre_a_jour.prospect` — effets
internes, réversibles. Ils écrivent dans la vraie base, c'est prouvé par
`apps/worker/src/agir-vraiment.integration.test.ts`.

**Ce qui n'agit PAS, et c'est délibéré :** `envoyer.prospect` et `relancer.prospect`. Leur
**attelage** existe (la traduction de la proposition du modèle vers l'entrée du moteur) ; ce qui
manque volontairement, c'est le **moteur** — il écrirait à de vraies entreprises. Le verrou est
nommé à un seul endroit : `packages/runtime/src/composition.ts`.

**L'employée progresse** : elle retient (réflexion d'après-run → `learned_fact`), elle essaie
(chaque mission porte une façon de travailler tracée), et ce qui gagne **chez ce client** prend le
dessus — sous seuil de signal, avec un cinquième des missions qui continue d'explorer.

---

## 5. Les décisions qui ne se devinent pas en lisant le code

Ce sont celles qu'un agent risque de « corriger » par mégarde. Chacune a une raison.

### Elle propose, elle n'applique pas (§10 de la vision)
Une réévaluation sur résultats publie une configuration **inactive**. Lady ne change **jamais** de
rôle seule. Un produit qui se reconfigure sur ses propres chiffres déplace l'employée toutes les
semaines, ne termine aucune approche, et le client découvre au réveil que ce qu'il a acheté fait
autre chose.

**Distinction à ne pas perdre :** changer de **manière** (angle, registre de langage, cadence)
s'applique seul — c'est réversible et interne — mais **jamais en silence** (`strategy_change` +
notification adossée). Changer de **rôle** demande toujours l'accord.

### Le cliquet d'autonomie
N'importe quoi peut rendre l'employée **plus prudente** ; **seul le dirigeant** peut la rendre plus
libre. Un employé ne naît jamais en « agit seul ». Garanti par déclencheur, pas par convention.

### Aucun chiffre qui ne vienne d'une ligne en base
Pas de progression estimée, pas de « temps économisé ». **Et aucun taux sous 30 envois** :
« 1 réponse sur 2 = 50 % » est un chiffre vrai et une information fausse. Sous le seuil, on écrit
**ce qui manque** — une case vide, un tiret ou un « 0 % » se lisent tous les trois comme un échec.

### Il n'y a pas de « taux de rétention », exprès
La rétention se calcule sur des abonnements et plusieurs mois d'historique. Sentio n'a **pas un
seul client payant**. Publier un nombre sous ce nom serait inventer la métrique la plus
structurante du produit. Ce qui est affiché à la place — et qui est réellement mesuré — c'est
l'évolution du taux de réponse d'une moitié de période à l'autre.

### Le modèle ne répond jamais avec des chiffres
La conversation « Lui parler » rapproche la question d'une **liste fermée d'intentions**, puis
remplit un gabarit avec des comptes **lus en base**. Aucun modèle n'intervient. Un modèle qui
compte se trompe d'une unité une fois sur cinquante — et l'affirme avec le même aplomb que les
quarante-neuf autres.

### Ce qu'il paie est visible, mais aucun prix n'est écrit
L'espace montre la formule, les missions restantes sur la période et la date de fin — réponse au
deuxième grief le plus fréquent chez les concurrents : l'opacité des coûts. **Aucun montant n'est
affiché**, et c'est délibéré : le prix vit chez le prestataire de paiement, pas en base. L'écrire
dans le code afficherait un chiffre que rien ne garantit, et le jour où un tarif change, l'espace
mentirait à celui qui paie l'autre montant. Une **jauge**, pas un pourcentage : « 68 % » demande
une conversion mentale, une barre se lit d'un coup d'œil.

### Le garde-fou du silence
Après 40 envois **sans une seule réponse**, l'employée s'arrête d'elle-même. C'est la réponse
directe au reproche le plus documenté fait aux concurrents (« ~1 400 emails, 0 réponse »). Elle ne
s'exprime **que si rien d'autre ne bloque** : un domaine suspendu *explique* le silence, et
l'annoncer enverrait le dirigeant réécrire son message alors que le problème est technique.

### Jamais un message flou, et surtout pas sur un accord

Règle donnée par le fondateur, et elle est absolue : **aucun message vague**. L'écran des accords
affichait *« Une action attend votre accord »* — on lui demandait d'autoriser quelque chose qu'il
ne pouvait pas voir.

Les deux issues étaient mauvaises. Soit il clique sans savoir, et la garde qui l'arrête n'est plus
qu'une case à cocher. Soit il n'ose pas, et son employée reste bloquée sans qu'il comprenne
pourquoi.

L'information existait déjà : la table `approval` ne porte que la mission et la date, mais le
**contenu** vit au journal, dans l'événement `proposition_recue` qui précède la suspension
(capacité, entrée, raison). `ce_qui_attend_votre_accord()` va le chercher. **Rien n'a été ajouté
au schéma : tout était écrit, personne n'allait le lire.**

⚠️ Et quand le contenu est introuvable, on l'écrit — *« ne l'autorisez pas sans savoir ce qu'elle
contient »* — plutôt que d'inventer un intitulé. Un libellé faux est pire qu'un libellé absent.

### On ne stocke PAS le texte des réponses reçues

Le briefing d'avant rendez-vous ne peut donc **pas** citer ce que le prospect a écrit. Sentio
enregistre ce qu'il **envoie** (`outbound_message`) et ce que le client **déclare** (`outcome`) —
jamais le contenu de ce qui arrive.

Ce qui porte des mots venus de l'échange, ce sont les **notes consignées** par l'employée
(`execution_event`, `fiche_mise_a_jour`, `payload.note`). C'est la pièce la plus précieuse du
briefing, et la seule de cette nature.

⚠️ **Chaque élément est affiché avec sa provenance.** Un briefing dont on ignore d'où vient chaque
ligne ne se défend pas en réunion — et c'est exactement là qu'on en a besoin. Ne jamais faire
semblant de citer une réponse : devant un client qui a le message sous les yeux, le mensonge se
voit en une seconde.

### La récolte est nommée par le rôle, jamais dérivée d'un métier

Le fondateur a demandé une pastille montrant « les prospects qui ont répondu positivement », puis
a ajouté lui-même la nuance qui compte : *« chaque agent peut avoir un rôle différent, donc il y
aura des agents qui ne vont pas forcément envoyer des messages de prospection. »*

⚠️ **C'est le piège exact que `adr/0029` existe pour éviter.** Écrire « prospect » dans la requête
SQL ferait rentrer la prospection dans le noyau, et un employé qui reprend les demandes entrantes
n'aurait jamais rien à montrer là.

Ce qui est posé : `recolte_du_client()` rend les entreprises qui ont donné une **suite** — un
rendez-vous ou une vente — quel que soit le travail qui l'a produite. Elle ne connaît aucun métier.
C'est `motsDeLaRecolte(role)`, dans le domaine, qui **nomme** le panneau. **Le rôle décide des
mots ; les faits sont les mêmes pour tout le monde.**

Et le repli d'un rôle inconnu est **neutre**, jamais celui de la prospection : servir « vos
prospects » à un employé administratif serait spécialiser le noyau par le vocabulaire.

### Deux pièges d'animation, trouvés par le fondateur en utilisant la scène

Ils ne se voient ni au typecheck, ni sur une capture fixe. Il faut **cliquer**.

1. **`backdrop-filter` + `transform` fait apparaître un rectangle.** Les pastilles de capacités
   floutaient leur arrière-plan tout en étant animées : le temps de l'animation, la couche de flou
   n'est pas découpée par le `border-radius`, et un **carré** apparaît. Le fond est désormais
   opaque — sur du noir, ça se voit exactement pareil, et ça ne coûte plus un re-floutage par
   image. **Ne remets pas de `backdrop-filter` sur quelque chose qui bouge.**

2. **Deux règles ne peuvent pas animer la même propriété.** La parallaxe posait un `transform` au
   repos, le survol un autre, l'ouverture un troisième (`scale(0.9)`) — la dernière **écrasait**
   les précédentes, et la silhouette faisait un bond de côté à chaque clic. Tout tient maintenant
   dans **une seule déclaration**, chaque terme porté par une variable (`--px`, `--py`, `--leve`,
   `--zoom`). C'est le motif à reprendre pour toute composition de transformations.

### La formule affichée est celle qui s'applique
Le compte de missions montré au client est **le même** que celui qui applique le plafond
(`missions_restantes_sur_la_periode`). Deux façons de compter finiraient par diverger, et le
dirigeant lirait « il vous en reste 12 » pendant qu'on lui refuse la treizième — un chiffre vrai
ailleurs, donc impossible à comprendre. Vérifié par l'invariant `LADY-AH`.

⚠️ **Et aucun montant n'est affiché.** Le prix vit chez le prestataire de paiement, pas en base.
L'écrire dans l'espace afficherait un chiffre que rien ne garantit — le jour où un tarif change,
l'espace mentirait à celui qui paie.

⚠️ **Les compteurs viennent des vraies lignes, pas de `usage_counter`.** Cette table ne reçoit que
les **jetons d'inférence** : les lignes `outbound_messages_per_period` et `tasks_per_period` de
`plan_quota` existent, mais rien ne les y écrit. Afficher un compteur que personne n'alimente
afficherait zéro pour toujours.

### La mémoire classe par récence, pas par usage
`learned_fact.usage_count` existe et est **volontairement non alimenté**. Un compteur nourri par
la sélection qu'il alimente n'est pas une mesure, c'est une boucle : les premiers faits appris
deviendraient des gagnants permanents et la mémoire se figerait au bout d'une semaine.
**Ne le « répare » pas.**

---

## 6. Les pièges — vécus, pas théoriques

Chacun a coûté du temps. Ils sont listés dans l'ordre où on les rencontre.

### Base et schéma

1. **Postgres local ne démarre pas sans `LC_ALL=C`** sur ce Mac (« postmaster became
   multithreaded »). Le rôle `postgres` a dû être créé à la main. Détail : `docs/30`.
2. **`supabase/tests/run.sh` n'efface pas le schéma.** Après une exécution interrompue, il échoue
   sur « relation already exists ». Réflexe :
   `psql -d "$DATABASE_URL" -c 'drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;'`
3. **Dans une transaction, tous les `now()` rendent le MÊME instant.** Un contrôle qui compare
   « envoyé après la dernière réponse » passe alors à côté de ce qu'il vérifie. Poser les
   horodatages explicitement.
4. **Les blocs d'invariants partagent la transaction.** Ne jamais affirmer un **total absolu** sur
   l'entreprise d'essai : mesurer des **écarts**. Sinon le contrôle casse le jour où quelqu'un
   ajoute un bloc plus haut — en accusant le mauvais.
5. **Un filet posé dans une migration ne voit que le passé.** Le contrôle d'isolation de
   `20260729120029` n'a rien examiné pendant douze migrations. Les contrôles structurels vivent
   désormais dans les **invariants** (`AUDIT-01/02/03`), qui tournent après *toutes* les migrations.
6. **Droit ≠ politique.** Une politique RLS sans `grant` refuse le client **avant** que RLS ne
   s'exprime, avec un message parlant de permission — personne ne fait le lien. `AUDIT-01` le
   vérifie maintenant.
7. **`revoke ... from public` ne suffit pas** : la plateforme accorde des droits **directement** à
   `authenticated` et `anon`. Écrire `from public, authenticated, anon`.
8. **Renommer une fonction déplace son verrou ; la remplacer, non.** Une fonction recréée sous le
   même nom **naît ouverte**. `AUDIT-02` le vérifie.
9. **Le drapeau `sentio.retention_purge` est local à la TRANSACTION, pas à la fonction.** Le
   laisser levé rend supprimable, pour tout le reste de la transaction appelante, ce qui ne doit
   jamais l'être.

### Runtime et tests

10. **`job.next_run_at` vient de l'horloge Postgres.** Comparer à l'horloge Node rend le travail
    « pas encore dû » et fait échouer un test sur une assertion sans rapport. Lire l'heure **dans
    la base** (`select now()`).
11. **La file de travaux est globale.** En test, les suites se volent les missions. Purger la file
    des autres entreprises après l'approvisionnement.
12. **Le noyau le plus récent gagne** (`max(version)+1`) : un noyau d'essai à version aléatoire se
    fait dépasser.
13. **Deux moteurs peuvent s'appeler « base ».** La clé d'un moteur est **(capacité, moteur)** —
    sinon « qualifier un prospect » exécute « mettre à jour une fiche », silencieusement, avec les
    bons journaux.

### Interface

14. **`justify-content: center` COUPE le haut** quand le contenu dépasse la hauteur. Sur un écran
    large et court, la silhouette passait hors champ. `safe center`.
15. **La spécificité d'un `:not()` compte celle de son argument.** Une règle de base avec
    `:not(...)` bat une classe d'accent, et **aucune erreur ne le signale**. Trouvé en lisant les
    styles calculés, pas le fichier.
16. **Une variable CSS ne s'hérite que par l'arborescence.** Les jetons sont posés sur la scène
    **et** sur le tiroir : le jour où le tiroir passe dans un portail, les couleurs disparaissent
    sans erreur.
17. **`list-style: none` ne retire pas le retrait de 40 px.**
18. **Toujours regarder l'écran.** Les trois quarts des défauts d'interface de ce projet ont été
    trouvés en prenant une capture, jamais en relisant le code.
19. **Et une capture ne suffit pas pour ce qui bouge.** Le carré des pastilles et le bond de la
    silhouette n'apparaissent qu'**au clic**, le temps d'une animation. Les deux ont été signalés
    par le fondateur, pas trouvés par moi. Quand tu touches à une transition, **déclenche-la**.

---

## 7. Comment travailler

**`pnpm run verify` est la définition unique de « vérifié ».** Il tourne aussi avant chaque
`git push` (hook `.githooks/pre-push`). Il exige `DATABASE_URL` pointant vers la base locale :

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:5432/sentio_test pnpm run verify
```

Un push qui échoue n'est **pas** à réessayer tel quel : mesurer d'abord ce qui est instable.

**Le fil du travail est [`docs/29`](29-plan-jusquau-premier-client.md).** « Continue le plan » ⇒
la première étape non cochée. Chaque étape livrée y est documentée avec **ce qui a été trouvé en
chemin**, pas seulement ce qui a été fait — c'est ce qu'il lit.

**Les messages de commit** sont en français, disent le **pourquoi** et **ce que le défaut aurait
coûté**, et se terminent par la ligne `Co-Authored-By` habituelle. Un commit de ce dépôt se lit
comme une note d'ingénierie, pas comme un journal de modifications.

**Deux scripts d'audit** sont à disposition, hors `verify` (ils fouillent, ils ne bloquent pas) :

```bash
psql -d "$DATABASE_URL" -f supabase/tests/parcours-client.sql   # le parcours, 19 étapes
psql -d "$DATABASE_URL" -f supabase/tests/audit-fuites.sql      # ce qu'un client voit du voisin
```

**Chiffres de repère** (2026-08-26) : 80 migrations, ~190 commits, 33 documents, 30 ADR. Branche
de travail : **`noyau-lady`**.

---

## 8. Ce qui reste

### Côté agent — faisable sans lui

- **rapprocher `apps/vitrine` du reste du monorepo** — c'est un chantier en soi, jamais un effet de
  bord à provoquer au détour d'une tâche ;
- **le savoir sectoriel** (`sector_profile`) est vide. C'est du **contenu**, pas du code : la
  couche se déclare simplement absente, et c'est le comportement voulu. ⚠️ Ne jamais la « réparer »
  avec du générique — ce serait faire dire à une employée qu'elle connaît un métier qu'elle ne
  connaît pas, devant le client de ce métier.

### Décidé avec lui, à faire

- **la page d'arrivée après paiement** (elle existe déjà, elle doit montrer l'employée) et
  **l'email de présentation**. Décision prise : les deux, dans cet ordre. L'email est le document
  **durable** et il contient ce qui rassure — *ce qu'elle ne fera jamais* — mais **pas** le lien
  magique : un identifiant n'a rien à faire dans un document qu'on garde et qu'on transfère.

### ⛔ À lui, et à lui seul

Immatriculation · légal (CGU, RGPD, registre) · mise en ligne, dont **brancher l'expédition** ·
répétition générale en réel · vendre.

**Avant le premier envoi réel, lui rappeler explicitement ces trois points** — il l'a demandé, et
aucun code ne peut les faire à sa place :

1. créer un compte Resend **séparé du compte personnel** ;
2. configurer le domaine du client **en région UE (Irlande)** ;
3. poser `RESEND_API_KEY` en variable d'environnement — jamais dans le dépôt, jamais dans un chat.

Et avant que des **données réelles** transitent vers un modèle : l'opt-out d'entraînement doit être
prouvé, et l'immatriculation faite.

---

## 9. Tenir ce fichier à jour — c'est une consigne du fondateur

**Eelco a demandé explicitement que chaque chose faite soit consignée ici**, pour que l'agent
suivant ne redécouvre rien. Concrètement, après chaque livraison :

- une **décision qui ne se devine pas en lisant le code** → §5 ;
- un **piège rencontré** (et le temps qu'il a coûté) → §6 ;
- quelque chose de **terminé** → le retirer de §8 ;
- quelque chose de **nouveau à faire** → l'ajouter à §8, du bon côté (agent / lui).

Ce fichier n'est pas un journal : c'est ce qui évite de refaire deux fois la même erreur. Une
entrée qui n'apprend rien à un lecteur qui ne connaît pas le projet n'a rien à y faire.

---

## 10. Si tu ne dois retenir que cinq choses

1. **Ce qui n'est pas mesuré n'est pas affiché.** Écrire qu'on ne sait pas encore vaut mieux qu'un
   chiffre plausible.
2. **Elle propose, elle n'applique pas** — pour tout ce qui touche à son rôle.
3. **Les garanties vivent dans la base.** Si c'est mécaniquement décidable, ajoute un contrôle et
   branche-le sur `verify` ; n'écris jamais « à vérifier à la revue ».
4. **Aucun message flou, jamais.** Si l'écran demande une décision, il dit sur quoi elle porte.
   Et pas de tiret cadratin dans le texte visible — demande explicite du fondateur. Une virgule,
   un deux-points ou une phrase de plus. Les commentaires de code n'en sont pas concernés.
5. **Signale ce que tu découvres.** Les manques structurels trouvés en codant sont ce qu'il
   attend le plus — les taire est la vraie faute.
6. **Regarde l'écran.** Le code qui compile n'est pas le produit que le client voit.
