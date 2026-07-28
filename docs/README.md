# Documentation Sentio — index

Un fichier = un sujet. Chaque fichier commence par « à lire si tu travailles sur… ».
Tout est en français ; seuls les noms de tables et de modules sont en anglais.

---

> **Tu ne sais pas quoi faire ensuite ?** → [`20-plan-action.md`](20-plan-action.md), le plan ordonné
> de bout en bout jusqu'au premier client payant.

## Ordre de lecture conseillé

**Pour comprendre le produit (15 minutes)**
1. [`00-vision.md`](00-vision.md) — ce que Sentio vend et pourquoi c'est différent
2. [`01-contraintes.md`](01-contraintes.md) — €0, clés partagées, et les conflits que ça crée
3. [`02-architecture.md`](02-architecture.md) — la vue d'ensemble

**Pour implémenter**
4. [`03-modele-de-donnees.md`](03-modele-de-donnees.md) — toutes les tables
5. [`04-contextes-memoire.md`](04-contextes-memoire.md) — ⭐ **la pièce centrale du produit**
6. [`05-runtime-employe.md`](05-runtime-employe.md) — comment un employé travaille réellement
7. [`06-scalabilite.md`](06-scalabilite.md) — les six mécanismes qui évitent la refonte
8. [`07-parcours-produit.md`](07-parcours-produit.md) — de la vitrine au dashboard
9. [`08-evolution-apprentissage.md`](08-evolution-apprentissage.md) — « l'employé évolue seul »
10. [`09-metriques-roi.md`](09-metriques-roi.md) — les chiffres affichés au client

**Avant de mettre en ligne**
11. [`10-securite-rgpd.md`](10-securite-rgpd.md)
12. [`11-exploitation.md`](11-exploitation.md) — où tourne quoi, et quand le €0 casse
    → [`19-fournisseurs-modeles.md`](19-fournisseurs-modeles.md) — quels fournisseurs, quels
    modèles, quels quotas chiffrés **(daté — à re-vérifier)**

**Pour piloter**
13. [`12-roadmap.md`](12-roadmap.md) — les 9 lots de construction
    → [`18-backlog.md`](18-backlog.md) — les 181 tâches axiomes qui les composent
14. [`13-verification.md`](13-verification.md) — critères d'acceptation testables
15. [`14-recommandations.md`](14-recommandations.md)
16. [`15-decisions-ouvertes.md`](15-decisions-ouvertes.md) — décisions restantes (D2, D9 bloquent respectivement les lots 5/6 et 0)
17. [`16-compromis.md`](16-compromis.md) — ce qu'on sacrifie, et pourquoi
18. [`17-lexique.md`](17-lexique.md) — vocabulaire imposé, **source unique** de la liste des mots
    interdits
19. [`20-plan-action.md`](20-plan-action.md) — ⭐ **l'ordre d'exécution de bout en bout**, du premier
    jour au premier client payant : décisions, lots, mise en ligne, vente
20. [`21-concurrence.md`](21-concurrence.md) — pourquoi les concurrents échouent, ce que Sentio
    neutralise déjà, ce qu'il lui manquait **(document interne — daté)**
21. [`22-niche-et-verticalisation.md`](22-niche-et-verticalisation.md) — pourquoi Sentio reste
    généraliste et comment les profils sectoriels portent la spécialisation **(document interne)**
22. [`23-proposition-de-valeur.md`](23-proposition-de-valeur.md) — ⭐ **ce qui crée la valeur**, les
    six promesses et ce qui les prouve
23. [`24-strategie-business.md`](24-strategie-business.md) — positionnement, modèle économique,
    lancement, objectifs **(document interne — contient des prix)**

**Journal des décisions** : [`adr/`](adr/) — une entrée par décision structurante.

---

## Carte mentale rapide

```
   VITRINE PUBLIQUE                     ESPACE PRIVÉ
   ────────────────                     ────────────
   présentation                         dashboard
   démonstration (scriptée)             fiche employé
   diagnostic conversationnel           performances / objectif
   recommandation (1 seule)             notifications
   paiement                             abonnement
        │                                    ▲
        └──── recrutement ───────────────────┘
              (identité unique + ADN figé + contexte entreprise)

   DERRIÈRE
   ────────
   Model Gateway ──► fournisseurs de modèle (routage par classe de données)
   Policy Engine ──► autorise / suspend / refuse chaque action
   Runtime       ──► un run = machine à états persistée, avancée par battements
   Capacités     ──► contrats stables, moteurs remplaçables
   Journal       ──► source de vérité de tout ce qui s'est passé
```

---

## Si tu ne lis qu'une seule chose

[`04-contextes-memoire.md`](04-contextes-memoire.md). C'est l'exigence produit la plus
structurante et la plus facile à casser sans s'en rendre compte.
