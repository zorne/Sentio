# SENTIA — État du projet (dernière session : 26/07/2026)

## Projet
SaaS d'employés numériques (agents IA autonomes). Renommé "Employés IA" →
**SENTIA** en cours de route (code + UI). Monorepo `employes-ia`, TS partout.
Fondateur solo, budget €0, mode caveman actif (réponses terses demandées).

## Stack
- `packages/core` — noyau : ModelGateway (Gemini+Groq interchangeables, BYOK),
  Tool Registry, Policy Engine (autonomie réglable), Memory, Advisor (conseiller IA)
- `apps/web` — Next.js 15 App Router : landing (`/`), dashboard (`/dashboard`),
  onboarding (`/onboarding`), pages légales (`/legal/*`)
- Supabase (Postgres+RLS+Auth, EU), Vercel (déploiement, prod OK)
- Groq = conseiller IA public landing (dataClass="test" only, jamais de vraies
  données). Gemini = agents clients réels (no-train EEA).

## Conflit git résolu (26/07/2026)
Décision utilisateur : garder l'approche remote/GitHub (déployée sur Vercel),
pas la version locale. `main` reset sur `origin/main` (ancien commit local
`cfe2f70` sauvegardé dans la branche `backup/onboarding-reveal-local`, pas
supprimé). Le remote ne posait que "Parler à / Retour à l'équipe" sur `/agent`
— pas de Recruter/Tester. Ajouté par-dessus :
- `onboarding-actions.ts` : `onboardingChat` retourne aussi `agentInstanceId`
- `OnboardingChat.tsx` : redirige vers `/agent?tenant=&agent=&role=&name=`
- `app/agent/page.tsx` : si `tenant`+`agent` présents (sortie d'onboarding) →
  boutons **Tester maintenant** (`launchSalesRun` → `/tasks/[id]`) et
  **Recruter** (→ `/dashboard`). Sinon (lien vitrine direct depuis la landing,
  sans tenant réel) → fallback sur les boutons d'origine "Parler à/Retour".
Non commité — à valider avant `git add`/commit/push.

## Décisions validées (ADR dans `docs/DECISIONS.md`, 19 entrées)
- Monolithe modulaire, pas microservices (ADR-002)
- BYOK mais fallback Gemini/Groq configuré en dur pour démo (ADR-005/016)
- Auth différée — pas de login actif, tenant démo en dur (ADR-018)
- Agent d'accueil = conversation simple, pas AgentRuntime complet (ADR-019)
- SUPABASE_DB_URL sur Vercel = **Transaction pooler (port 6543)**, jamais
  connexion directe (5432) → ENOTFOUND sinon (IPv6 non supporté Vercel)

## Architecture landing (`apps/web/src/app/page.tsx`)
4 actes : Hero(#hero) → Mission(#mission, scroll=temps) → Threshold(#seuil,
interactif) → Conseiller(#conseiller) → Métiers → Tarifs → Fin. Noyau 3D
(`Core3D.tsx`, react-three-fiber) réutilisé partout. ScrollNav = navigation
latérale par points. Design : sérif éditorial (voix humaine) + mono (voix
machine), accent mint unique.

## Migrations DB appliquées (Supabase SQL Editor, manuel)
0001 à 0009 appliquées. 0009 = table `rgpd_request`. Prochaine migration à
créer : appliquer aussi manuellement (pas de CI auto).

## Pages légales faites
`/legal/{confidentialite,cgu,mentions,cookies,rgpd}` — contenu réaliste mais
mentions légales = **placeholders** (pas d'entreprise immatriculée). CGU à
faire relire par juriste avant clients réels. Registre RGPD art.30 dans
`docs/RGPD-REGISTRE.md`.

## À faire (priorité)
1. Commit + push du fix Recruter/Tester sur `/agent` (voir section conflit git)
2. Immatriculer l'entreprise → remplacer placeholders mentions légales
3. Signer DPA avec Supabase/Vercel/Google/Groq
4. AIPD (analyse d'impact RGPD) — obligatoire, traitement décisionnel auto

## Skill installé
`~/.claude/skills/runtime-optimizer` — mémoire projet compacte, extraction
gros collages, raisonnement multi-expert. Utiliser en début de session.

## Style de travail utilisateur
Mode caveman actif (réponses courtes). Fondateur non-technique par endroits,
demande souvent clarification avant d'agir. Budget tokens serré — éviter
relecture inutile d'historique, préférer vérifier le code directement.
