# 33 — Le parcours gratuit, et l'entrée du client dans son espace

> Écrit le 2026-08-27, à la demande du fondateur : *« je veux un parcours gratuit seulement pour
> moi, je ne veux pas passer par l'achat »*, *« le client reçoit par mail sa page privée »*,
> *« sa page nécessite un mot de passe et un identifiant »*.

---

## 1. En une phrase

Une commande crée l'entreprise et son employée sans paiement, puis envoie au client **l'email de
présentation**, qui porte un lien à usage unique. Le client y **choisit son mot de passe**, et
entre ensuite dans son espace avec son adresse email et ce mot de passe.

---

## 2. Pourquoi une commande, et surtout pas une page

Ce parcours **donne le produit gratuitement**. Une page qui fait ça, même cachée, même protégée
par un mot de passe posé en variable d'environnement, est une porte ouverte sur internet : elle
sera trouvée.

Le dépôt en a déjà l'exemple, et il a coûté un audit à repérer. `CheckoutAction` livre aujourd'hui
un compte à qui clique sur « Procéder au paiement » quand la clé de paiement n'est pas posée
(constat **B4** de [`docs/32`](32-audit-avant-mise-en-vente.md)). L'intention était honnête ; le
résultat est une porte ouverte.

Une commande ne s'exécute que depuis un poste qui a déjà la chaîne de connexion et les clés.
**Elle n'ajoute aucune surface.** Et le jour où tu veux la retirer, tu supprimes un fichier, pas un
chemin qu'il faut se rappeler d'avoir désactivé.

---

## 3. Ce qu'il faut avoir posé avant

| Variable | À quoi elle sert | Sans elle |
|---|---|---|
| `SUPABASE_DB_URL` | la base où l'entreprise est créée | la commande s'arrête |
| `NEXT_PUBLIC_SUPABASE_URL` | le projet où vit le compte du client | la commande s'arrête |
| `SUPABASE_SERVICE_ROLE_KEY` | créer un accès pour quelqu'un d'autre | la commande s'arrête |
| `RESEND_API_KEY` | envoyer l'email | la commande s'arrête |
| `SENTIO_EMAIL_EXPEDITEUR` | l'expéditeur, sur **ton** domaine | la commande s'arrête |
| `NEXT_PUBLIC_APP_URL` | construire les liens de l'email | valeur locale par défaut |

⚠️ **Aucune n'a de valeur de repli, et c'est voulu.** Une commande qui recrute à moitié laisse une
entreprise sans moyen d'entrer chez elle.

⚠️ `SUPABASE_SERVICE_ROLE_KEY` ouvre **tout** le projet. Elle vit sur ton poste et nulle part
ailleurs : jamais dans le dépôt, jamais dans un chat, jamais dans une variable de la vitrine.

---

## 4. La commande

```bash
pnpm run inviter -- --email=vous@exemple.fr --entreprise="Votre société" \
                    --objectif="10 rendez-vous qualifiés ce mois" --cible=10
```

Options : `--horizon` (défaut « ce mois »), `--secteur`.

### Ce qu'elle fait, dans l'ordre

1. écrit un diagnostic et sa recommandation, parce que `recruter()` refuse de recruter sans savoir
   **pour quoi** ;
2. appelle `recruter()` avec une référence `invitation:<identifiant>` au lieu d'une référence de
   paiement. Tout le recrutement tient dans cette transaction : entreprise, identité, employée,
   abonnement, objectif, configuration ;
3. demande à Supabase un lien d'accès **à usage unique** ;
4. envoie l'email de présentation, qui porte ce lien et **aucun mot de passe**.

### Ce qu'elle ne fait pas

Elle n'écrit à aucun prospect et ne déclenche aucune mission. Elle crée une employée qui attend,
exactement comme après un paiement.

### La configuration posée

Volontairement **la plus prudente** que le noyau accepte : rôle `prospection`, capacités
`qualifier` et `relancer`, autonomie `confirm`, formule `start`. **Une invitation ne crée jamais
une employée plus libre qu'un client payant.**

---

## 5. Pourquoi la référence dit « invitation »

`subscription.billing_reference` est **unique** : c'est ce qui rend le rejeu d'un webhook de
paiement inoffensif. En y écrivant `invitation:<identifiant>`, une entreprise offerte reste
reconnaissable en une requête, pour toujours :

```sql
select t.name, s.created_at
  from subscription s join tenant t on t.id = s.tenant_id
 where s.billing_reference like 'invitation:%';
```

Écrire une fausse référence de paiement aurait mélangé le gratuit et le payant dans la seule
colonne qui les distingue. Le jour où tu comptes ton chiffre d'affaires, tu comptes faux.

---

## 6. L'email de présentation

Il vit dans [`packages/domain/src/email-presentation.ts`](../packages/domain/src/email-presentation.ts),
et il est **pur** : il reçoit des faits, il rend du texte. C'est ce qui permet à neuf tests de
vérifier à chaque `verify` qu'il ne dérive pas.

**Ce qu'il porte :** qui elle est, pour quelle entreprise, son métier, l'objectif que tu as
énoncé, ce sur quoi elle se concentre, et surtout **ce qu'elle ne fera jamais**.

⚠️ **Les quatre « jamais » ne sont pas du marketing.** Chacun correspond à une garantie tenue par
la base : l'accord avant tout envoi, le cliquet d'autonomie, la version inactive d'une
réévaluation, l'étanchéité entre entreprises. Les écrire sans qu'ils soient vrais serait
exactement le mensonge que ce produit ne peut pas se permettre.

**Ce qu'il ne porte pas :** aucun mot de passe, aucun chiffre qui ne vienne d'une ligne en base.

Le lien qu'il contient est **à usage unique** et il expire. La règle de `docs/31` §8 reste donc
entière : un lien mort ne donne accès à rien, un mot de passe recopié donne accès à tout.

---

## 7. L'entrée dans l'espace : identifiant et mot de passe

| Écran | Ce qui s'y passe |
|---|---|
| l'email | bouton « Choisir mon mot de passe », à usage unique |
| `/auth/callback` | échange le lien contre une session, **sur un clic**, jamais au chargement |
| `/acces` | le client choisit son mot de passe, deux fois, sur une session déjà ouverte |
| `/espace` | son espace |
| `/login` | ensuite, adresse email et mot de passe |

**L'identifiant est l'adresse email.** Rien à retenir, rien à perdre, et c'est déjà ce que la base
connaît pour rattacher l'acheteur à son entreprise (`rattacher_par_email`).

### Quatre décisions qui ne se devinent pas

1. **Aucun écran d'inscription, et c'est voulu.** On ne s'inscrit pas à Sentio, on y est accueilli.
   Une page d'inscription ouverte laisserait créer des comptes vides, sans entreprise ni employée.
2. **Le même message d'erreur pour une adresse inconnue et un mauvais mot de passe.** Deux
   messages différents transforment le formulaire en annuaire : on y teste des adresses jusqu'à
   savoir lesquelles sont clientes de Sentio. Cette information appartient à nos clients.
3. **La connexion passe par une Server Action, pas par le client Supabase du navigateur.** La
   session est posée en cookie côté serveur, et le mot de passe ne traverse que la requête vers
   notre propre serveur.
4. **`/acces` ne demande pas le mot de passe actuel.** On y arrive par un lien reçu sur SA boîte,
   ce qui est la même preuve. En exiger un rendrait la première arrivée impossible, puisqu'il n'y
   en a pas encore.

### Deux défauts refermés au passage

- **`/auth/callback` renvoyait vers `/dashboard`**, qui sans paramètre affiche le tenant de
  démonstration. Le client qui venait de payer voyait des prospects qui n'étaient pas les siens
  (constat **B2** de `docs/32`). Il arrive maintenant sur `/espace`.
- **La page affichait `error_description` tel qu'il venait de l'URL** (constat **B12**). React
  l'échappait, donc pas d'injection de code, mais un lien fabriqué faisait afficher la phrase de
  son choix sur une page portant notre nom et notre logo. Elle dit maintenant ce que nous savons,
  nous. Et la destination `next` ne peut désigner qu'un chemin de ce site.

---

## 8. ⛔ Ce qui reste à toi

**Tout ce qui précède est écrit et éprouvé en local. Rien n'est en ligne**, et un agent ne peut
pas l'y mettre : pousser un schéma et écrire dans une base distante sont tes gestes
([`docs/31`](31-passation-a-un-autre-agent.md) §2).

La question de la base est **tranchée** depuis le 2026-08-27 : c'est le projet du cœur,
`ritwmikarekkisxaiokf` ([`adr/0030`](adr/0030-une-seule-base-celle-du-coeur.md)).

Reste, dans l'ordre, et [`docs/34`](34-tout-ce-qui-doit-etre-sur-supabase.md) §5 les détaille :

1. **pousser le schéma** sur ce projet, puis vérifier avec `pnpm run supabase:inventaire` ;
2. **poser les neuf secrets** des fonctions, et les variables de l'interface ;
3. **autoriser l'adresse de retour** `/auth/callback` dans les réglages d'authentification, sinon
   le lien de cet email est refusé et personne n'entre ;
4. **lancer la commande du §4** avec ta propre adresse.

---

## 9. Le retirer, quand tu voudras

Tu as dit : *« je l'enlèverai par la suite »*. C'est un fichier et une ligne :

```bash
rm scripts/inviter.ts
```

puis retirer `"inviter"` des scripts de `package.json`. Rien d'autre n'en dépend : l'email de
présentation et l'entrée par mot de passe servent aussi le parcours payant, et restent.
