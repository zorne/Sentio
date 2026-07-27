# 14 — Recommandations

> À lire si tu travailles sur : n'importe quoi. C'est la liste de contrôle du projet.

Vingt et une recommandations. Les huit premières sont architecturales et les plus coûteuses à
rattraper.

---

## Architecture

**R1. Isolation par entreprise et authentification dès la première migration.**
Jamais différées. Les rebrancher après coup oblige à reprendre chaque lecture, chaque écriture
et chaque abonnement temps réel, et on oublie toujours un chemin.

**R2. Clé d'idempotence sur toute action à effet extérieur, dès le premier envoi.**
Un rejeu ne doit jamais produire deux fois le même effet.

**R3. Journal en ajout seul comme source de vérité.** Les états sont des projections.

**R4. Aucune condition en dur sur la formule.** Uniquement des lectures de quota en base.

**R5. Séparer capacité (contrat stable) et moteur (remplaçable) dès le premier outil**, même
s'il n'y a qu'un seul moteur. C'est l'exigence §21 de la vision et elle ne se rattrape pas.

**R6. Versionner l'ADN dès la v1, et figer chaque employé sur sa version.**

**R7. Les deux contextes existent dès la première migration**, avec l'auteur tracé sur chaque
ligne. Un employé créé sans ADN figé et sans contexte entreprise initialisé ne pourra être ni
audité ni fait évoluer.

**R8. Migrations en étendre → remplir → basculer → retirer.** Déploiement sans interruption.

**R9. Garder l'application indépendante de l'hébergeur.** Aucune interface propriétaire : la
migration d'hébergeur est probable dès le premier client payant.

---

## Produit

**R10. Le métier est choisi par des règles déterministes, jamais par le modèle.**
Le modèle rédige la justification, il ne décide pas. Auditable, et incapable de recommander un
métier qui n'existe pas.

**R11. Un lexique unique de tous les textes visibles + un contrôle automatique** rejetant les
mots interdits. → [`17-lexique.md`](17-lexique.md)

**R12. Aucun chiffre sans ligne en base.** Concevoir l'état vide comme une montée en puissance.

**R13. Une notification « Évolution » exige une évolution enregistrée.**

**R14. Si le diagnostic détecte un besoin hors périmètre, le dire** et proposer une liste
d'attente. Ne jamais vendre un employé qui ne saura pas faire le travail.

**R15. Autonomie par défaut à la vente : `confirmer une fois` sur l'irréversible.**
Le client construit sa confiance en un geste, et peut révoquer à tout moment.

---

## Exploitation

**R16. Compte fournisseur dédié à la production**, distinct du compte personnel. Régénérer
toute clé ayant transité par un chat, un ticket ou une capture.

**R17. Trois enveloppes d'inférence séparées** (clients / vitrine / interne), avec plafonds
durs. Les clients payants ne doivent jamais être privés de service par le trafic de la vitrine.

**R18. Limitation par visiteur et par adresse sur le diagnostic public**, dès sa mise en ligne.

**R19. Surveillance minimale :** quota consommé, runs en échec, taille de base, tâches bloquées
en attente d'accord. Une alerte par email suffit en V1.

**R20. Sauvegarde exportée hors de la plateforme de base, dès le premier client**, même
manuellement. C'est gratuit et ça couvre le seul risque réellement irréversible.

**R21. Jeu de conversations de référence pour le diagnostic**, rejoué à chaque modification de
prompt. Seul garde-fou contre une régression invisible.

---

## Méthode

**R22. Journal de décisions tenu dès le premier jour** ([`adr/`](adr/)), avec **le compromis
assumé** écrit dans chaque entrée. Une décision dont on n'a pas écrit le compromis est une
décision qu'on n'a pas comprise — et qu'on reprendra à l'envers dans six mois.
