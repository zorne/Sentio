Documentation complète du projet Sentio (Vision V1)

1. Vision
Mission
Sentio n'est pas un SaaS d'intelligence artificielle.
Sentio est un cabinet de recrutement d'employés numériques autonomes.
L'objectif est qu'un dirigeant n'achète jamais une IA.
Il recrute un véritable collaborateur numérique spécialisé qui travaille dans son entreprise afin d'atteindre un objectif précis.
Exemple :
"Je souhaite augmenter mon chiffre d'affaires de 5 000 € par mois."
Sentio analyse alors l'entreprise et crée l'employé numérique le plus pertinent.

2. Philosophie du produit
Le client ne doit jamais avoir l'impression d'utiliser une IA.
Il doit avoir l'impression :
* de recruter un collaborateur
* de suivre ses performances
* de voir son équipe grandir
Le vocabulaire est extrêmement important.
On évite autant que possible :
* IA
* Bot
* Assistant
* Automation
* GPT
On privilégie :
* Employé numérique
* Collaborateur
* Recrutement
* Équipe
* Performance
* Progression

3. Fonctionnement général
Étape 1
Le client arrive sur la landing page.
Il découvre Sentio.
Il comprend immédiatement :
* ce que fait Sentio
* pourquoi c'est différent
* quels résultats il peut obtenir

Étape 2
Le client échange avec l'IA centrale Sentio.
Sentio comprend :
* l'entreprise
* les objectifs
* les blocages
* les priorités

Étape 3
Sentio réalise un diagnostic.
Il identifie :
* le principal frein
* le plus gros levier
* plusieurs profils d'employé numérique pertinents
Le client ne construit jamais un agent seul, dans un catalogue libre.
C'est Sentio qui recommande — plusieurs profils, jamais un seul par défaut.
Le client choisit celui qui lui semble le meilleur parmi les profils recommandés.

Étape 4
Le client achète l'employé choisi parmi les profils recommandés.
Paiement via Stripe.

Étape 5
Le client reçoit immédiatement :
* email de confirmation
* facture
* bouton d'accès à son espace privé

Étape 6
Connexion au Dashboard privé.
Jamais plus le client ne retourne sur la landing page.
Toute son expérience se déroule désormais dans son espace privé.

4. Landing Page
La landing page est uniquement une vitrine.
Elle ne sert jamais à gérer les agents.
Elle contient uniquement :
* présentation de Sentio
* démonstration
* explications
* achat
Rien d'autre.

Contraintes
La landing doit être :
* minimaliste
* élégante
* premium
* professionnelle
* moderne
Pas de surcharge.
Pas de longs textes inutiles.
Chaque section doit apporter une vraie valeur.

Ambiance
Pas un SaaS classique.
Pas une ambiance "IA futuriste".
Plutôt :
* workspace
* bureau
* cabinet
* entreprise haut de gamme

5. Démonstration
La landing doit proposer une vraie démonstration.
Le visiteur voit Sentio :
* analyser un objectif
* réfléchir
* créer un employé numérique
* expliquer pourquoi cet employé est recommandé
La démonstration doit être agréable à regarder.

6. Dashboard
Une fois connecté, le client ne quitte plus son Dashboard.
Le Dashboard contient :
* ses employés
* leurs performances
* leurs fiches
* son abonnement
* ses paiements
* ses notifications
* les recommandations
Toute l'expérience client est ici.

7. Architecture du Dashboard
Le Dashboard doit rester extrêmement simple.
Le client ne veut pas comprendre l'architecture.
Il veut uniquement voir :
* les résultats
* les performances
* les chiffres importants
Jamais :
* la complexité technique
* les modèles IA
* les outils utilisés
* les workflows

8. Les employés numériques
Chaque employé possède :
* un prénom
* une identité
* une fiche employé
Exemples :
* Carter Commercial
* James Support
* Emma Comptabilité
* Leo Marketing
On évite complètement :
"Agent IA Commercial"

9. Les identités
Les identités sont choisies automatiquement par Sentio.
Le client ne choisit jamais.
Une identité ne peut jamais être réutilisée.
Chaque employé est unique.

10. Les rôles
> **Révisé le 2026-08-15** — [`adr/0029`](docs/adr/0029-noyau-lady-configure-dynamiquement.md).
> Le métier n'est plus l'identité de l'employé : c'est une **configuration** du noyau Lady,
> produite par le diagnostic.

Un employé ne change jamais de rôle **de lui-même**.
Toujours.
Un rôle ne change que par un chemin explicite et tracé :
* nouveaux résultats observés
* nouveau diagnostic
* proposition de configuration
* validation par le Policy Engine, selon le niveau d'autonomie
* nouvelle version de configuration, avec sa raison

Ce qui reste absolument interdit :
* qu'une configuration donne un pouvoir refusé par le noyau
* qu'un changement de rôle soit silencieux
* que le client choisisse le rôle dans un catalogue

11. Évolution des employés
Les employés évoluent seuls.
Ils :
* apprennent
* optimisent leurs méthodes
* deviennent plus performants
Ils le font automatiquement.
Sans intervention humaine.
Mais **uniquement dans l'exécution** : mieux faire ce que la configuration leur confie.
Améliorer une méthode de relance est autonome.
Changer de priorité est une décision, pas un apprentissage — elle passe par le diagnostic.

12. Les limites
Chaque employé possède un périmètre.
Exemple :
Un commercial :
✅ prospecte
✅ améliore le taux de conversion
✅ suit les prospects
Mais ne fait jamais :
❌ publicité
❌ comptabilité
❌ support
Si une nouvelle compétence est nécessaire :
Sentio recommande un nouvel employé.

13. Les nouveaux employés
Un nouvel employé n'est jamais proposé à l'avance.
Le client ne voit jamais :
* les futurs agents
* les agents verrouillés
* les agents disponibles
Sentio recommande un nouvel employé uniquement lorsqu'il détecte un nouveau levier.

14. Pourquoi proposer un nouvel employé
Jamais pour vendre.
Toujours parce qu'un nouveau blocage est détecté.
Exemple :
"Carter atteint aujourd'hui les limites de son périmètre.
Le principal frein est désormais la gestion des demandes clients.
Je recommande la création d'un employé Support."

15. Collaboration entre employés
Si le client possède plusieurs employés :
Ils collaborent automatiquement.
Exemple :
Carter qualifie un prospect.
↓
James répond aux objections.
↓
Emma prépare les documents.
↓
La vente est conclue.

Le client peut consulter cette collaboration.
Mais uniquement de manière simple.

16. Fiche employé
Chaque employé possède :
* mission
* objectif
* performances
* progression
* compétences
* résultats
Uniquement des informations utiles.

17. Notifications
Deux types.
Travail
Exemple :
"Carter a signé trois nouveaux prospects."

Évolution
Exemple :
"Carter a amélioré sa stratégie commerciale."

Recrutement
Exemple :
"Bienvenue.
Carter rejoint officiellement votre entreprise."

18. Guide de première connexion
Lors de la première visite :
Le client voit un onboarding élégant.
Petites bulles.
Explications simples.
Jamais plus affichées ensuite.

19. Objectif des employés
Le succès est mesuré uniquement par rapport à l'objectif du client.
Exemple :
Objectif :
+5 000 €/mois
Le Dashboard affiche :
Progression vers l'objectif.
Jamais des métriques techniques.

20. Les métriques
Afficher uniquement :
* chiffre d'affaires généré
* temps économisé
* taux de conversion
* progression
* ROI
* objectifs atteints
Pas de jargon technique.

21. Architecture technique
L'architecture doit être entièrement modulaire.
Les employés utilisent des capacités, pas des outils.
Exemple :
Capacité :
Trouver des prospects
Aujourd'hui :
outil gratuit
Demain :
outil premium
L'employé ne change jamais.
On remplace simplement le moteur derrière.

22. Évolutivité
Le système doit être conçu pour évoluer facilement.
Objectif :
Ajouter :
* nouveaux modèles IA
* nouvelles APIs
* nouveaux outils
* nouvelles capacités
Sans modifier les employés existants.

23. Versionning
Les améliorations ne doivent jamais casser les agents déjà vendus.
Une mise à jour :
* est testée
* est déployée
* conserve les données
* conserve les performances
Maximum quelques heures de maintenance.
Puis retour à la normale.

Oui. Je modifierais complètement les sections 24, 25, 26, 28 et la Roadmap.
Je remplacerais par ceci :

24. Les abonnements
Sentio fonctionne avec 3 abonnements fixes.
Chaque abonnement donne accès au même concept : recruter des employés numériques personnalisés.
La différence ne réside pas dans les employés, mais dans les ressources mises à disposition de l'entreprise.
Sentio Start
Destiné aux petites entreprises qui commencent leur transformation.
Comprend :
* Création d'employés numériques personnalisés
* Dashboard Sentio
* Évolution automatique des employés
* Notifications
* Support standard
* Quotas de base

Sentio Growth
Destiné aux entreprises en pleine croissance.
Comprend :
* Toutes les fonctionnalités de Start
* Quotas plus élevés
* Plus de ressources disponibles
* Plus d'intégrations
* Performances supérieures
* Priorité d'exécution

Sentio Scale
Destiné aux entreprises ayant des besoins importants.
Comprend :
* Toutes les fonctionnalités de Growth
* Quotas maximum
* Priorité maximale
* Toutes les intégrations disponibles
* Support prioritaire
* Accès anticipé aux nouvelles fonctionnalités

Principe fondamental
Les abonnements ne modifient jamais le métier d'un employé numérique.
Un commercial reste un commercial.
Un support reste un support.
L'abonnement améliore uniquement l'environnement dans lequel ils travaillent :
* quotas
* ressources
* performances
* intégrations
* puissance disponible
Jamais leur rôle.

25. Upgrade d'abonnement
Lorsqu'un client change d'abonnement :
* aucune donnée n'est perdue
* aucun employé n'est recréé
* aucune mémoire n'est supprimée
* aucune identité ne change
Les employés continuent simplement à fonctionner avec davantage de ressources.
L'amélioration est automatique et transparente.

26. Politique tarifaire
Chaque abonnement possède un prix fixe.
Le client ne paie jamais un supplément pour chaque employé numérique.
Tous les employés créés par Sentio sont inclus dans l'abonnement choisi.
Les différences entre les abonnements concernent uniquement :
* les quotas
* les capacités disponibles
* les performances
* les ressources
* les limites d'utilisation
Le tarif est totalement indépendant :
* des modèles IA utilisés
* des APIs
* des outils internes
* de l'infrastructure technique
Le client paie uniquement pour le niveau de service offert par Sentio.

28. V1
La V1 doit rester volontairement simple.
Même si l'architecture est prévue pour trois abonnements, un seul abonnement (Sentio Start) sera commercialisé au lancement.
L'application devra néanmoins être développée dès le départ pour supporter :
* Sentio Start
* Sentio Growth
* Sentio Scale
Ainsi, l'ajout des deux autres offres ne nécessitera aucune refonte de l'architecture.
L'ensemble du système devra être piloté par des quotas et des paramètres configurables afin de permettre une évolution rapide.

Roadmap recommandée
Phase 1 — MVP
* Landing page premium.
* IA Sentio qui réalise le diagnostic.
* Création d'un employé numérique personnalisé.
* Paiement Stripe.
* Dashboard privé.
* Fiche employé.
* Suivi des performances.
* Onboarding.
* Notifications.
* Mise en production de Sentio Start.

Phase 2
* Activation de Sentio Growth.
* Collaboration entre plusieurs employés.
* Recommandations automatiques de nouveaux recrutements.
* Historique des interactions entre employés.
* Gestion avancée des performances.

Phase 3
* Activation de Sentio Scale.
* Capacités premium.
* Architecture modulaire complète.
* Optimisations automatiques de l'infrastructure.
* Écosystème complet d'employés numériques.

Je te fais une dernière recommandation
Je ne mettrais aucun chiffre (prix) dans cette documentation. À la place, je garderais simplement Start, Growth et Scaleavec leurs caractéristiques.
Les prix pourront évoluer au fil du temps sans que tu aies à modifier toute la documentation de ton projet. C'est beaucoup plus propre pour une documentation technique et produit.
