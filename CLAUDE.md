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

## Historique récent (tout commité/poussé sauf mention contraire)
- Conflit git remote/local résolu : gardé l'approche GitHub/Vercel (backup de
  l'ancien commit local dans la branche `backup/onboarding-reveal-local`).
- `/onboarding` = page vitrine : hologramme buste filaire central
  (`AgentHologram3D.tsx`, maillage triangulé tête/cou/épaules, lumière stable
  sans scintillement, pas de rotation pilotée par le client), cartes de
  compétences autour (`AgentSkillCards.tsx`) qui s'allument selon le texte
  tapé, chat repositionné en petit sur le côté (jamais plus gros que
  l'hologramme). Transition en fondu sur tous les CTA "Recruter"
  (`RecruitLink.tsx`).
- Sélecteur de métier : 5 rôles cliquables sous "Un seul moteur..." sur la
  landing → `/onboarding?agent=<slug>` (`lib/agent-roles.ts` centralise texte
  de chat + compétences par métier). Seul **Commercial** a un vrai backend
  (`OnboardingChat.tsx`, Gemini, tenant réel). Les 4 autres passent par
  `RoleAwaitingChat.tsx` (chat simulé, aucun appel serveur) et terminent sur
  `ComingSoonActions.tsx` — message honnête "pas encore actif", jamais un faux
  test qui ferait tourner la démo Commercial sous une autre étiquette.
- Accent couleur : mint (#6ee7a8) → cyan (#2ee6f5) partout (landing, hero
  Core3D inchangé structurellement, dashboard, hologramme).

## Tarifs & paiement (27/07/2026) — NON COMMITÉ
Bouton "Recruter — voir le tableau de bord" remplacé par **"Recruter mon
agent"** (`AgentActions.tsx`) → `/plans?tenant=&agent=` (3 formules) →
`/checkout?plan=` (récap + paiement). Grille tarifaire (`lib/plans.ts`,
officielle, ne pas modifier les prix/fonctionnalités sans redemander) :
Standard 499€, Professionnel 1999€ (mis en avant), Entreprise 9999€/mois.
Même grille remplace aussi les tarifs de la landing (`PlanCard.tsx` partagé).
**Aucun compte Stripe connecté** (utilisateur confirmé) : le bouton "Procéder
au paiement" (`CheckoutAction.tsx`) affiche un état honnête "pas encore actif"
au lieu de simuler un vrai encaissement. Prochaine étape quand Stripe sera
prêt : remplacer ce composant par un appel à une route API qui crée une vraie
session Stripe Checkout.
Dashboard (`/dashboard`) non supprimé — juste retiré de ce bouton précis,
toujours utilisé ailleurs (tasks, agent aperçu).

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
1. Commit + push de /plans + /checkout (voir section Tarifs & paiement)
2. Ouvrir un compte Stripe et brancher /checkout pour un vrai encaissement
3. Immatriculer l'entreprise → remplacer placeholders mentions légales
4. Signer DPA avec Supabase/Vercel/Google/Groq
5. AIPD (analyse d'impact RGPD) — obligatoire, traitement décisionnel auto

## Skill installé
`~/.claude/skills/runtime-optimizer` — mémoire projet compacte, extraction
gros collages, raisonnement multi-expert. Utiliser en début de session.

## Style de travail utilisateur
Mode caveman actif (réponses courtes). Fondateur non-technique par endroits,
demande souvent clarification avant d'agir. Budget tokens serré — éviter
relecture inutile d'historique, préférer vérifier le code directement.
