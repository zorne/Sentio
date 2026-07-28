# apps/web

Interface : vitrine publique + espace privé, **deux zones étanches** (groupes de routes,
politiques d'accès et budgets d'inférence distincts — `docs/02-architecture.md`).

**Non initialisée volontairement.** Le choix du cadre applicatif est structurant et dépend de
**D12** (hébergeur, non tranchée — `docs/15-decisions-ouvertes.md`), avec une contrainte ferme :
rester **indépendant de l'hébergeur**, aucune interface propriétaire, car une migration est
probable dès le premier client payant.

Ce dossier est rempli au **lot 4 — Acquisition**. Les lots 0 à 3 n'ont besoin d'aucune interface.
