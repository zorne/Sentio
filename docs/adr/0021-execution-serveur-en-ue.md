# ADR-0021 — Le serveur s'exécute en UE, chez Supabase, et reste remplaçable (D12 tranchée)

**Date :** 2026-07-29
**Statut :** acceptée

## Contexte

Le choix de l'hébergement de l'interface était posé comme une question de coût — quelle offre
gratuite autorise l'usage commercial. L'instruction du lot 4 l'a déplacé : **le diagnostic
manipule des données personnelles réelles dès la première question**
([`../07-parcours-produit.md`](../07-parcours-produit.md)). La vraie question n'est donc pas
« quel hébergeur est gratuit », mais **où le code serveur s'exécute**.

Or les offres gratuites les plus généreuses reposent sur des runtimes « edge » mondiaux : le code
s'exécute au plus près du visiteur, donc **hors d'UE dès que le visiteur l'est**, et la
localisation devient une option payante. Pour un projet dont la contrainte européenne est dure
([`0009`](0009-fournisseur-inference-ue.md)), c'est disqualifiant — la priorité 2 passe avant la
priorité 6 ([`0019`](0019-priorites-ingenierie.md)).

## Décision

**Tout code serveur touchant une donnée personnelle s'exécute dans les fonctions Supabase, en
région UE — le même projet, la même région que la base.** La partie purement statique est servie
séparément et ne porte aucune donnée.

Quatre règles en découlent, et elles sont la condition de la décision :

1. **Séparation stricte statique / données personnelles.** La vitrine est prérendue : pages,
   textes, tarifs, démonstration scriptée — aucun traitement, aucune donnée. Tout ce qui lit ou
   écrit une donnée personnelle passe par une fonction serveur, en UE. Ce sont deux zones, pas
   deux dossiers.
2. **Aucune logique métier dans les fonctions.** Une fonction valide l'entrée, appelle le domaine
   (`packages/domain`, `packages/core`, `packages/capabilities`), et rend une réponse. Elle est un
   **adaptateur d'entrée**, exactement comme `apps/worker` est un adaptateur de sortie. C'est ce
   qui rend l'hébergement remplaçable : migrer, c'est réécrire des adaptateurs, jamais le cœur.
3. **La base reste derrière son port.** `packages/db` expose `SqlClient` ; le pilote Postgres
   utilisé côté Node n'est pas celui qui tournera côté Deno. Le port existe déjà, l'adaptateur
   se double — le domaine n'en saura rien.
4. **Chemin de sortie écrit d'avance.** Le jour où l'on part vers un hébergeur européen classique
   (Clever Cloud, Scaleway), le travail consiste à porter les fonctions en routes serveur du
   cadre applicatif et à changer d'adaptateur. Aucun fichier de `packages/` ne doit avoir à
   bouger. Si un jour ce n'est plus vrai, c'est que la règle 2 a été enfreinte quelque part.

## Pourquoi

Parce que les données et leur traitement au même endroit, c'est un transfert de moins à encadrer,
un contrat de sous-traitance de moins à signer, et une ligne de registre de moins à défendre. Le
projet en a déjà un à documenter avec le service d'expédition
([`0018`](0018-service-expedition-resend.md)) ; en ajouter un deuxième pour économiser quelques
euros serait un mauvais échange.

Parce qu'un fournisseur de moins, c'est aussi une panne de moins, une facture de moins et une
console de moins à surveiller — pour une personne seule, ça compte plus que la puissance brute.

Et parce que le €0 est conservé sans en faire le critère : il tombe du choix, il ne le commande
pas.

## Compromis assumé

**1. Le runtime est Deno, pas Node — et ce n'est pas un détail.** Il impose de vérifier chaque
dépendance, interdit certaines bibliothèques Node, et oblige à un second adaptateur de base de
données. C'est le coût direct de cette décision.

**2. Les fonctions ont des limites que le produit devra respecter :** durée d'exécution bornée,
mémoire limitée, démarrage à froid, pas de processus qui vit entre deux requêtes. L'architecture y
survit — un run est déjà « un pas borné de quelques secondes, puis on rend la main »
([`0004`](0004-run-machine-a-etats.md)) — mais **tout traitement long devra être découpé**, et
c'est une contrainte permanente, pas un réglage. Trois cas à surveiller de près, et à signaler dès
qu'ils se présentent : un diagnostic dont un tour dépasserait la durée autorisée, un import de
liste volumineux, et le battement du lot 3 s'il tentait de traiter plusieurs runs d'affilée.

**3. Le rendu serveur est perdu sur la vitrine.** Elle est prérendue, donc excellente pour le
référencement, mais toute page réellement dynamique et publique devra être repensée — ou attendre
la migration.

**4. On dépend un peu plus d'un fournisseur unique.** Supabase porte déjà la base,
l'authentification et le temps réel ; il portera l'exécution. La règle 2 est ce qui empêche cette
dépendance de devenir un enfermement — elle doit être défendue à chaque revue, pas seulement
écrite ici.

## Quand revisiter

- **Dès qu'une limite de fonction est atteinte** — durée, mémoire, taille de paquet, connexion
  longue. À signaler immédiatement, pas à contourner : un contournement discret est précisément la
  dette qu'on refuse.
- **Au premier client payant**, quand l'indisponibilité devient une promesse implicite.
- **Si une page publique doit devenir dynamique** (contenu personnalisé, référencement d'un
  contenu généré).
