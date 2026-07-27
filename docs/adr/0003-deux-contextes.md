# ADR-0003 — Deux contextes de mémoire, ADN immuable

**Date :** 2026-07-27
**Statut :** acceptée
**Exigence directe du fondateur.**

## Contexte

La vision impose deux choses contradictoires en apparence : *« un commercial reste commercial,
toujours »* (§10) et *« les employés évoluent seuls et deviennent plus performants »* (§11).

Un seul espace de mémoire modifiable rendrait la première promesse intenable : l'apprentissage
finirait, un jour, par altérer ce qui définit le métier — sans que personne s'en aperçoive.

## Décision

Deux contextes distincts, tous deux dans Supabase.

**Contexte Général (ADN)** — `employee_definition`, versionné. Métier, rôle, responsabilités,
limites, manière de raisonner, règles, capacités autorisées, comportement, contraintes de
sécurité, personnalité professionnelle. **Commun à toutes les entreprises. Non modifiable par
le client. Non modifiable par l'auto-apprentissage.** Modifiable uniquement par Sentio, par
publication d'une nouvelle version.

**Contexte Entreprise** — `company_profile` + `learned_fact`. Objectifs, informations sur
l'entreprise, produits, services, processus, préférences, documents, KPI, stratégies apprises,
connaissances acquises, améliorations, retours d'expérience, habitudes. **Propre à chaque
entreprise. Modifiable par le client et par l'auto-apprentissage.**

La garantie repose sur **trois verrous** (capacité, écriture, contexte), détaillés dans
[`../04-contextes-memoire.md`](../04-contextes-memoire.md). En particulier : **il n'existe aucun
chemin de code** entre le module d'apprentissage et la table d'ADN.

## Pourquoi

Une consigne de prompt (« tu es commercial, ne fais pas de comptabilité ») ne garantit rien : un
modèle peut être détourné, mal interpréter, ou dériver. La garantie doit être mécanique. Une
absence de code est la seule garantie qu'on ne peut pas contourner par accident.

Le découpage en deux tables côté entreprise est technique : un état stable et court d'un côté,
une accumulation croissante de l'autre. Les mélanger ferait croître le coût de contexte
indéfiniment avec l'ancienneté du client.

## Compromis assumé

Plus de tables, plus de traçabilité à maintenir, et un assemblage de contexte plus complexe
qu'un simple prompt. L'employé ne peut pas s'adapter au-delà de son métier même quand ce serait
manifestement plus utile pour le client — c'est un choix produit explicite (§10 de la vision),
pas une limite technique.

## Quand revisiter

Jamais pour l'immuabilité de l'ADN : c'est le cœur de la promesse produit. Éventuellement pour
le découpage interne du Contexte Entreprise, si l'usage montre une meilleure structure.
