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
| 2026-08-26 | **Ce qu'une proposition change, terme à terme** — aujourd'hui / si vous acceptez | Une phrase de résumé dit une intention ; le dirigeant valide une **conséquence** |
| 2026-08-26 | **Audit avant mise en vente** ([`docs/32`](32-audit-avant-mise-en-vente.md)) — texte, sécurité, RGPD. Lecture seule, rien modifié | Le cœur est solide ; **le site public et le cœur sont deux produits qui ne se touchent pas**. Le paiement ne recrute personne, l'acheteur atterrit sur la démo, `/espace` n'est lié nulle part |
| 2026-08-27 | **Le garde des frontières regarde enfin la vitrine** — lexique et tirets rendus mécaniques | Deux règles scannaient `apps/web/src`, **supprimé**. Elles lisaient zéro fichier et disaient « rien à signaler » |
| 2026-08-27 | **Plus aucun tiret sur une page publique**, vérifié dans le RENDU | 49 corrigés, dont 8 titres d'onglet et 12 faux tirets de puce dans les droits RGPD |
| 2026-08-27 | **Trois textes qui promettaient du vide, retirés** | La section « Le retard », les 20 lignes d'offre sur l'écran de paiement, et deux notes internes publiées au client |
| 2026-08-27 | **`CRON_SECRET` et `SENTIO_IP_HASH_SALT` échouent fermé** | Les deux échouaient OUVERT quand ils manquaient. Le sel avait une valeur de repli **écrite dans git** |
| 2026-08-27 | **L'accueil a enfin un plafond**, le même que le diagnostic | Server Action publique qui appelait un modèle sans aucune limite : facture ouverte à qui écrit une boucle |
| 2026-08-27 | **La garde « une fois par jour » ne tenait pas la nuit** | ⚠️ Défaut réel trouvé en lançant `verify` à 00 h 12. Voir piège 20 : Node compte en UTC, `::date::timestamptz` compte dans le fuseau de la session |
| 2026-08-27 | **Le parcours gratuit** ([`docs/33`](33-le-parcours-gratuit.md)) — `pnpm run inviter` | Une COMMANDE, jamais une route : une page qui donne le produit sera trouvée. Référence `invitation:` pour que le gratuit reste distinguable du payant à jamais |
| 2026-08-27 | **L'email de présentation** — le seul document que le client garde | Il porte ce qu'elle ne fera JAMAIS, jamais un mot de passe. Neuf tests tiennent son lexique et sa typographie |
| 2026-08-27 | **Identifiant et mot de passe** sur l'espace, à la place du seul lien magique | Demande du fondateur. Le client pose son mot de passe sur `/acces`, jamais reçu par email. Même message d'erreur adresse inconnue / mauvais mot de passe, sinon le formulaire devient un annuaire |
| 2026-08-27 | **On n'atterrit plus sur la démonstration après connexion** | `/dashboard` sans paramètre montrait le tenant de démo à celui qui venait de payer (B2). C'est `/espace` |
| 2026-08-27 | **Chacun le sien, même à huit en même temps** — `LADY-W`, 3 tests d'intégration concurrents | ⚠️ **Vrai défaut trouvé** : l'espace lisait employé, objectif, notifications et mémoire SANS filtrer par entreprise. RLS protège d'autrui, **pas de soi-même** |
| 2026-08-27 | **Le rattachement verrouille son attente** (`20260815120037`) | Deux arrivées simultanées de la MÊME adresse rattachaient deux fois la même entreprise, et laissaient la seconde orpheline. Échec reproduit 3 fois sur 3 avant le correctif |
| 2026-08-27 | **L'inventaire du Supabase** ([`docs/34`](34-tout-ce-qui-doit-etre-sur-supabase.md)) — `pnpm run supabase:inventaire` | La référence est la base locale reconstruite par les migrations : **aucun fichier d'attendu à tenir à jour, donc aucun à oublier**. Compare une base réelle et énumère les absents |
| 2026-08-27 | **Trois secrets manquaient au contrôle de déploiement** | ⚠️ `SENTIO_PAIEMENT_SECRET`, `SENTIO_OPTOUT_SECRET`, `SENTIO_ALLOWED_ORIGINS`. Chacun **échoue fermé** : le paiement ne recrute plus, la désinscription est invalide, le diagnostic est muet. En silence |
| 2026-08-27 | **Le parcours réel** : le diagnostic ÉCRIT sa recommandation, puis recrute et envoie | Il ne gardait rien. ⚠️ Le navigateur ne renvoie que le PROFIL : la configuration est **recomposée côté serveur**, sinon un visiteur s'accorde des pouvoirs |
| 2026-08-27 | **L'email ne présume plus du genre** | ⚠️ Le réservoir d'identités est MIXTE (Camille, Julien, Cédric, Julie). Il disait « elle » partout : faux une fois sur deux, dans un document qu'on ne peut pas rattraper |
| 2026-08-27 | **Landing réécrite sur le parcours réel, et plus aucun prix** | Les six étapes promises n'existaient pas, et le fichier l'avouait en commentaire. Décision : gratuit pour l'instant, formules quand elles seront vraies |
| 2026-08-27 | **Le parcours en deux temps** : conversation → `/formules` → email | La recommandation est ÉCRITE d'abord, seul son identifiant voyage. C'est la forme que prendra le parcours payant : le paiement s'intercalera là, rien d'autre ne bougera |
| 2026-08-27 | **Les formules sortent de la BASE**, avec leurs vraies limites | Aucun prix : il vit chez le prestataire de paiement (`docs/31` §5). Un palier non commercialisable se montre fermé au lieu de se vendre |
| 2026-08-27 | **La scène raconte avant, pendant, après** — et le devis oublié ressort à la fin | Demande commerciale du fondateur. ⚠️ Ce qui persuade n'est pas une promesse mais une **reconnaissance** : sa propre semaine, jamais un pourcentage. Trois premiers temps à panneau VIDE, parce qu'il n'y a personne |
| 2026-08-27 | **La promesse sur les données, écrite UNE fois** et reprise à chaque écran où le client donne quelque chose | Six formulations divergent en trois mois. Elle dit d'abord à quoi les données SERVENT, pas ce qu'on n'en fait pas : c'est la vraie question. Six tests la surveillent |
| 2026-08-27 | **Une friction en moins sur le dernier écran** | Le formulaire de fin était derrière un bouton « Choisir ». Deux gestes pour une décision, là où l'on perd des gens |
| 2026-08-27 | **L'espace devient agnostique au métier** — `motsDuTravail(role)` | Les chiffres, la courbe et les 6 états parlent le vocabulaire du RÔLE. ⚠️ Le repli est **neutre**, jamais celui de la prospection : c'est `adr/0029` |
| 2026-08-27 | **Le tiroir qui manquait : ce qu'elle fait EN CE MOMENT** | L'espace disait ce qu'elle sait faire, a obtenu, a appris. Jamais ce qu'elle fait. `task.state` portait déjà six états génériques, personne ne les affichait |
| 2026-08-27 | **L'accord donné une fois pour toutes** (`20260815120039`) | `standing_approval` existait et le moteur le lisait déjà : il manquait les deux gestes. ⚠️ Sa contrepartie non négociable : `ce_qu_elle_a_fait()` montre ce qui est passé **sans** demander |
| 2026-08-27 | **Les cinq écrans de l'accord permanent** : bouton « toujours autoriser », tiroir de ce qu'elle a fait, retrait depuis la ligne qui a gêné | Le retrait coûte le MÊME geste que l'accord. Et « toujours autoriser » NOMME la capacité : sinon il ferait signer une page blanche |
| 2026-08-27 | **Le pourquoi passe sous son nom**, hors des tiroirs | `lady_configuration.raison` existait et n'était lisible qu'après un clic. C'est ce qui empêche de lire son rôle comme une identité définitive |
| 2026-08-27 | **Le tiroir « ce qu'elle sait faire » montre enfin les capacités** | Il annonçait ses capacités et affichait ses PRIORITÉS. Les capacités n'étaient que des points lumineux, sans un mot |
| 2026-08-27 | **Le point rouge** sur ce qu'il n'a PAS ENCORE VU, jamais sur « elle travaille » | Demandé sur l'activité. ⚠️ Elle travaille en permanence : le point aurait été allumé toujours, donc invisible en deux jours. C'est la décision du fondateur du 2026-08-26, appliquée contre sa propre demande du 27 |
| 2026-08-27 | **La base est tranchée** ([`adr/0030`](adr/0030-une-seule-base-celle-du-coeur.md)) : c'est le projet du CŒUR | `docs/27` penchait pour l'autre, pour garder ses comptes. Argument tombé : **aucun compte réel**, et la base est en pause depuis le 6 août, donc elle n'a rien pu recevoir depuis |
| 2026-08-27 | **L'ancienne génération retirée** : 5 pages, le cron, 11 composants, 8 modules, et **le second moteur métier de `vitrine-core`** | La vitrine n'importe plus que 2 sous-chemins au lieu de 4. ⚠️ Trouvé en retirant : le diagnostic public écrivait dans `diagnostic_rate_limit`, table qui **n'existait que dans l'ancien schéma** |
| 2026-08-27 | **Le locataire de démonstration n'existe plus** (constat B10 refermé) | N'importe quel visiteur inscrit pouvait y lancer un vrai cycle et LIRE ce que les autres y avaient fait. Une exception d'accès qui survit à sa fonctionnalité est un trou |

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

### Un écran de décision montre la CONSÉQUENCE, pas l'intention

Règle donnée par le fondateur : *« sois plus clair dans tes messages pour que le chef sache
exactement ce qu'il va accepter ou pas. »* Elle s'applique partout où il y a un bouton qui engage.

La proposition disait *« Julie se concentrerait plutôt sur… »* : une intention. Elle affiche
désormais la **différence terme à terme** — ce qu'elle fait aujourd'hui, ce qu'elle ferait, ce
qu'elle **gagne** et surtout ce qu'elle **cesse de faire**, si son autonomie bouge, et que tout est
réversible.

⚠️ **`capacites_retirees` est la ligne la plus importante de cet écran.** Une configuration
**retranche** au périmètre : ce qu'elle ne reprend pas est réellement retiré. Ne pas le montrer
ferait accepter une perte sans le savoir, découverte trois semaines plus tard.

Et chaque bouton dit ce qu'il déclenche : *« si vous autorisez, ce message part tel quel ; si vous
refusez, il ne partira pas. »* « Autoriser » et « Refuser » sont clairs sur le geste, pas sur sa
conséquence.

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

### Ce qu'on promet sur les données s'écrit à UN seul endroit

`packages/domain/src/promesse-sur-les-donnees.ts`, repris par la landing, le diagnostic, les
formules, l'écran du mot de passe et l'email de présentation.

Demande du fondateur le 2026-08-27 : rassurer sur les données **à presque chaque écran**. Écrite
six fois, la promesse diverge en trois mois : une page dira « jamais partagées », une autre
« jamais vendues », et le client qui lit les deux se demandera laquelle est vraie.

⚠️ **Elle dit d'abord à quoi les données SERVENT.** « Nous ne vendons pas vos données » est ce que
tout le monde écrit et que personne ne lit. Ce qu'un dirigeant veut savoir est plus précis : à
quoi elles servent, et jusqu'où elles vont. L'ordre compte : commencer par l'interdit donne
l'impression qu'on se défend.

Et chaque mot est adossé à quelque chose : l'usage au contexte à trois couches, l'amélioration à
la réflexion d'après-mission, l'étanchéité à `verify_tenant_isolation` et `adr/0014`. Six tests
refusent une échappatoire (« en principe », « sauf », « dans la mesure »), un chiffre de résultat,
un mot du lexique ou un tiret. Si l'une des trois cessait d'être vraie, **c'est ce fichier qu'il
faudrait corriger en premier**.

### RLS répond à « qui a le droit de voir », pas à « laquelle des miennes »

C'est la distinction qui a coûté un défaut réel, trouvé le 2026-08-27 en cherchant ce que le
fondateur redoutait : *« si un client parle à Lady lors de l'achat, c'est bien et seulement son
agent à lui »*.

`/espace` lit par le client à session, donc RLS s'applique, donc **un inconnu ne voit rien**. Ça
n'a jamais été en cause. Ce qui l'était : RLS rend les lignes de **toutes** les entreprises du
compte connecté. Six lectures n'en nommaient aucune, et l'entreprise affichée était prise par un
`[0]` sans `order by`.

Un dirigeant rattaché à deux entreprises — deux sociétés, ou simplement **deux invitations à la
même adresse** — voyait donc le nom et les chiffres de l'une avec l'employée de l'autre, et
l'attribution changeait d'un rechargement au suivant.

⚠️ **Une garantie qui protège d'autrui ne protège pas de soi-même.** Le filtre `tenant_id`
explicite n'est pas une ceinture de plus par-dessus RLS : il répond à une **autre question**.
Tenu mécaniquement par la règle 7 de `verifier-frontieres.mjs`, qui a d'ailleurs attrapé une
huitième lecture que j'avais ratée à la main.

Et ce qui n'était **pas** en cause, vérifié plutôt que supposé : `reserve_identity` verrouille en
`for update skip locked`, aucun état modifiable ne vit au niveau module dans le code serveur de la
vitrine, et le rapprochement se fait sur une adresse **prouvée**. Deux personnes distinctes n'ont
donc jamais pu se croiser. `LADY-W` le prouve à huit recrutements simultanés.

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
12. **Le noyau le plus récent gagne** (`max(version)+1`) : un noyau d'essai à version aléatoire
    se fait dépasser. ⚠️ **Et on ne peut PAS le nettoyer** : `employee_definition` est immuable
    (invariant 1), la base refuse le `delete`. Une base de test accumule donc des noyaux
    définitivement, chacun avec SES capacités, et `recruter()` échoue sur « la bibliothèque et le
    noyau ont divergé » — une erreur qui accuse le produit alors que la faute est dans le jeu
    d'essai. Seize suites en insèrent un. La seule parade : **publier le sien**, avec les cinq
    capacités, et laisser `max(version)` faire le reste. Ce piège s'est déclenché **trois fois le
    2026-08-27**.
    fait dépasser.
13. **Deux moteurs peuvent s'appeler « base ».** La clé d'un moteur est **(capacité, moteur)** —
    sinon « qualifier un prospect » exécute « mettre à jour une fiche », silencieusement, avec les
    bons journaux.

### Interface

19 bis. **Node compte les jours en UTC, Postgres dans le fuseau de sa SESSION.** Une garde
    « une fois par jour » bornait sa fenêtre avec `($jour::date)::timestamptz`, où `$jour` venait
    de `new Date().toISOString()`. Sur un serveur en Europe/Paris, la fenêtre glissait de deux
    heures : **entre minuit et 2 h locales**, l'événement qu'on venait d'écrire tombait après la
    fin de la fenêtre, la garde ne le voyait pas, et le travail du jour se refaisait à chaque
    battement. Écrire `($jour::date)::timestamp at time zone 'UTC'`. Deux endroits étaient
    touchés (`reevaluation.ts`, `progression.ts`). ⚠️ **Et le test qui l'attrapait ne tombait que
    deux heures par nuit** : le test de non-régression force `Etc/GMT-14` et `Etc/GMT+12`, pour
    qu'il échoue à n'importe quelle heure.

19 ter. **`&apos;` se termine par un point-virgule.** Un filtre qui écartait les lignes de code en
    cherchant `=` ou `;` a écarté, en silence, **toute phrase française contenant une
    apostrophe**. Retirer les entités HTML avant d'analyser du texte JSX.


14. **`justify-content: center` COUPE le haut** quand le contenu dépasse la hauteur. Sur un écran
    large et court, la silhouette passait hors champ. `safe center`.
15. **La spécificité d'un `:not()` compte celle de son argument.** Une règle de base avec
    `:not(...)` bat une classe d'accent, et **aucune erreur ne le signale**. Trouvé en lisant les
    styles calculés, pas le fichier.
16. **Une variable CSS ne s'hérite que par l'arborescence.** Les jetons sont posés sur la scène
    **et** sur le tiroir : le jour où le tiroir passe dans un portail, les couleurs disparaissent
    sans erreur.
17. **`list-style: none` ne retire pas le retrait de 40 px.**
17 bis. **Un contrôle peut être vert parce qu'il ne regarde nulle part.** Deux des six règles de
    `scripts/verifier-frontieres.mjs` scannent `apps/web/src`, dossier supprimé avec l'ancienne
    vitrine SvelteKit. Elles lisent **zéro fichier** et rendent « rien à signaler ». Quand tu
    déplaces ou supprimes un dossier, **cherche qui le nommait** — un chemin mort ne lève aucune
    erreur, il rend juste le contrôle muet. Trouvé à l'audit du 2026-08-26 (`docs/32` §A2).
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
