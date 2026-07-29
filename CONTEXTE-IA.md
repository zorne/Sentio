# Contexte compact — carte du projet Sentio pour une IA

Ce fichier est injecté au premier message de chaque agent IA. Il ne répète pas les
invariants ni les règles de travail (déjà présents en permanence dans le prompt des agents) :
il sert à **savoir quoi aller lire**. Les sources font foi : [`AGENTS.md`](AGENTS.md) et
[`docs/README.md`](docs/README.md).

---

## Le produit

Un dirigeant ne choisit jamais un agent : il décrit un objectif chiffré, Sentio diagnostique
l'entreprise, propose **un seul** employé numérique spécialisé et le **calibre** sur la situation
du client, le recrute, et toute la suite se déroule dans son espace privé.
**Périmètre V1 : un seul métier, Commercial.** Sentio n'a pas de niche : il prend tous les secteurs
et adapte l'employé à celui du client (`adr/0011`). Le diagnostic doit rester honnête si le besoin
détecté sort de ce périmètre.

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
| ⭐ **Les six priorités qui tranchent tout arbitrage** | `docs/adr/0019-priorites-ingenierie.md` |
| ⭐ **Ce qui est vérifiable l'est automatiquement** — `pnpm run verify` | `docs/adr/0024-verification-automatique.md` |
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
| ⭐ **Conformité légale** — RGPD, prospection, AI Act, ce qui bloque quoi | `docs/25-conformite-legale.md` |
| Registre des traitements (art. 30) | `docs/26-registre-traitements.md` |
| Hébergement, seuils où le €0 casse | `docs/11-exploitation.md` |
| Roadmap — les 9 lots ordonnés | `docs/12-roadmap.md` |
| Backlog — 181 tâches | `docs/18-backlog.md`, `docs/backlog-v1.csv` |
| ⭐ **Quoi faire ensuite** — plan ordonné jusqu'au premier client | `docs/20-plan-action.md` |
| Critères d'acceptation testables | `docs/13-verification.md` |
| Recommandations | `docs/14-recommandations.md` |
| Décisions ouvertes (D2 bloquante) | `docs/15-decisions-ouvertes.md` |
| Compromis assumés | `docs/16-compromis.md` |
| Vocabulaire imposé — **source unique** | `docs/17-lexique.md` |
| Fournisseurs d'inférence, modèles, quotas chiffrés | `docs/19-fournisseurs-modeles.md` |
| Concurrence, leurs échecs, délivrabilité, repères de performance | `docs/21-concurrence.md` |
| Niche, vertical vs horizontal, profils sectoriels | `docs/22-niche-et-verticalisation.md` |
| ⭐ **Ce qui crée la valeur** — les six promesses et leurs preuves | `docs/23-proposition-de-valeur.md` |
| Stratégie business — positionnement, lancement, objectifs | `docs/24-strategie-business.md` |
| Vision brute du fondateur (fait foi sur le *quoi*) | `projet.md` |

**Décisions déjà tranchées** — `docs/adr/` : `0001-repartir-de-zero` ·
`0002-monolithe-modulaire` · `0003-deux-contextes` · `0004-run-machine-a-etats` ·
`0005-cles-plateforme-classe-de-donnees` · `0006-capacite-vs-outil` ·
`0008-perimetre-v1-commercial-seul` · `0009-fournisseur-inference-ue` ·
`0010-diagnostic-calibrage` · `0011-generaliste-profils-sectoriels` ·
`0012-retention-journal-30-jours` · `0013-acces-donnees-portee-entreprise` ·
`0014-etancheite-entre-entreprises` · `0015-transparence-ai-act` ·
`0016-source-des-prospects` · `0017-domaine-du-client-et-reputation` ·
`0018-service-expedition-resend` · ⭐ `0019-priorites-ingenierie` ·
`0020-ordre-des-lots-produit-complet` · `0021-execution-serveur-en-ue` ·
`0022-interface-sveltekit` ·
`0023-code-partage-vers-les-fonctions` · ⭐ `0024-verification-automatique`.
Ne pas les rouvrir sans raison explicite.

⚠️ `0007-perimetre-v1-commercial-support` est **remplacée par `0008`** : le fondateur est revenu
sur ce choix le jour même. **Le métier Support ne fait pas partie de la V1.**
