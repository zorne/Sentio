# ADR-0022 — SvelteKit, en sortie statique aujourd'hui, en sortie Node le jour de la migration

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Le cadre applicatif de l'interface était laissé ouvert depuis le premier jour, parce qu'il dépend
de l'hébergement ([`../../apps/web/README.md`](../../apps/web/README.md)). L'hébergement étant
tranché ([`0021`](0021-execution-serveur-en-ue.md)), le cadre peut l'être.

Le fondateur retient **SvelteKit avec l'adaptateur Node**, pour sa portabilité : même code vers un
serveur Node, du statique, ou une autre plateforme, sans réécriture ni dépendance à une
fonctionnalité propriétaire.

## ⚠️ La limitation, signalée avant d'écrire une ligne

**L'adaptateur Node et les fonctions Supabase ne peuvent pas coexister aujourd'hui.** Les fonctions
s'exécutent sous Deno ; l'adaptateur Node produit un serveur Node. Choisir les deux, c'est choisir
deux hébergements.

Trois issues existaient. Faire tourner SvelteKit **dans** une fonction via un adaptateur Deno
communautaire : fragile, mal supporté, et il ferait passer chaque page par un démarrage à froid —
écarté. Prendre un hébergeur Node dès maintenant : c'est revenir sur [`0021`](0021-execution-serveur-en-ue.md)
et sur la résidence des données — écarté. Reste la troisième, retenue ici.

## Décision

**SvelteKit, avec l'adaptateur statique aujourd'hui, et l'adaptateur Node comme cible de
migration.** L'intention du fondateur — portabilité, aucune dépendance propriétaire, migration
sans réécriture — est tenue ; c'est la sortie du build qui change, pas le code.

Concrètement :

- la **vitrine** est prérendue : aucune donnée, aucun secret, hébergeable n'importe où ;
- l'**espace privé** est une application qui s'exécute dans le navigateur et parle à des fonctions
  serveur en UE ;
- **le jour de la migration** vers un hébergeur européen classique : on change d'adaptateur, et
  les fonctions deviennent des routes serveur. Le changement est borné à deux endroits nommés
  d'avance.

### Les règles d'architecture de l'interface

Elles sont posées maintenant, parce qu'elles ne se rattrapent pas une fois cinquante composants
écrits.

1. **Séparation stricte présentation / logique métier / infrastructure.** Un composant affiche ;
   il ne décide pas.
2. **Aucun accès direct aux données depuis un composant.** Pas d'appel de base, pas de requête
   brute, pas de client Supabase dans un fichier d'interface. L'interface parle à une fonction
   serveur, jamais à une table.
3. **Toute la logique métier reste dans `packages/domain`, `packages/core` ou un service
   applicatif.** Une règle écrite dans un composant est une règle qui ne sera jamais testée.
4. **Validation systématique côté serveur**, même quand elle existe côté client. Celle du
   navigateur est un confort ; celle du serveur est la seule qui protège
   ([`0019`](0019-priorites-ingenierie.md), priorité 1).
5. **Aucun secret, aucune clé, aucune logique sensible dans le code envoyé au navigateur.** Tout
   ce qui est livré au client est public par construction, quel que soit le soin apporté à le
   cacher.
6. **L'interface évolue sans toucher au cœur.** Si une modification d'affichage impose de modifier
   `packages/domain`, c'est le signe qu'une règle a fui vers la présentation.

## Pourquoi

Parce que SvelteKit est le cadre où la sortie du build est un **paramètre**, pas une réécriture :
c'est exactement la propriété qu'il faut à un projet qui sait déjà qu'il migrera. Et parce que le
produit n'a pas besoin de rendu serveur : une vitrine prérendue est plus rapide et mieux référencée
qu'une vitrine rendue à la demande, et un espace privé n'a aucun intérêt à être référencé.

Les six règles ci-dessus ne sont pas des préférences de style : ce sont les priorités 1, 3 et 6
appliquées à l'endroit où elles se perdent le plus vite. Une interface est le lieu où la logique
métier se disperse — un test ici, une condition là — jusqu'à ce que plus personne ne sache où une
règle est écrite.

## Compromis assumé

**1. Pas de rendu serveur, donc pas de page publique personnalisée.** Assumé : la vitrine n'en a
pas besoin. Le jour où elle en aurait besoin, c'est la migration qui répond, pas un contournement.

**2. Deux endroits à porter le jour de la migration** — l'adaptateur et les fonctions. C'est le
prix de la résidence des données en UE aujourd'hui, et il est borné.

**3. SvelteKit est moins répandu que l'alternative dominante.** Moins de réponses toutes faites
quand on cherche seul à deux heures du matin. Compensé par un cadre plus petit, donc plus facile à
tenir entièrement en tête.

**4. Une règle métier écrite par erreur dans un composant ne sera pas détectée par un test** —
c'est le risque de la règle 3, et il est humain, pas technique. La parade est la revue, et le fait
que le domaine soit déjà testé sans interface.

> **Mise à jour du 2026-07-30** — la revue n'est plus la seule parade. Un contrôle automatique tient
> ce qui est mécaniquement décidable : aucun accès aux données depuis un composant, un seul endroit
> où `fetch` est permis, aucun code du domaine embarqué dans le navigateur, aucun texte visible hors
> du fichier de libellés ([`0024`](0024-verification-automatique.md)). Ce qui reste au jugement
> humain : une règle métier écrite en toutes lettres, sans texte visible ni appel réseau.

## Quand revisiter

- **Si SvelteKit bloque un besoin réel de Sentio** — à signaler immédiatement, pour décider avant
  que le contournement devienne la dette.
- **Le jour de la migration vers un hébergeur Node européen** : l'adaptateur change, et cette
  entrée se met à jour plutôt que d'être remplacée.
- **Si l'espace privé devait fonctionner hors ligne ou en temps réel intensif**, ce que
  l'architecture actuelle ne vise pas.
