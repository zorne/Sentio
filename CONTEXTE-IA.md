# Contexte compact — carte du projet Sentio pour une IA

Ce fichier est injecté au premier message de chaque agent IA. Il ne répète pas les
invariants ni les règles de travail (déjà présents en permanence dans le prompt des agents) :
il sert à **savoir quoi aller lire**. Les sources font foi : [`AGENTS.md`](AGENTS.md) et
[`docs/README.md`](docs/README.md).

---

## Le produit

Un dirigeant ne choisit jamais un agent : il décrit un objectif chiffré, Sentio diagnostique
l'entreprise, recommande **un seul** employé numérique spécialisé, le recrute, et toute la suite
se déroule dans son espace privé. **Périmètre V1 : un seul métier, Commercial.** Le diagnostic
doit rester honnête si le besoin détecté sort de ce périmètre.

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

## Où lire quoi

Demander un fichier avec `LIRE: chemin/du/fichier.md`. **Ne jamais deviner le contenu d'un
fichier non lu.**

| Sujet | Fichier |
|---|---|
| Vision, ce que Sentio vend | `docs/00-vision.md` |
| €0, clés partagées, conflits induits | `docs/01-contraintes.md` |
| Vue d'ensemble technique | `docs/02-architecture.md` |
| Toutes les tables | `docs/03-modele-de-donnees.md` |
| ⭐ Deux contextes / mémoire — **pièce centrale** | `docs/04-contextes-memoire.md` |
| Comment un employé travaille réellement | `docs/05-runtime-employe.md` |
| Scalabilité — les 6 mécanismes anti-refonte | `docs/06-scalabilite.md` |
| Landing, parcours, frictions, conversion | `docs/07-parcours-produit.md` |
| Auto-apprentissage | `docs/08-evolution-apprentissage.md` |
| Métriques et ROI affichés au client | `docs/09-metriques-roi.md` |
| Sécurité, RGPD | `docs/10-securite-rgpd.md` |
| Hébergement, seuils où le €0 casse | `docs/11-exploitation.md` |
| Roadmap — les 9 lots ordonnés | `docs/12-roadmap.md` |
| Backlog — 163 tâches | `docs/18-backlog.md`, `docs/backlog-v1.csv` |
| ⭐ **Quoi faire ensuite** — plan ordonné jusqu'au premier client | `docs/20-plan-action.md` |
| Critères d'acceptation testables | `docs/13-verification.md` |
| Recommandations | `docs/14-recommandations.md` |
| Décisions ouvertes (D2, D9 bloquantes) | `docs/15-decisions-ouvertes.md` |
| Compromis assumés | `docs/16-compromis.md` |
| Vocabulaire imposé — **source unique** | `docs/17-lexique.md` |
| Fournisseurs d'inférence, modèles, quotas chiffrés | `docs/19-fournisseurs-modeles.md` |
| Vision brute du fondateur (fait foi sur le *quoi*) | `projet.md` |

**Décisions déjà tranchées** — `docs/adr/` : `0001-repartir-de-zero` ·
`0002-monolithe-modulaire` · `0003-deux-contextes` · `0004-run-machine-a-etats` ·
`0005-cles-plateforme-classe-de-donnees` · `0006-capacite-vs-outil` ·
`0008-perimetre-v1-commercial-seul` · `0009-fournisseur-inference-ue`.
Ne pas les rouvrir sans raison explicite.

⚠️ `0007-perimetre-v1-commercial-support` est **remplacée par `0008`** : le fondateur est revenu
sur ce choix le jour même. **Le métier Support ne fait pas partie de la V1.**
