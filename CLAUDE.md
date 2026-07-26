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
Décision utilisateur : garder l'approche remote/GitHub (déployée sur Vercel).
`main` reset sur `origin/main` (ancien commit local sauvegardé dans la branche
`backup/onboarding-reveal-local`). `/agent` a ensuite reçu Tester/Recruter
(voir section suivante).

## Refonte /onboarding — hologramme + compétences (26/07/2026)
`/onboarding` est maintenant la page "vitrine" : hologramme central
(`AgentHologram3D.tsx`, silhouette en anneaux + balayage + socle émetteur +
étoiles en orbite ; lumière volontairement stable, pas de scintillement, pas
de rotation pilotée par le client), des cartes de compétences autour
(`AgentSkillCards.tsx`) qui s'allument selon ce que le visiteur tape dans le
chat, et le chat d'onboarding repositionné en petit sur le côté (jamais plus
gros que l'hologramme).
- `lib/agent-skills.ts` : règles front-end pures (mots-clés → compétences),
  volontairement découplées du chat — ajouter une compétence n'y touche pas.
- `OnboardingChat.tsx` : n'a plus de logique de redirection ; émet
  `onUserMessage(text)` et `onComplete(tenantId, agentInstanceId)`, c'est la
  page parente qui décide quoi en faire.
- `AgentActions.tsx` (nouveau, `components/`) : boutons Tester/Recruter +
  `launchSalesRun`, extrait pour être partagé entre `/onboarding` (une fois
  l'agent créé) et `/agent` (lien direct/aperçu depuis la landing, inchangé).
- Pas de nouvelle route : les 3 CTA "Recruter mon employé" de la landing
  pointent déjà vers `/onboarding`, rien à changer côté liens.
Non commité.

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
1. Commit + push de la refonte /onboarding (hologramme + compétences)
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
