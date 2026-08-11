# ADR-0028 — L'exécutant s'exécute en fonction serveur ; ce qui le contraint n'est pas l'hébergeur, c'est le débit du modèle

**Date :** 2026-08-07
**Statut :** accepté
**Prolonge :** [`0004`](0004-run-machine-a-etats.md), [`0021`](0021-execution-serveur-en-ue.md), [`0023`](0023-code-partage-vers-les-fonctions.md)
**Tranche :** `D16` de [`../15-decisions-ouvertes.md`](../15-decisions-ouvertes.md)

## Contexte

`EXEC-18` a produit une racine de composition complète : `apps/worker` lit son environnement, le
valide, monte les adaptateurs et sert un battement signé. Elle a aussi révélé une contradiction
que personne n'avait vue : [`0021`](0021-execution-serveur-en-ue.md) place tout code serveur
touchant une donnée personnelle **dans les fonctions Supabase, sous Deno**, alors que le worker est
du Node — pilote `pg`, et un contrôle de frontières qui interdit à une fonction d'importer autre
chose que le domaine et la configuration.

`0021` avait anticipé la moitié du problème (règle 3 : « le pilote Postgres utilisé côté Node n'est
pas celui qui tournera côté Deno ; le port existe déjà, l'adaptateur se double ») sans dire qui
l'écrirait, ni si la durée d'un battement tiendrait dans une fonction — un risque que la même ADR
signale pourtant nommément : « le battement du lot 3 s'il tentait de traiter plusieurs runs
d'affilée ».

## Décision

**L'exécutant s'exécute en fonction serveur Supabase, sous Deno**, comme le reste du code serveur.
Le fondateur a posé la condition de mesurer d'abord ; la mesure est faite et la condition est
levée.

**Ce que la mesure a établi**, sur un Postgres réel et les données de test du dépôt :

| | |
|---|---|
| battement à vide | 28 ms |
| approvisionnement de 10 missions | 33 ms |
| 10 pas complets, modèle instantané | 79 ms (≈ 8 ms par pas) |
| connexion Postgres depuis Deno | 2 à 13 ms |
| prise de travail (`for update skip locked`) depuis Deno | 1 à 17 ms |

**Et ce qu'elle a montré d'autre, qui commande la décision :** notre code ne pèse rien. Ce qui
remplit un battement, c'est le **lissage de débit que le Model Gateway s'impose lui-même** pour ne
pas dépasser le quota du fournisseur — 2 requêtes par minute, donc **30 secondes entre deux appels
de modèle**. Dix pas dans une même invocation : **4 min 30 d'attente pure**.

**Règle qui en découle, et qui est le vrai contenu de cette décision :** un battement est borné à
**un petit nombre d'appels de modèle par invocation**, et le planificateur bat plus souvent. La
contrainte ne vient pas de l'hébergeur — un service Node aurait exactement la même — elle vient du
fournisseur d'inférence.

**Un prototype vérifié, non déployé** (`supabase/functions/battement/`, `enabled = false`) établit
que la voie fonctionne : la signature écrite côté Node se vérifie sous Deno **sans recopie de
code**, le port `SqlClient` s'implémente sous Deno, et la requête d'`EXEC-12` s'exécute au mot près.

**Deux ajustements que cette décision rend nécessaires :**

1. La vérification de signature descend dans `packages/domain` — deux runtimes doivent la partager,
   et une fonction ne peut importer que le domaine. Le code partagé descend, il ne se recopie pas
   ([`0023`](0023-code-partage-vers-les-fonctions.md)).
2. Le contrôle de frontières reçoit une **dérogation nommée**, pour la fonction `battement` et pour
   le seul pilote Postgres. L'exécutant est un adaptateur de **sortie**, pas d'entrée ; la règle
   générale reste entière pour toutes les autres fonctions.

## Pourquoi

Parce que la seule inconnue réelle était la durée, et qu'elle est mesurée plutôt que supposée. Le
chiffre décisif n'est pas celui qu'on cherchait : il ne dit pas « Deno est assez rapide », il dit
« la vitesse d'exécution n'était pas le sujet ». Un battement borné à un appel tient dans
n'importe quelle limite ; un battement qui en enchaîne dix ne tient dans aucune. C'est un réglage,
pas une architecture — et le runtime était construit pour ça depuis
[`0004`](0004-run-machine-a-etats.md) : « un pas borné de quelques secondes, puis on rend la main ».

Parce que rester sur les fonctions Supabase ne change ni `0021`, ni le registre des traitements, ni
le nombre de sous-traitants — un service Node en UE aurait ajouté un hébergeur à documenter pour un
gain nul sur le problème réel.

Et parce que la compatibilité qui aurait pu tout arrêter — la signature — est **vérifiée**, pas
espérée : un en-tête signé côté Node est accepté côté Deno, et la frontière de sécurité tient sous
les deux runtimes (vérifié en la neutralisant : deux tests passent au rouge).

## Compromis assumé

- **Deux exécutants coexistent pendant la transition.** Le worker Node reste la référence testée
  tant que la fonction Deno n'exécute pas de pas réel. C'est du code en double, assumé le temps de
  la bascule — et le prototype ne travaille pas : il prend un verrou et le repose aussitôt.
- **Le prototype n'a ni pool, ni délai maximal, ni reconnexion.** Il ouvre une connexion, sert une
  invocation, referme. C'est suffisant pour une fonction serveur, insuffisant pour tout le reste.
- **La dérogation de frontière est une entaille dans une règle nette.** Elle est nommée par
  fonction et par module pour qu'elle ne s'élargisse pas en silence : une seconde fonction qui
  importerait un pilote serait refusée, et il faudrait revenir en discuter.
- **Le débit du fournisseur devient une contrainte de conception visible.** Elle l'était déjà, mais
  cachée dans le Gateway. Elle remonte maintenant au niveau du planificateur : « combien de
  battements par jour » n'est plus seulement un choix produit, c'est aussi une conséquence du
  quota d'inférence.
- **La mesure vient d'un Postgres local**, pas du projet Supabase distant. La latence réseau réelle
  s'y ajoutera. Elle ne change pas l'ordre de grandeur — 30 secondes d'attente de lissage dominent
  toute latence de requête — mais le chiffre exact sera plus haut.

## Quand revisiter

- Le fournisseur d'inférence passe à une offre payante au débit plus large → le lissage cesse de
  dominer, et le nombre de pas par invocation peut remonter. C'est le premier levier à réévaluer.
- Un battement réel dépasse la durée autorisée par l'hébergeur malgré la borne d'appels → la borne
  est mal réglée, ou une requête a dérivé ; la mesure de `mesure-du-battement.integration.test.ts`
  doit le montrer avant l'hébergeur.
- Une deuxième fonction a besoin d'un pilote de base → la dérogation nommée ne suffit plus, et
  c'est le signal que la frontière « fonction = adaptateur d'entrée » ne décrit plus le système.
