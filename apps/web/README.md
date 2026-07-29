# apps/web

Interface : vitrine publique + espace privé, **deux zones étanches** (groupes de routes,
politiques d'accès et budgets d'inférence distincts — [`02-architecture.md`](../../docs/02-architecture.md)).

**Cadre retenu : SvelteKit**, en sortie **statique** aujourd'hui, en sortie **Node** le jour de la
migration vers un hébergeur européen classique ([`adr/0022`](../../docs/adr/0022-interface-sveltekit.md)).
Le code ne change pas entre les deux : seule la sortie du build change.

---

## Où s'exécute quoi

C'est la question qui commande tout le reste ([`adr/0021`](../../docs/adr/0021-execution-serveur-en-ue.md)).

| Zone | Contenu | Où | Données personnelles |
|---|---|---|---|
| **Vitrine** | présentation, tarifs, démonstration scriptée, pages légales | prérendue, servie n'importe où | **aucune** |
| **Diagnostic, espace privé, retours d'expédition** | tout ce qui lit ou écrit une donnée | fonctions Supabase, **région UE** | oui |

La séparation n'est pas un rangement de dossiers : c'est la frontière qui garantit qu'une page
publique ne peut pas, par construction, toucher une donnée client.

---

## Les six règles, non négociables

Elles appliquent les priorités 1, 3 et 6 ([`adr/0019`](../../docs/adr/0019-priorites-ingenierie.md))
à l'endroit où elles se perdent le plus vite.

1. **Présentation, logique métier et infrastructure sont séparées.** Un composant affiche ; il ne
   décide pas.
2. **Aucun accès direct aux données depuis un composant.** Pas de requête, pas de client de base
   dans un fichier d'interface. L'interface parle à une fonction serveur, jamais à une table.
3. **La logique métier reste dans `packages/domain`, `packages/core` ou un service applicatif.**
   Une règle écrite dans un composant est une règle qui ne sera jamais testée.
4. **Validation systématique côté serveur**, même si elle existe côté client. Celle du navigateur
   est un confort ; celle du serveur est la seule qui protège.
5. **Aucun secret, aucune clé, aucune logique sensible dans le code envoyé au navigateur.** Ce qui
   est livré au client est public, quel que soit le soin apporté à le cacher.
6. **L'interface évolue sans toucher au cœur.** Si un changement d'affichage impose de modifier
   `packages/domain`, une règle a fui vers la présentation.

---

## Ce que ce dossier ne contiendra jamais

- une clé d'API, un jeton de service, une chaîne de connexion ;
- une règle de décision — le moteur de recommandation vit dans
  [`packages/domain/src/recommendation.ts`](../../packages/domain/src/recommendation.ts), et
  l'interface ne fait que l'afficher ;
- un appel direct à un fournisseur de modèle ou à un service d'expédition : tout passe par le
  noyau, puis par une fonction serveur.

---

## Structure

```
apps/web/
  svelte.config.js       la sortie du build — le seul fichier que la migration touchera
  src/app.html           l'enveloppe HTML (lang="fr")
  src/lib/labels.ts      TOUS les textes visibles, et la zone exemptée de lexique
  src/lib/server-functions/
                         l'unique porte vers les fonctions serveur — un composant n'y touche pas
  src/routes/            les pages ; `+layout.ts` déclare le prérendu de la vitrine
```

**Deux endroits à ne pas contourner.** Un texte visible qui n'est pas dans `labels.ts` échappe au
contrôle de lexique (`CONF-08`, [`17-lexique.md`](../../docs/17-lexique.md)) ; un appel réseau qui
n'est pas dans `server-functions/` échappe à la règle 2.

---

## Commandes

```bash
cp .env.example .env     # l'adresse des fonctions serveur — publique, jamais un secret
pnpm run dev             # développement
pnpm run build           # sortie statique dans build/
pnpm run typecheck       # svelte-check
```

`PUBLIC_SENTIO_FUNCTIONS_URL` est **obligatoire pour construire comme pour vérifier les types** —
SvelteKit engendre les types de l'environnement. Une vitrine qui ne sait pas où parler ne doit pas se
construire silencieusement. Ce n'est pas un secret : tout ce qui est livré au navigateur est public.

---

## État

Le squelette est en place, et vérifié : la vitrine se construit en **sortie statique**, la page
d'accueil est **prérendue**, et le contrôle de types passe.

Ce qui existe : l'enveloppe, le fichier de libellés (avec sa zone exemptée pour l'information de
transparence exigée par l'article 50), et le client de la fonction `diagnostic`.

Ce qui n'existe pas encore, et qui est la suite du lot 4 : les sections de la vitrine et les pages
légales (`ACQUIS-01` → `ACQUIS-11`), la conversation de diagnostic (`ACQUIS-12`), l'espace privé.
La page d'accueil est un squelette **assumé comme tel** — une ébauche de page de vente finit
toujours par être prise pour la page de vente.

Deux points de sécurité restent à traiter au niveau de l'hébergement, pas du code : les en-têtes de
sécurité (politique de sécurité du contenu, HSTS) sont servis par l'hébergeur de la sortie statique,
et ne sont pas encore posés.
